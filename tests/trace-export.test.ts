import { describe, expect, it } from "vitest";
import { buildTrace } from "../src/domain/traceTree";
import {
  TRACE_FORMAT,
  TRACE_FORMAT_VERSION,
  traceExport,
  traceFilename,
} from "../src/domain/traceExport";
import type { TraceBlockRow, TraceMessageRow, TraceSpanRow } from "../src/domain/types";

/**
 * The export is a promise to whoever writes a reader for it, so these pin the
 * shape rather than the rendering: a field silently renamed here breaks
 * somebody's script with no error anywhere.
 */

const SESSION = {
  id: "sess-abcdef12",
  projectPath: "/repo",
  startedAt: "2026-09-06T10:00:00.000Z",
  endedAt: "2026-09-06T10:05:00.000Z",
  blocks: 3,
};

const message = (over: Partial<TraceMessageRow> = {}): TraceMessageRow => ({
  uuid: "m1", parentUuid: null, role: "assistant", model: "claude-opus-5",
  ts: "2026-09-06T10:00:00.000Z", isSidechain: false, requestId: null,
  inputTokens: 10, outputTokens: 5, thinkingTokens: 0, stopReason: null, costUsd: null,
  ...over,
});

const block = (over: Partial<TraceBlockRow> = {}): TraceBlockRow => ({
  messageUuid: "m1", seq: 0, kind: "prompt", ts: "2026-09-06T10:00:00.000Z",
  toolUseId: null, toolName: null, content: "hello", charLen: 5,
  ...over,
});

const treeOf = (blocks: TraceBlockRow[], spans: TraceSpanRow[] = []) =>
  buildTrace({
    messages: [message()],
    blocks,
    toolDurations: new Map(),
    toolNames: new Map(),
    spans,
  });

describe("traceExport", () => {
  it("names and versions itself, so a reader can tell what it is holding", () => {
    const doc = traceExport(SESSION, treeOf([block()]), new Date("2026-09-06T12:00:00.000Z"));

    expect(doc.format).toBe(TRACE_FORMAT);
    expect(doc.version).toBe(TRACE_FORMAT_VERSION);
    expect(doc.exportedAt).toBe("2026-09-06T12:00:00.000Z");
    expect(doc.session).toEqual(SESSION);
  });

  it("carries the run as a nested tree rather than a flat list", () => {
    const doc = traceExport(
      SESSION,
      treeOf([
        block({ seq: 0, kind: "prompt", content: "do the thing" }),
        block({ seq: 1, kind: "tool_use", toolUseId: "t1", toolName: "Read", content: "{}" }),
      ]),
    );

    expect(doc.run.length).toBeGreaterThan(0);
    expect(Array.isArray(doc.run[0]!.children)).toBe(true);
  });

  it("keeps a missing duration null, and never rounds it to zero", () => {
    // The whole rule this project exists for. A reader that sees 0 here would
    // report a tool call that took no time, which nobody measured.
    const doc = traceExport(SESSION, treeOf([block()]));

    const durations: (number | null)[] = [];
    const walk = (nodes: typeof doc.run): void => {
      for (const n of nodes) { durations.push(n.durationMs); walk(n.children); }
    };
    walk(doc.run);

    expect(durations.length).toBeGreaterThan(0);
    expect(durations.every((d) => d === null || d > 0)).toBe(true);
  });

  it("states truncation rather than leaving it to be derived", () => {
    const doc = traceExport(
      SESSION,
      treeOf([block({ kind: "tool_result", toolUseId: "t1", content: "abc", charLen: 900 })]),
    );

    const cut: boolean[] = [];
    const walk = (nodes: typeof doc.run): void => {
      for (const n of nodes) { if (n.charLen !== null) cut.push(n.truncated); walk(n.children); }
    };
    walk(doc.run);

    expect(cut, "a body shorter than its charLen is a cut body").toContain(true);
  });

  it("keeps facts as an ordered list, because two may share a label", () => {
    const doc = traceExport(SESSION, treeOf([block()]));
    const facts = doc.run[0]!.facts;

    expect(Array.isArray(facts)).toBe(true);
    for (const fact of facts) {
      expect(typeof fact.label).toBe("string");
      expect(typeof fact.value).toBe("string");
    }
  });

  it("carries spans nothing claimed, so work that happened does not vanish", () => {
    const orphan: TraceSpanRow = {
      spanId: "s1", parentSpanId: null, name: "claude_code.tool",
      toolUseId: "nobody", requestId: null,
      startedAt: "2026-09-06T10:01:00.000Z", durationMs: 120,
    };
    const doc = traceExport(SESSION, treeOf([block()], [orphan]));

    expect(doc.summary.unjoinedSpans).toBe(doc.unjoined.length);
    expect(doc.unjoined).toEqual([{ name: "claude_code.tool", durationMs: 120 }]);
  });

  it("survives a round trip through JSON unchanged", () => {
    const doc = traceExport(SESSION, treeOf([block()]));
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });
});

describe("traceFilename", () => {
  it("names the file by the id the page shows, so two runs cannot collide", () => {
    expect(traceFilename("sess-abcdef12", "2026-09-06T10:05:00.000Z"))
      .toBe("trace-2026-09-06-sess-abc.json");
    expect(traceFilename("other-11111111", "2026-09-06T10:05:00.000Z"))
      .not.toBe(traceFilename("sess-abcdef12", "2026-09-06T10:05:00.000Z"));
  });
});
