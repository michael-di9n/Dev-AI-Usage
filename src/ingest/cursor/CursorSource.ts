import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import type { Db } from "../../db/Database";
import { failed, ok, skipped, type IngestResult, type IngestSource } from "../Source";

/** `aiCodeTracking.dailyStats.v1.5.2026-04-28` -> the date is the last segment. */
const DAILY_STATS_PREFIX = "aiCodeTracking.dailyStats.";

export interface CursorDailyRow {
  date: string;
  tabSuggested: number;
  tabAccepted: number;
  composerSuggested: number;
  composerAccepted: number;
}

export interface CursorCommitRow {
  commitHash: string;
  branch: string;
  humanLines: number;
  composerLines: number;
  tabLines: number;
  aiPct: number | null;
  commitDate: string | null;
}

/**
 * Reads what Cursor records locally: daily accept/suggest counts and per-commit
 * AI-vs-human line attribution.
 *
 * Deliberately does NOT produce tokens or cost. Cursor stores `tokenCount` as
 * {0, 0} for every message on disk - the real figures exist only behind the
 * team Admin API. Emitting a zero here would read as "Cursor was free", so the
 * columns stay absent and the UI renders an em dash instead.
 */
export class CursorSource implements IngestSource {
  readonly id = "cursor";
  readonly label = "Cursor local stores";

  constructor(
    private readonly db: Db,
    private readonly trackingDbPath: string,
    private readonly stateDbPath: string,
  ) {}

  async unavailableReason(): Promise<string | null> {
    if (!existsSync(this.trackingDbPath) && !existsSync(this.stateDbPath)) {
      return "Cursor is not installed, or its data lives elsewhere (set CURSOR_TRACKING_DB / CURSOR_STATE_DB).";
    }
    return null;
  }

  async ingest(): Promise<IngestResult> {
    const reason = await this.unavailableReason();
    if (reason) return skipped(this.id, reason);

    try {
      const commits = this.readCommits();
      const daily = this.readDailyStats();

      this.db.transaction(() => {
        commits.forEach((c) => this.saveCommit(c));
        daily.forEach((d) => this.saveDaily(d));
      });

      return ok(this.id, `${commits.length} scored commits, ${daily.length} daily rows`, commits.length + daily.length);
    } catch (error) {
      return failed(this.id, error);
    }
  }

  private readCommits(): CursorCommitRow[] {
    return this.withDb(this.trackingDbPath, (db) => {
      const rows = db
        .prepare(
          `SELECT commitHash, branchName, humanLinesAdded, composerLinesAdded,
                  tabLinesAdded, v2AiPercentage, v1AiPercentage, commitDate
             FROM scored_commits`,
        )
        .all() as Record<string, unknown>[];

      return rows.map((r) => ({
        commitHash: String(r.commitHash),
        branch: String(r.branchName),
        humanLines: Number(r.humanLinesAdded ?? 0),
        composerLines: Number(r.composerLinesAdded ?? 0),
        tabLines: Number(r.tabLinesAdded ?? 0),
        // v2 is Cursor's current scorer; v1 is the fallback for older rows.
        aiPct: toNumberOrNull(r.v2AiPercentage ?? r.v1AiPercentage),
        commitDate: r.commitDate == null ? null : String(r.commitDate),
      }));
    });
  }

  private readDailyStats(): CursorDailyRow[] {
    return this.withDb(this.stateDbPath, (db) => {
      const rows = db
        .prepare("SELECT key, value FROM ItemTable WHERE key LIKE ?")
        .all(`${DAILY_STATS_PREFIX}%`) as { key: string; value: unknown }[];

      const parsed: CursorDailyRow[] = [];
      for (const row of rows) {
        const value = safeParse(row.value);
        const date = value?.date ?? row.key.split(".").pop();
        if (typeof date !== "string" || !value) continue;
        parsed.push({
          date,
          tabSuggested: Number(value.tabSuggestedLines ?? 0),
          tabAccepted: Number(value.tabAcceptedLines ?? 0),
          composerSuggested: Number(value.composerSuggestedLines ?? 0),
          composerAccepted: Number(value.composerAcceptedLines ?? 0),
        });
      }
      return parsed;
    });
  }

  /** Read-only so a running Cursor holding the write lock is not a problem. */
  private withDb<T>(path: string, fn: (db: DatabaseSync) => T): T {
    if (!existsSync(path)) return [] as unknown as T;
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  private saveCommit(c: CursorCommitRow): void {
    this.db.run(
      `INSERT OR REPLACE INTO cursor_commit
         (commit_hash, branch, human_lines, composer_lines, tab_lines, ai_pct, commit_date)
       VALUES (?,?,?,?,?,?,?)`,
      [c.commitHash, c.branch, c.humanLines, c.composerLines, c.tabLines, c.aiPct, c.commitDate],
    );
  }

  private saveDaily(d: CursorDailyRow): void {
    this.db.run(
      `INSERT OR REPLACE INTO cursor_daily
         (date, tab_suggested, tab_accepted, composer_suggested, composer_accepted)
       VALUES (?,?,?,?,?)`,
      [d.date, d.tabSuggested, d.tabAccepted, d.composerSuggested, d.composerAccepted],
    );
  }
}

function safeParse(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Cursor stores percentages as strings; a bad one becomes null, never 0. */
function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
