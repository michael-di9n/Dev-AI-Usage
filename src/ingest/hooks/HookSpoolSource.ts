import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { IngestRepository } from "../../db/IngestRepository";
import type { Db } from "../../db/Database";
import type { HookEventRow } from "../../domain/types";
import { failed, ok, skipped, type IngestResult, type IngestSource } from "../Source";

export interface SpoolLine {
  event: string;
  toolUseId?: string;
  durationSeconds?: number;
  sessionId?: string;
  toolName?: string;
  spooledAt?: string;
  attrs: Record<string, unknown>;
}

/**
 * Drains the hook spool into `tool_call.duration_ms` and `hook_event`.
 *
 * Per-tool wall-clock exists nowhere else: the transcript records no tool
 * duration, and OpenTelemetry times the API request rather than the tool. So
 * this is the only path to "which tools are slow and frequent".
 *
 * It stores every line, not only the timed ones. Exercise 02 registers five
 * hooks and four of them carry no `tool_use_id`, so a drain that recognised
 * only durations silently discarded `PermissionDenied`, `PreCompact`,
 * `SubagentStop` and `SessionEnd` on every run - including the two the
 * exercise says feed features.
 *
 * A spooled duration whose tool_call row has not been ingested yet is kept for
 * the next run rather than dropped; the hook fires before the transcript is
 * flushed often enough that discarding would silently lose measurements. Its
 * hook_event row is written on the first pass regardless, and the id is a
 * content hash, so the retry cannot duplicate it.
 */
export class HookSpoolSource implements IngestSource {
  readonly id = "hooks";
  readonly label = "Claude Code hooks (exercise 02)";

  constructor(
    private readonly db: Db,
    private readonly repo: IngestRepository,
    private readonly spoolPath: string,
  ) {}

  async unavailableReason(): Promise<string | null> {
    return existsSync(this.spoolPath)
      ? null
      : "No hook spool yet. Complete exercises/02-register-hooks.md to record per-tool duration and hook events.";
  }

  async ingest(): Promise<IngestResult> {
    const reason = await this.unavailableReason();
    if (reason) return skipped(this.id, reason);

    try {
      const lines = readFileSync(this.spoolPath, "utf8").split("\n").filter((l) => l.trim());
      const unmatched: string[] = [];
      let applied = 0;
      let stored = 0;

      this.db.transaction(() => {
        for (const raw of lines) {
          const parsed = parseSpoolLine(raw);
          // A line we cannot parse at all is not kept: it will never parse.
          if (!parsed) continue;

          this.repo.saveHookEvent(toHookEvent(raw, parsed));
          stored += 1;

          if (!parsed.toolUseId || parsed.durationSeconds === undefined) continue;
          const ms = Math.round(parsed.durationSeconds * 1000);
          if (this.repo.setToolDuration(parsed.toolUseId, ms)) applied += 1;
          // Only a duration waiting for its transcript row stays queued. The
          // hook_event is already stored, and re-storing it is a no-op.
          else unmatched.push(raw);
        }
      });

      // Rewrite rather than truncate: what could not be matched stays queued.
      writeFileSync(this.spoolPath, unmatched.length ? `${unmatched.join("\n")}\n` : "");

      return ok(
        this.id,
        `${stored} hook events stored, ${applied} tool durations applied, ${unmatched.length} awaiting transcripts`,
        stored,
      );
    } catch (error) {
      return failed(this.id, error);
    }
  }
}

function parseSpoolLine(raw: string): SpoolLine | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const r = parsed as Record<string, unknown>;
    const event = String(r.hook_event_name ?? r.event ?? "");
    if (!event) return null;
    return {
      event,
      toolUseId: typeof r.tool_use_id === "string" ? r.tool_use_id : undefined,
      durationSeconds: typeof r.duration === "number" ? r.duration : undefined,
      sessionId: typeof r.session_id === "string" ? r.session_id : undefined,
      toolName: typeof r.tool_name === "string" ? r.tool_name : undefined,
      spooledAt: typeof r.spooled_at === "string" ? r.spooled_at : undefined,
      attrs: r,
    };
  } catch {
    return null;
  }
}

/**
 * Keys the row by the bytes that produced it.
 *
 * Two genuinely distinct hook firings differ in `spooled_at`, which the hook
 * script stamps. Lines spooled before that existed can collide and dedupe -
 * accepted knowingly, because the alternative is inventing a time.
 */
export function toHookEvent(raw: string, parsed: SpoolLine): HookEventRow {
  // Only the interesting fields are kept. A hook payload carries the full tool
  // input, which for Write is the entire file being written.
  const attrs = summariseAttrs(parsed.attrs);
  return {
    id: createHash("sha256").update(raw).digest("hex").slice(0, 24),
    event: parsed.event,
    ts: parsed.spooledAt ?? null,
    sessionId: parsed.sessionId ?? null,
    toolName: parsed.toolName ?? null,
    attrs,
  };
}

/** Names, counts and flags only. Never tool input or tool output: the spool
 *  carries whole file contents, and this table is read by a page. */
const KEEP = new Set([
  "hook_event_name", "tool_name", "tool_use_id", "duration", "session_id",
  "spooled_at", "cwd", "trigger", "permission_mode", "reason", "decision",
  "stop_hook_active", "matcher",
]);

function summariseAttrs(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!KEEP.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    out[key] = value;
  }
  return out;
}
