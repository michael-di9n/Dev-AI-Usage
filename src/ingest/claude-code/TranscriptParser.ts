import { CostCalculator } from "../../domain/PriceTable";
import { Normalizer, languageFromPath } from "../../domain/Normalizer";
import {
  ZERO_USAGE,
  DEFAULT_BLOCK_CHARS,
  type BlockKind, type EditRow, type MessageBlockRow, type MessageRow,
  type ParsedTranscript, type PromptRow,
  type SessionCostReport, type SessionRow, type TokenUsage,
  type ToolCallRow, type ToolResultPatch, type TurnRow,
} from "../../domain/types";

/** Edit-shaped tools. Their accept/reject decision is the acceptance metric. */
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/**
 * Claude Code emits these as the entire content of a rejected tool result.
 * Matched against the start of the result only - the same words appearing
 * inside a file that was read must not count as a rejection.
 */
const REJECTION_MARKERS = [
  "The user doesn't want to proceed with this tool use",
  "The user doesn't want to take this action",
  "The tool use was rejected",
  "Request interrupted by user",
];

interface Accumulator {
  session: SessionRow | null;
  messages: MessageRow[];
  toolCalls: ToolCallRow[];
  toolResults: ToolResultPatch[];
  turns: TurnRow[];
  prompts: PromptRow[];
  edits: EditRow[];
  costReports: SessionCostReport[];
  blocks: MessageBlockRow[];
  malformedLines: number;
}

/**
 * Turns transcript lines into rows. Pure: no filesystem, no clock, no database.
 *
 * That purity is the point - the transcript format is the one input we do not
 * control, so every field-mapping decision here is pinned by fixture tests
 * rather than discovered against a live 250MB corpus.
 */
export class TranscriptParser {
  constructor(
    private readonly costs: CostCalculator,
    private readonly normalizer: Normalizer,
    private readonly developerId: string,
    /**
     * Characters of block text to keep, or null to keep none at all.
     *
     * Null is what `DEV_AI_USAGE_TRACE_CHARS=off` becomes, and it means no
     * block rows are produced - so the switch is a real one, not a filter over
     * text already written to disk. Defaulted so no existing caller changes.
     */
    private readonly blockChars: number | null = DEFAULT_BLOCK_CHARS,
  ) {}

  parse(lines: Iterable<string>): ParsedTranscript {
    const acc: Accumulator = {
      session: null, messages: [], toolCalls: [], toolResults: [],
      turns: [], prompts: [], edits: [], costReports: [], blocks: [],
      malformedLines: 0,
    };

    for (const line of lines) {
      const record = parseJsonLine(line);
      // A transcript can end mid-write; that tail is re-read on the next pass.
      if (!record) { if (line.trim()) acc.malformedLines += 1; continue; }
      this.ingestRecord(record, acc);
    }
    return acc;
  }

  private ingestRecord(r: Rec, acc: Accumulator): void {
    switch (r.type) {
      case "assistant":  return this.ingestAssistant(r, acc);
      case "user":       return this.ingestUser(r, acc);
      case "system":     return this.ingestSystem(r, acc);
      case "cost-state": return this.ingestCostState(r, acc);
      default: return;
    }
  }

  private ingestAssistant(r: Rec, acc: Accumulator): void {
    this.rememberSession(r, acc);
    const message = obj(r.message);
    const uuid = str(r.uuid);
    if (!uuid) return;

    const usage = readUsage(obj(message?.usage));
    const model = str(message?.model);

    acc.messages.push({
      uuid,
      sessionId: str(r.sessionId) ?? "",
      parentUuid: str(r.parentUuid),
      role: "assistant",
      model,
      ts: str(r.timestamp) ?? "",
      effort: str(r.effort),
      isSidechain: r.isSidechain === true,
      requestId: str(r.requestId),
      usage,
      serviceTier: str(obj(message?.usage)?.service_tier),
      stopReason: str(message?.stop_reason),
      costUsdDerived: this.costs.costOf(model, usage),
    });

    // `seq` counts every block, including kinds nothing is captured for,
    // because it is half of message_block's primary key: a row's identity must
    // not shift if the capture rules change later.
    let seq = 0;
    for (const block of arr(message?.content)) {
      const b = obj(block);
      if (b?.type === "tool_use") this.ingestToolUse(b, r, uuid, acc);
      if (b) this.captureAssistantBlock(b, r, uuid, seq, acc);
      seq += 1;
    }
  }

  /**
   * The text half of an assistant block, for the trace page.
   *
   * Separate from `ingestToolUse` because the two want different things from
   * the same block: that one stores the input's *shape*, normalised so two
   * calls can be compared, and this one stores what was actually sent.
   */
  private captureAssistantBlock(
    b: Rec, r: Rec, messageUuid: string, seq: number, acc: Accumulator,
  ): void {
    switch (b.type) {
      case "tool_use":
        return this.captureBlock(acc, r, messageUuid, seq, "assistant", "tool_use",
          JSON.stringify(obj(b.input) ?? {}), str(b.id), str(b.name));
      case "text":
        return this.captureBlock(acc, r, messageUuid, seq, "assistant", "text",
          str(b.text) ?? "", null, null);
      case "thinking":
        // Claude Code writes the signature and blanks the text - 4,858 blocks
        // measured across versions 2.1.126 to 2.1.261, not one with a single
        // character in it. The row is kept anyway: thinking happened, and
        // `message.thinking_tokens` is a real number the page can show beside
        // an honest "not recorded". A skipped row could not say that.
        return this.captureBlock(acc, r, messageUuid, seq, "assistant", "thinking",
          str(b.thinking) ?? "", null, null);
      default:
        return;
    }
  }

  /**
   * The only place transcript text is kept, so the cap is enforced once.
   *
   * `charLen` is the length before capping, always. The page needs both halves
   * to tell "showing the first 2,000 of 45,976" apart from "this really was
   * empty", and only the second of those is true of thinking.
   */
  private captureBlock(
    acc: Accumulator, r: Rec, messageUuid: string, seq: number,
    role: "assistant" | "user", kind: BlockKind,
    text: string, toolUseId: string | null, toolName: string | null,
  ): void {
    if (this.blockChars === null) return;
    acc.blocks.push({
      messageUuid, seq,
      sessionId: str(r.sessionId) ?? "",
      role, kind,
      ts: str(r.timestamp) ?? "",
      toolUseId, toolName,
      content: text.slice(0, this.blockChars),
      charLen: text.length,
    });
  }

  private ingestToolUse(block: Rec, r: Rec, messageUuid: string, acc: Accumulator): void {
    const id = str(block.id);
    const toolName = str(block.name);
    if (!id || !toolName) return;

    const input = obj(block.input) ?? {};
    const inputNorm = this.normalizeToolInput(toolName, input);
    const ts = str(r.timestamp) ?? "";
    const sessionId = str(r.sessionId) ?? "";

    acc.toolCalls.push({
      id, sessionId, messageUuid, toolName, ts,
      inputHash: this.normalizer.hash(`${toolName} ${inputNorm}`),
      inputNorm,
      resultBytes: null, isError: false, isRejected: false, interrupted: false,
      durationMs: null,
    });

    if (!EDIT_TOOLS.has(toolName)) return;
    const filePath = str(input.file_path) ?? str(input.notebook_path) ?? "";
    // The edit shares the tool_use id so one result patch can reach both rows.
    acc.edits.push({
      id, sessionId, ts, filePath,
      language: languageFromPath(filePath),
      linesAdded: countAuthoredLines(toolName, input),
      linesRemoved: 0,
      decision: "undecided",
    });
  }

  /**
   * Bash is compared by command shape, so its paths and numbers are collapsed.
   * A file path or a search pattern is the opposite case: the exact value *is*
   * the identity, and collapsing it makes two different files look like one
   * file read twice. So targets pass through untouched.
   */
  private normalizeToolInput(toolName: string, input: Rec): string {
    if (toolName === "Bash") return this.normalizer.normalizeCommand(str(input.command) ?? "");
    const target = str(input.file_path) ?? str(input.notebook_path) ?? str(input.pattern);
    return target ?? this.normalizer.normalizeCommand(JSON.stringify(input));
  }

  private ingestUser(r: Rec, acc: Accumulator): void {
    this.rememberSession(r, acc);
    const toolResult = obj(r.toolUseResult);
    const message = obj(r.message);

    const uuid = str(r.uuid) ?? "";
    let seq = 0;
    for (const block of arr(message?.content)) {
      const b = obj(block);
      if (b?.type !== "tool_result") { seq += 1; continue; }
      const toolUseId = str(b.tool_use_id);
      const text = resultText(b.content);
      // Captured before the id guard: a result with no tool_use_id joins to
      // nothing, but it is still what came back, and the page can show it.
      this.captureBlock(acc, r, uuid, seq, "user", "tool_result", text, toolUseId, null);
      seq += 1;
      if (!toolUseId) continue;
      acc.toolResults.push({
        toolUseId,
        // The uncapped truth, deliberately: this is a measurement, and the
        // block row beside it is a display copy that may have been cut.
        resultBytes: text.length,
        isError: b.is_error === true || hasStderr(toolResult),
        isRejected: isRejection(text),
        interrupted: toolResult?.interrupted === true,
      });
    }

    // A prompt is a user record with no tool result and no injected context.
    if (toolResult || r.isMeta === true) return;
    const text = plainText(message?.content);
    // Claude Code writes its interrupt notice into a user record too. It is a
    // marker, not something anyone typed, and counting it clusters "you
    // interrupted the model" as an instruction you keep repeating.
    if (!text || isRejection(text)) return;
    // Verbatim, beside the normalised copy below. `text_norm` is lowercased
    // with paths and numbers collapsed so two prompts can be compared; a trace
    // has to show what was typed. Stored at seq 0 - safe from collision
    // because the loop above captures only tool_result blocks, and a record
    // carrying one of those has already returned by here.
    this.captureBlock(acc, r, uuid, 0, "user", "prompt", text, null, null);

    const norm = this.normalizer.normalizePrompt(text);
    acc.prompts.push({
      id: str(r.uuid) ?? this.normalizer.hash(`${str(r.sessionId)}${str(r.timestamp)}`),
      sessionId: str(r.sessionId) ?? "",
      ts: str(r.timestamp) ?? "",
      textHash: this.normalizer.hash(norm),
      textNorm: norm,
      charLen: text.length,
    });
  }

  private ingestSystem(r: Rec, acc: Accumulator): void {
    if (r.subtype !== "turn_duration") return;
    acc.turns.push({
      sessionId: str(r.sessionId) ?? "",
      ts: str(r.timestamp) ?? "",
      durationMs: num(r.durationMs) ?? 0,
      messageCount: num(r.messageCount) ?? 0,
    });
  }

  private ingestCostState(r: Rec, acc: Accumulator): void {
    const sessionId = str(r.sessionId);
    if (!sessionId) return;

    const perModel: SessionCostReport["perModel"] = {};
    for (const [model, raw] of Object.entries(obj(r.modelUsage) ?? {})) {
      const m = obj(raw);
      if (!m) continue;
      perModel[model] = {
        costUsd: num(m.costUSD) ?? 0,
        usage: {
          ...ZERO_USAGE,
          inputTokens: num(m.inputTokens) ?? 0,
          outputTokens: num(m.outputTokens) ?? 0,
          cacheReadTokens: num(m.cacheReadInputTokens) ?? 0,
          // cost-state totals the two cache TTLs into one figure; only the
          // per-message records distinguish them, so leave the split to those.
          cacheCreate5mTokens: num(m.cacheCreationInputTokens) ?? 0,
        },
      };
    }

    acc.costReports.push({
      sessionId,
      totalCostUsd: num(r.totalCostUSD) ?? 0,
      apiDurationMs: num(r.totalAPIDuration) ?? 0,
      wallDurationMs: num(r.totalDuration) ?? 0,
      toolDurationMs: num(r.totalToolDuration) ?? 0,
      linesAdded: num(r.totalLinesAdded) ?? 0,
      linesRemoved: num(r.totalLinesRemoved) ?? 0,
      perModel,
    });
  }

  private rememberSession(r: Rec, acc: Accumulator): void {
    const sessionId = str(r.sessionId);
    const ts = str(r.timestamp);
    if (!sessionId) return;

    if (!acc.session) {
      acc.session = {
        sessionId, developerId: this.developerId, tool: "claude-code",
        projectPath: str(r.cwd), gitBranch: str(r.gitBranch),
        startedAt: ts, endedAt: ts,
        agentVersion: str(r.version), entrypoint: str(r.entrypoint),
      };
      return;
    }
    if (ts && (!acc.session.endedAt || ts > acc.session.endedAt)) acc.session.endedAt = ts;
    if (ts && (!acc.session.startedAt || ts < acc.session.startedAt)) acc.session.startedAt = ts;
  }
}

// ---------------------------------------------------------------------------
// Shape helpers. The transcript is untyped JSON from a tool we do not control,
// so every read is defensive and an unexpected field never throws.
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function parseJsonLine(line: string): Rec | null {
  if (!line.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Rec)
      : null;
  } catch {
    return null;
  }
}

const obj = (v: unknown): Rec | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const hasStderr = (toolResult: Rec | null): boolean =>
  typeof toolResult?.stderr === "string" && toolResult.stderr.trim().length > 0;

function readUsage(usage: Rec | null): TokenUsage {
  if (!usage) return { ...ZERO_USAGE };
  const creation = obj(usage.cache_creation);
  const total = num(usage.cache_creation_input_tokens) ?? 0;
  const oneHour = num(creation?.ephemeral_1h_input_tokens) ?? 0;
  const fiveMin = num(creation?.ephemeral_5m_input_tokens);
  return {
    inputTokens: num(usage.input_tokens) ?? 0,
    outputTokens: num(usage.output_tokens) ?? 0,
    cacheReadTokens: num(usage.cache_read_input_tokens) ?? 0,
    // Older records carry only the total. Attribute the remainder to the 5m
    // rate, the cheaper of the two, so an unknown split never overstates cost.
    cacheCreate5mTokens: fiveMin ?? Math.max(total - oneHour, 0),
    cacheCreate1hTokens: oneHour,
    thinkingTokens: num(obj(usage.output_tokens_details)?.thinking_tokens) ?? 0,
  };
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  return arr(content)
    .map((block) => str(obj(block)?.text) ?? "")
    .join("\n");
}

function plainText(content: unknown): string {
  if (typeof content === "string") return content;
  return arr(content)
    .map((block) => (obj(block)?.type === "text" ? (str(obj(block)?.text) ?? "") : ""))
    .filter(Boolean)
    .join("\n");
}

export function isRejection(text: string): boolean {
  // Some of these arrive bracketed and some bare, and the bracketed forms vary
  // in what follows ("...by user]" vs "...by user for tool use]"). Dropping a
  // leading bracket lets one prefix cover every spelling.
  const trimmed = text.trim().replace(/^\[/, "");
  return REJECTION_MARKERS.some((marker) => trimmed.startsWith(marker));
}

function countAuthoredLines(toolName: string, input: Rec): number {
  const countOf = (v: unknown) => (typeof v === "string" ? v.split("\n").length : 0);
  if (toolName === "Write") return countOf(input.content);
  if (toolName === "NotebookEdit") return countOf(input.new_source);
  if (toolName === "Edit") return countOf(input.new_string);
  if (toolName === "MultiEdit") {
    return arr(input.edits).reduce<number>((sum, e) => sum + countOf(obj(e)?.new_string), 0);
  }
  return 0;
}
