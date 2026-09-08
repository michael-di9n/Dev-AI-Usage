import type { Db } from "./Database";
import type {
  EditRow, HookEventRow, MessageBlockRow, MessageRow, ParsedTranscript, PromptRow,
  SessionCostReport, SessionRow, Signal, ToolCallRow, ToolResultPatch, TurnRow,
} from "../domain/types";

export interface IngestCursor {
  size: number;
  mtimeMs: number;
  bytesConsumed: number;
}

const B = (v: boolean) => (v ? 1 : 0);

/**
 * Owns every write path. Writes use INSERT OR IGNORE against natural keys, so
 * callers never have to ask "have I seen this already" - re-ingest is idempotent
 * by construction rather than by convention.
 */
export class IngestRepository {
  constructor(private readonly db: Db) {}

  /** Signals are fully re-derived each run, never accumulated: a changed
   *  threshold or a new rule must not leave last week's conclusions sitting in
   *  the table beside this week's. Scoped by kind so one family's pass cannot
   *  wipe another's findings. */
  clearSignals(kinds: string[]): void {
    for (const kind of kinds) this.db.run("DELETE FROM signal WHERE kind = ?", [kind]);
  }

  saveTranscript(parsed: ParsedTranscript): void {
    if (parsed.session) this.saveSession(parsed.session);
    parsed.messages.forEach((m) => this.saveMessage(m));
    parsed.toolCalls.forEach((t) => this.saveToolCall(t));
    parsed.edits.forEach((e) => this.saveEdit(e));
    parsed.toolResults.forEach((r) => this.applyToolResult(r));
    parsed.turns.forEach((t) => this.saveTurn(t));
    parsed.prompts.forEach((p) => this.savePrompt(p));
    parsed.costReports.forEach((c) => this.saveCostReport(c));
    parsed.blocks.forEach((b) => this.saveBlock(b));
  }

  saveSession(s: SessionRow): void {
    // A session spans many appends; later reads carry the fuller picture, so
    // upsert the mutable fields rather than ignoring the row.
    this.db.run(
      `INSERT INTO session (session_id, developer_id, tool, project_path, git_branch,
                            started_at, ended_at, agent_version, entrypoint)
       VALUES (?,?,?,?,?,?,?,?,?)
       ON CONFLICT(session_id) DO UPDATE SET
         ended_at = MAX(COALESCE(excluded.ended_at, ''), COALESCE(session.ended_at, '')),
         started_at = MIN(COALESCE(session.started_at, excluded.started_at), COALESCE(excluded.started_at, session.started_at)),
         agent_version = COALESCE(excluded.agent_version, session.agent_version),
         git_branch = COALESCE(excluded.git_branch, session.git_branch)`,
      [s.sessionId, s.developerId, s.tool, s.projectPath, s.gitBranch,
       s.startedAt, s.endedAt, s.agentVersion, s.entrypoint],
    );
  }

  saveMessage(m: MessageRow): void {
    this.db.run(
      `INSERT OR IGNORE INTO message (uuid, session_id, parent_uuid, role, model, ts, effort,
        is_sidechain, request_id, input_tokens, output_tokens, cache_read, cache_create_5m,
        cache_create_1h, thinking_tokens, service_tier, stop_reason, cost_usd_derived)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [m.uuid, m.sessionId, m.parentUuid, m.role, m.model, m.ts, m.effort,
       B(m.isSidechain), m.requestId, m.usage.inputTokens, m.usage.outputTokens,
       m.usage.cacheReadTokens, m.usage.cacheCreate5mTokens, m.usage.cacheCreate1hTokens,
       m.usage.thinkingTokens, m.serviceTier, m.stopReason, m.costUsdDerived],
    );
  }

  saveToolCall(t: ToolCallRow): void {
    this.db.run(
      `INSERT OR IGNORE INTO tool_call (id, session_id, message_uuid, tool_name, ts,
        input_hash, input_norm, result_bytes, is_error, is_rejected, interrupted, duration_ms)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [t.id, t.sessionId, t.messageUuid, t.toolName, t.ts, t.inputHash, t.inputNorm,
       t.resultBytes, B(t.isError), B(t.isRejected), B(t.interrupted), t.durationMs],
    );
  }

  /**
   * Applies a tool result to the call it belongs to, and to the edit if that
   * call was an edit. Runs as an UPDATE because the two halves can arrive in
   * different ingest passes - the call in one chunk, its result in the next.
   */
  applyToolResult(r: ToolResultPatch): void {
    this.db.run(
      `UPDATE tool_call SET result_bytes = ?, is_error = ?, is_rejected = ?, interrupted = ?
       WHERE id = ?`,
      [r.resultBytes, B(r.isError), B(r.isRejected), B(r.interrupted), r.toolUseId],
    );
    this.db.run("UPDATE edit SET decision = ? WHERE id = ?", [
      r.isRejected || r.interrupted ? "rejected" : "accepted",
      r.toolUseId,
    ]);
  }

  /** The hook is the only source of tool duration, and it lands after the
   *  transcript row, so it patches rather than inserts. */
  setToolDuration(toolUseId: string, durationMs: number): boolean {
    const before = this.db.one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM tool_call WHERE id = ? AND duration_ms IS NULL",
      [toolUseId],
    );
    if (!before || before.n === 0) return false;
    this.db.run("UPDATE tool_call SET duration_ms = ? WHERE id = ?", [durationMs, toolUseId]);
    return true;
  }

  saveTurn(t: TurnRow): void {
    this.db.run(
      "INSERT OR IGNORE INTO turn (session_id, ts, duration_ms, message_count) VALUES (?,?,?,?)",
      [t.sessionId, t.ts, t.durationMs, t.messageCount],
    );
  }

  savePrompt(p: PromptRow): void {
    this.db.run(
      "INSERT OR IGNORE INTO prompt (id, session_id, ts, text_hash, text_norm, char_len) VALUES (?,?,?,?,?,?)",
      [p.id, p.sessionId, p.ts, p.textHash, p.textNorm, p.charLen],
    );
  }

  /** Keyed on the message's own uuid, so a resume replays it as a no-op. */
  saveBlock(b: MessageBlockRow): void {
    this.db.run(
      `INSERT OR IGNORE INTO message_block
         (message_uuid, seq, session_id, role, kind, ts, tool_use_id, tool_name, content, char_len)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [b.messageUuid, b.seq, b.sessionId, b.role, b.kind, b.ts,
       b.toolUseId, b.toolName, b.content, b.charLen],
    );
  }

  saveEdit(e: EditRow): void {
    this.db.run(
      `INSERT OR IGNORE INTO edit (id, session_id, ts, file_path, language, lines_added, lines_removed, decision)
       VALUES (?,?,?,?,?,?,?,?)`,
      [e.id, e.sessionId, e.ts, e.filePath, e.language, e.linesAdded, e.linesRemoved, e.decision],
    );
  }

  saveCostReport(c: SessionCostReport): void {
    // Claude Code rewrites this record as a session progresses - keep the latest.
    this.db.run(
      `INSERT INTO session_cost_report (session_id, total_cost_usd, api_duration_ms,
        wall_duration_ms, tool_duration_ms, lines_added, lines_removed, per_model_json)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(session_id) DO UPDATE SET
         total_cost_usd = excluded.total_cost_usd,
         api_duration_ms = excluded.api_duration_ms,
         wall_duration_ms = excluded.wall_duration_ms,
         tool_duration_ms = excluded.tool_duration_ms,
         lines_added = excluded.lines_added,
         lines_removed = excluded.lines_removed,
         per_model_json = excluded.per_model_json`,
      [c.sessionId, c.totalCostUsd, c.apiDurationMs, c.wallDurationMs, c.toolDurationMs,
       c.linesAdded, c.linesRemoved, JSON.stringify(c.perModel)],
    );
  }

  /** Content-addressed by the caller, so re-draining a line that stayed queued
   *  lands on the same row instead of a duplicate. */
  saveHookEvent(e: HookEventRow): void {
    this.db.run(
      `INSERT OR IGNORE INTO hook_event (id, event, ts, session_id, tool_name, attrs_json)
       VALUES (?,?,?,?,?,?)`,
      [e.id, e.event, e.ts, e.sessionId, e.toolName, JSON.stringify(e.attrs)],
    );
  }

  saveSignal(id: string, s: Signal): void {
    this.db.run(
      `INSERT OR REPLACE INTO signal (id, kind, severity, scope, scope_id, date, evidence_json)
       VALUES (?,?,?,?,?,?,?)`,
      [id, s.kind, s.severity, s.scope, s.scopeId, s.date, JSON.stringify(s.evidence)],
    );
  }

  /** A choice the user made in the UI. See app_state in schema.sql. */
  setState(key: string, value: string): void {
    this.db.run(
      "INSERT OR REPLACE INTO app_state (key, value, updated_at) VALUES (?,?,?)",
      [key, value, new Date().toISOString()],
    );
  }

  readCursor(sourceKey: string): IngestCursor | null {
    const row = this.db.one<{ size: number; mtime_ms: number; bytes_consumed: number }>(
      "SELECT size, mtime_ms, bytes_consumed FROM ingest_cursor WHERE source_key = ?",
      [sourceKey],
    );
    return row ? { size: row.size, mtimeMs: row.mtime_ms, bytesConsumed: row.bytes_consumed } : null;
  }

  writeCursor(sourceKey: string, c: IngestCursor): void {
    this.db.run(
      `INSERT OR REPLACE INTO ingest_cursor (source_key, size, mtime_ms, bytes_consumed, updated_at)
       VALUES (?,?,?,?,?)`,
      [sourceKey, c.size, c.mtimeMs, c.bytesConsumed, new Date().toISOString()],
    );
  }
}
