import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CostCalculator, PriceTable, type PriceTableFile } from "../src/domain/PriceTable";
import { Normalizer } from "../src/domain/Normalizer";
import { TranscriptParser } from "../src/ingest/claude-code/TranscriptParser";

const PRICES_PATH = join(process.cwd(), "prices/models.json");

export function priceTable(): PriceTable {
  return PriceTable.fromFile(JSON.parse(readFileSync(PRICES_PATH, "utf8")) as PriceTableFile);
}

export function parser(developerId = "test", blockChars?: number | null): TranscriptParser {
  return new TranscriptParser(
    new CostCalculator(priceTable()), new Normalizer(), developerId,
    // `undefined` keeps the parser's own default, so existing callers are unchanged.
    ...(blockChars === undefined ? [] : [blockChars]) as [number | null],
  );
}

/** Assistant record with usage, matching the real transcript field names. */
export function assistantLine(over: {
  uuid: string;
  sessionId?: string;
  ts?: string;
  model?: string;
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheCreate5m?: number;
  cacheCreate1h?: number;
  thinking?: number;
  toolUses?: { id: string; name: string; input: Record<string, unknown> }[];
  isSidechain?: boolean;
  cwd?: string;
  /** Assistant prose blocks, in order, before the tool_use blocks. */
  texts?: string[];
  /**
   * Thinking block bodies. Real transcripts always carry "" here - the empty
   * string is the case worth pinning, so it has to be expressible.
   */
  thinkingTexts?: string[];
}): string {
  return JSON.stringify({
    type: "assistant",
    uuid: over.uuid,
    parentUuid: null,
    sessionId: over.sessionId ?? "s1",
    timestamp: over.ts ?? "2026-09-01T10:00:00.000Z",
    cwd: over.cwd ?? "/repo",
    gitBranch: "main",
    version: "2.1.258",
    entrypoint: "cli",
    isSidechain: over.isSidechain ?? false,
    requestId: `req_${over.uuid}`,
    effort: "high",
    message: {
      id: `msg_${over.uuid}`,
      role: "assistant",
      model: over.model ?? "claude-opus-5",
      stop_reason: "end_turn",
      content: [
        ...(over.thinkingTexts ?? []).map((t) => ({
          type: "thinking", thinking: t, signature: "CAISygIK",
        })),
        ...(over.texts ?? []).map((t) => ({ type: "text", text: t })),
        ...(over.toolUses ?? []).map((t) => ({
          type: "tool_use",
          id: t.id,
          name: t.name,
          input: t.input,
        })),
      ],
      usage: {
        input_tokens: over.input ?? 0,
        output_tokens: over.output ?? 0,
        cache_read_input_tokens: over.cacheRead ?? 0,
        cache_creation_input_tokens: (over.cacheCreate5m ?? 0) + (over.cacheCreate1h ?? 0),
        cache_creation: {
          ephemeral_5m_input_tokens: over.cacheCreate5m ?? 0,
          ephemeral_1h_input_tokens: over.cacheCreate1h ?? 0,
        },
        output_tokens_details: { thinking_tokens: over.thinking ?? 0 },
        service_tier: "standard",
      },
    },
  });
}

export function toolResultLine(over: {
  toolUseId: string;
  sessionId?: string;
  ts?: string;
  text?: string;
  isError?: boolean;
  stderr?: string;
  interrupted?: boolean;
}): string {
  return JSON.stringify({
    type: "user",
    uuid: `u_${over.toolUseId}`,
    sessionId: over.sessionId ?? "s1",
    timestamp: over.ts ?? "2026-09-01T10:00:01.000Z",
    toolUseResult: {
      stdout: over.isError ? "" : (over.text ?? "ok"),
      stderr: over.stderr ?? "",
      interrupted: over.interrupted ?? false,
    },
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: over.toolUseId,
          is_error: over.isError ?? false,
          content: over.text ?? "ok",
        },
      ],
    },
  });
}

export function promptLine(text: string, over: { sessionId?: string; ts?: string; uuid?: string } = {}): string {
  return JSON.stringify({
    type: "user",
    uuid: over.uuid ?? `p_${text.slice(0, 8)}`,
    sessionId: over.sessionId ?? "s1",
    timestamp: over.ts ?? "2026-09-01T09:59:00.000Z",
    message: { role: "user", content: text },
  });
}

export function turnLine(durationMs: number, over: { sessionId?: string; ts?: string } = {}): string {
  return JSON.stringify({
    type: "system",
    subtype: "turn_duration",
    sessionId: over.sessionId ?? "s1",
    timestamp: over.ts ?? "2026-09-01T10:05:00.000Z",
    durationMs,
    messageCount: 12,
  });
}

/**
 * An OTLP/JSON traces payload, in the nesting the exporter really sends:
 * resourceSpans -> scopeSpans -> spans, with session.id at the resource level.
 */
export function spanPayload(spans: {
  traceId?: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startNano?: string;
  endNano?: string;
  attrs?: Record<string, string>;
}[], sessionId = "s1"): unknown {
  return {
    resourceSpans: [{
      resource: {
        attributes: [{ key: "session.id", value: { stringValue: sessionId } }],
      },
      scopeSpans: [{
        spans: spans.map((s) => ({
          traceId: s.traceId ?? "t1",
          spanId: s.spanId,
          parentSpanId: s.parentSpanId ?? "",
          name: s.name,
          startTimeUnixNano: s.startNano ?? "1757000000000000000",
          endTimeUnixNano: s.endNano ?? "1757000000250000000",
          status: { code: "STATUS_CODE_UNSET" },
          attributes: Object.entries(s.attrs ?? {}).map(([key, value]) => ({
            key, value: { stringValue: value },
          })),
        })),
      }],
    }],
  };
}
