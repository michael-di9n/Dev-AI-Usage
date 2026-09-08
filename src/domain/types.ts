/**
 * The vocabulary every layer shares. Kept free of I/O and framework types so
 * parsers, detectors and the UI can all depend on it without depending on
 * each other.
 */

export type ToolKind = "claude-code" | "cursor";

/** Token counts as reported by the API. Names mirror the wire format so a
 *  reader can diff them against a raw transcript without a translation table. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreate5mTokens: number;
  cacheCreate1hTokens: number;
  thinkingTokens: number;
}

export const ZERO_USAGE: Readonly<TokenUsage> = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreate5mTokens: 0,
  cacheCreate1hTokens: 0,
  thinkingTokens: 0,
});

export interface SessionRow {
  sessionId: string;
  developerId: string;
  tool: ToolKind;
  projectPath: string | null;
  gitBranch: string | null;
  startedAt: string | null;
  endedAt: string | null;
  agentVersion: string | null;
  entrypoint: string | null;
}

export interface MessageRow {
  uuid: string;
  sessionId: string;
  parentUuid: string | null;
  role: "assistant" | "user";
  model: string | null;
  ts: string;
  effort: string | null;
  isSidechain: boolean;
  requestId: string | null;
  usage: TokenUsage;
  serviceTier: string | null;
  stopReason: string | null;
  /** null when the model is absent from the price table - see CostCalculator. */
  costUsdDerived: number | null;
}

export interface ToolCallRow {
  id: string;
  sessionId: string;
  messageUuid: string;
  toolName: string;
  ts: string;
  /** Stable hash of the normalised input: the join key for repetition mining. */
  inputHash: string;
  inputNorm: string;
  resultBytes: number | null;
  isError: boolean;
  isRejected: boolean;
  interrupted: boolean;
  /** Only the PostToolUse hook can supply this; null until exercise 02 is done. */
  durationMs: number | null;
}

export interface TurnRow {
  sessionId: string;
  ts: string;
  durationMs: number;
  messageCount: number;
}

export interface PromptRow {
  id: string;
  sessionId: string;
  ts: string;
  textHash: string;
  textNorm: string;
  charLen: number;
}

/**
 * What one content block of one message actually said.
 *
 * The rest of this file keeps counts; this keeps text, and it is the only row
 * type here that does. It exists because `tool_call.inputNorm` is deliberately
 * lossy - it collapses paths to `<path>` and numbers to `<n>` so two calls can
 * be compared - and a trace has to show what was really sent, not its shape.
 *
 * `charLen` is always the TRUE length, before `content` was capped. So
 * `charLen > content.length` means truncated and the page says by how much,
 * while `charLen === 0` with empty content means measured-empty. Two facts, no
 * ambiguous third state - which matters most for thinking, where the empty
 * string is what Claude Code genuinely wrote.
 */
export interface MessageBlockRow {
  messageUuid: string;
  /**
   * Index within the message's content array, counting blocks of every kind -
   * including ones nothing is captured for. Half of the primary key, so a
   * row's identity must not shift if the capture rules change later.
   */
  seq: number;
  sessionId: string;
  role: "assistant" | "user";
  kind: BlockKind;
  ts: string;
  /** Set on `tool_use` and `tool_result`: the join between a call and its result. */
  toolUseId: string | null;
  /** Set on `tool_use` only, so a row can label itself without a second query. */
  toolName: string | null;
  content: string;
  charLen: number;
}

export type BlockKind = "prompt" | "thinking" | "text" | "tool_use" | "tool_result";

/**
 * Characters of block text kept per row, by default.
 *
 * Measured over the whole on-disk corpus: tool inputs average 1,423 characters
 * and results 1,044, so 2,000 holds the large majority of both whole while
 * keeping about half of every character ever written. It is also roughly fifty
 * lines, which is about as much as a tree row can show before the page stops
 * being a tree and becomes a file viewer.
 *
 * Here rather than in the parser because `config.ts` needs the same number to
 * decide what `DEV_AI_USAGE_TRACE_CHARS` falls back to, and two copies of a
 * default is how they drift.
 */
export const DEFAULT_BLOCK_CHARS = 2000;

/**
 * The rows one session's trace is built from.
 *
 * Here rather than beside the queries that load them because `traceTree.ts` is
 * pure domain code and may not depend on `src/db`. The read repository imports
 * these instead, which is the direction this project's layers run in.
 */
export interface TraceMessageRow {
  uuid: string;
  parentUuid: string | null;
  role: string;
  model: string | null;
  ts: string;
  isSidechain: boolean;
  requestId: string | null;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  stopReason: string | null;
  /** Null for an unpriced model. Never coalesced to zero on the way out. */
  costUsd: number | null;
}

export interface TraceBlockRow {
  messageUuid: string;
  seq: number;
  kind: string;
  ts: string;
  toolUseId: string | null;
  toolName: string | null;
  content: string;
  charLen: number;
}

export interface TraceSpanRow {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  toolUseId: string | null;
  requestId: string | null;
  startedAt: string;
  /** Null when the receiver could not measure it. Never zero for "unknown". */
  durationMs: number | null;
}

export interface EditRow {
  id: string;
  sessionId: string;
  ts: string;
  filePath: string;
  language: string;
  linesAdded: number;
  linesRemoved: number;
  decision: "accepted" | "rejected" | "undecided";
}

/** Ground truth emitted by newer Claude Code versions. Only ~15% of sessions
 *  carry it, so it validates the price table rather than replacing it. */
export interface SessionCostReport {
  sessionId: string;
  totalCostUsd: number;
  apiDurationMs: number;
  wallDurationMs: number;
  toolDurationMs: number;
  linesAdded: number;
  linesRemoved: number;
  perModel: Record<string, { usage: TokenUsage; costUsd: number }>;
}

/**
 * A tool result arrives many lines after its tool_use, and incremental ingest
 * may read the two halves in different passes. So results travel as patches
 * keyed by tool_use id rather than being merged in the parser.
 */
export interface ToolResultPatch {
  toolUseId: string;
  resultBytes: number;
  isError: boolean;
  isRejected: boolean;
  interrupted: boolean;
}

/** What a transcript file yields. One value object, so the parser can stay pure. */
export interface ParsedTranscript {
  session: SessionRow | null;
  messages: MessageRow[];
  toolCalls: ToolCallRow[];
  toolResults: ToolResultPatch[];
  turns: TurnRow[];
  prompts: PromptRow[];
  edits: EditRow[];
  costReports: SessionCostReport[];
  /** Empty when trace text is switched off; see `TranscriptParser`'s blockChars. */
  blocks: MessageBlockRow[];
  malformedLines: number;
}

/**
 * One spooled hook payload.
 *
 * `ts` is null when the line predates bin/hook-spool.mjs stamping `spooled_at`.
 * A hook payload carries no time of its own, so there is nothing to fall back
 * to and nothing worth inventing.
 */
export interface HookEventRow {
  id: string;
  event: string;
  ts: string | null;
  sessionId: string | null;
  toolName: string | null;
  attrs: Record<string, unknown>;
}

/**
 * One finding, from any rule family.
 *
 * `scopeId` is whatever the scope names - a session id, a project path - and
 * `evidence` is whatever the rule chose to show for itself. Neither is
 * interpreted here, which is what lets one table and one renderer serve
 * families that measure completely different things.
 */
export interface Signal {
  kind: string;
  severity: "info" | "warn" | "high";
  scope: "session" | "project" | "day" | "global";
  scopeId: string;
  date: string | null;
  evidence: Record<string, unknown>;
}
