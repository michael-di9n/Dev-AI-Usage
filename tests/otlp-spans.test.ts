import { describe, expect, it } from "vitest";
import { Db } from "../src/db/Database";
import { OtlpDecoder } from "../src/ingest/otlp/OtlpDecoder";
import { OtelWriter } from "../src/ingest/otlp/OtelWriter";
import { spanPayload } from "./factories";

/**
 * The traces half of the receiver.
 *
 * The wire format is not ours, so every mapping here is pinned against a
 * payload shaped the way the exporter really sends one rather than discovered
 * against a live collector.
 */
describe("OtlpDecoder.decodeSpans", () => {
  it("walks resourceSpans -> scopeSpans -> spans and merges resource attributes", () => {
    const spans = new OtlpDecoder().decodeSpans(
      spanPayload([{ spanId: "s01", name: "claude_code.interaction" }], "sess-9"),
    );

    expect(spans).toHaveLength(1);
    expect(spans[0]!.name).toBe("claude_code.interaction");
    // session.id sits on the resource, not the span, and has to reach the row.
    expect(spans[0]!.sessionId).toBe("sess-9");
  });

  it("reads tool_use_id, so a span can find the tool call it describes", () => {
    const [span] = new OtlpDecoder().decodeSpans(
      spanPayload([{
        spanId: "s02", name: "claude_code.tool",
        attrs: { tool_use_id: "toolu_42", tool_name: "Read" },
      }]),
    );

    expect(span!.toolUseId).toBe("toolu_42");
    expect(span!.attrs.tool_name).toBe("Read");
  });

  it("treats an empty parentSpanId as a root, not as a parent named ''", () => {
    const [root] = new OtlpDecoder().decodeSpans(
      spanPayload([{ spanId: "s03", name: "claude_code.interaction", parentSpanId: "" }]),
    );

    expect(root!.parentSpanId).toBeNull();
  });

  it("measures a duration from the nano timestamps", () => {
    const [span] = new OtlpDecoder().decodeSpans(
      spanPayload([{
        spanId: "s04", name: "claude_code.tool",
        startNano: "1757000000000000000", endNano: "1757000001500000000",
      }]),
    );

    expect(span!.durationMs).toBe(1_500);
  });

  /**
   * The one this file exists for. `nanosToIso` answers the epoch for input it
   * cannot read, and epoch minus epoch is a very convincing zero - which would
   * put "0 ms" on a page where the honest answer is an em dash.
   */
  it("returns a null duration, never zero, when a timestamp is unusable", () => {
    const decoder = new OtlpDecoder();

    for (const broken of [{ endNano: "" }, { endNano: "not-a-number" }, { startNano: "" }]) {
      const [span] = decoder.decodeSpans(
        spanPayload([{ spanId: "s05", name: "claude_code.tool", ...broken }]),
      );
      expect(span!.durationMs).toBeNull();
      expect(span!.durationMs).not.toBe(0);
    }
  });

  it("drops a span with no id rather than storing it keyless", () => {
    const spans = new OtlpDecoder().decodeSpans({
      resourceSpans: [{ scopeSpans: [{ spans: [{ name: "claude_code.tool" }] }] }],
    });

    expect(spans).toEqual([]);
  });

  it("survives a payload of the wrong shape entirely", () => {
    const decoder = new OtlpDecoder();
    expect(decoder.decodeSpans(null)).toEqual([]);
    expect(decoder.decodeSpans({ resourceSpans: "nonsense" })).toEqual([]);
  });
});

describe("OtelWriter.writeSpans", () => {
  const freshDb = (): Db => Db.openMigrated(":memory:");

  it("stores a span and finds it again by session", () => {
    const db = freshDb();
    const decoder = new OtlpDecoder();
    new OtelWriter(db).writeSpans(decoder.decodeSpans(
      spanPayload([{ spanId: "s10", name: "claude_code.tool" }], "sess-1"),
    ));

    const rows = db.all<{ span_id: string }>("SELECT span_id FROM otel_span WHERE session_id = ?", ["sess-1"]);
    expect(rows.map((r) => r.span_id)).toEqual(["s10"]);
    db.close();
  });

  /** OTLP retries on any network hiccup; the same export must not double-count. */
  it("is idempotent, so a retried export lands on the same row", () => {
    const db = freshDb();
    const writer = new OtelWriter(db);
    const payload = spanPayload([{ spanId: "s11", name: "claude_code.llm_request" }]);

    writer.writeSpans(new OtlpDecoder().decodeSpans(payload));
    writer.writeSpans(new OtlpDecoder().decodeSpans(payload));

    expect(db.one<{ c: number }>("SELECT COUNT(*) AS c FROM otel_span")!.c).toBe(1);
    db.close();
  });

  it("keeps two spans that share an id across different traces", () => {
    const db = freshDb();
    new OtelWriter(db).writeSpans(new OtlpDecoder().decodeSpans({
      resourceSpans: [{
        scopeSpans: [{
          spans: [
            { traceId: "tA", spanId: "same", name: "claude_code.tool", startTimeUnixNano: "1", endTimeUnixNano: "2" },
            { traceId: "tB", spanId: "same", name: "claude_code.tool", startTimeUnixNano: "1", endTimeUnixNano: "2" },
          ],
        }],
      }],
    }));

    expect(db.one<{ c: number }>("SELECT COUNT(*) AS c FROM otel_span")!.c).toBe(2);
    db.close();
  });

  /** Traces can be the only signal switched on, so Setup must still answer. */
  it("counts towards lastSeenAt even when no metric or event ever arrived", () => {
    const db = freshDb();
    const writer = new OtelWriter(db);
    expect(writer.lastSeenAt()).toBeNull();

    writer.writeSpans(new OtlpDecoder().decodeSpans(
      spanPayload([{ spanId: "s12", name: "claude_code.interaction" }]),
    ));

    expect(writer.lastSeenAt()).not.toBeNull();
    db.close();
  });
});
