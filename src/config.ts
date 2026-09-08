import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULT_BLOCK_CHARS } from "./domain/types";

export type ArchiveMode = "on" | "off";
export type ObservabilityMode = "off" | "on";

/** Not NodeJS.ProcessEnv: Next augments that type with framework-required keys,
 *  and this layer must stay readable from a plain object in a test. */
export type Env = Record<string, string | undefined>;

export interface AppConfig {
  developerId: string;
  claudeProjectsDir: string;
  cursorTrackingDb: string;
  cursorStateDb: string;
  databasePath: string;
  /**
   * Where the transcript archive lives. A separate file from `databasePath` on
   * purpose: that one is derived and can be deleted at any time, while this one
   * holds the only remaining copy of transcripts Claude Code has expired.
   */
  archivePath: string;
  archiveMode: ArchiveMode;
  /**
   * Characters of transcript text kept per content block, for the trace page,
   * or null to keep none at all.
   *
   * This is the one setting that changes what the database *contains* rather
   * than how much of it is read: with it on, `usage.db` holds prompts, tool
   * arguments and tool output verbatim. Still local, still derived, still
   * deletable - but a bigger and more sensitive file than it was.
   */
  traceChars: number | null;
  /**
   * How often the running dashboard re-imports, in seconds. Zero means never,
   * and the Setup page then says so rather than looking merely quiet.
   */
  syncSeconds: number;
  spoolPath: string;
  pricesPath: string;
  /**
   * Read-only credential for the Anthropic Admin usage API, which is one more
   * source of observations - not a way to ask a model anything. This tool sends
   * no prompt anywhere and has no path to do so.
   *
   * Optional. Absent means the Analytics panels render "not configured".
   */
  anthropicAdminKey: string | null;
  analyticsBaseUrl: string;
  observability: ObservabilityMode;
  observabilityDir: string;
  uiScreenshotDir: string;
}

/**
 * The single place `process.env` is read. Everything downstream takes an
 * AppConfig argument, which is what makes the ingest layer testable against
 * fixture directories.
 */
export function readConfig(env: Env = process.env, cwd = process.cwd()): AppConfig {
  const home = env.HOME ?? homedir();

  return {
    developerId: env.DEV_AI_USAGE_DEVELOPER_ID ?? env.USER ?? "local",
    claudeProjectsDir: resolveClaudeProjectsDir(env, home),
    cursorTrackingDb: env.CURSOR_TRACKING_DB ?? join(home, ".cursor/ai-tracking/ai-code-tracking.db"),
    cursorStateDb:
      env.CURSOR_STATE_DB ?? join(home, ".config/Cursor/User/globalStorage/state.vscdb"),
    databasePath: env.DEV_AI_USAGE_DB ?? resolve(cwd, "data/usage.db"),
    archivePath: env.DEV_AI_USAGE_ARCHIVE_DB ?? resolve(cwd, "data/archive.db"),
    // On by default: the cost of being wrong is a directory of disk, and the
    // cost of the other default is transcripts nobody can get back.
    archiveMode: env.DEV_AI_USAGE_ARCHIVE === "off" ? "off" : "on",
    traceChars: parseTraceChars(env.DEV_AI_USAGE_TRACE_CHARS),
    syncSeconds: parseSyncSeconds(env.DEV_AI_USAGE_SYNC_SECONDS),
    spoolPath: env.DEV_AI_USAGE_SPOOL ?? resolve(cwd, "data/spool.jsonl"),
    pricesPath: env.DEV_AI_USAGE_PRICES ?? resolve(cwd, "prices/models.json"),
    anthropicAdminKey: env.ANTHROPIC_ADMIN_KEY ?? null,
    analyticsBaseUrl: env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
    observability: env.DEV_AI_USAGE_OBSERVABILITY === "off" ? "off" : "on",
    observabilityDir: env.DEV_AI_USAGE_OBSERVABILITY_DIR ?? resolve(cwd, "data/observability"),
    uiScreenshotDir: env.DEV_AI_USAGE_UI_SCREENSHOTS ?? resolve(cwd, "data/ui-tests"),
  };
}

/**
 * CLAUDE_CONFIG_DIR wins over ~/.claude. On machines that set it, a full and
 * plausible ~/.claude tree usually still exists and is never loaded - reading
 * it yields a silently empty result rather than an error, so order matters.
 */
export function resolveClaudeProjectsDir(env: Env, home: string): string {
  if (env.CLAUDE_CODE_PROJECTS_DIR) return env.CLAUDE_CODE_PROJECTS_DIR;
  if (env.CLAUDE_CONFIG_DIR) return join(env.CLAUDE_CONFIG_DIR, "projects");
  return join(home, ".claude", "projects");
}

/**
 * The dashboard's own import interval.
 *
 * Fifteen minutes by default: an import over an unchanged corpus costs about
 * three tenths of a second, so this is a 0.03% duty cycle, and a figure that is
 * at worst fifteen minutes stale is still a figure you can act on.
 *
 * `off`, or any non-positive number, disables importing entirely - the pass at
 * startup included. That is what makes it usable as a switch: `ui-test
 * --empty` points a server at a scratch database to render the fresh-clone
 * state, and an import it could not prevent would fill that database before
 * the first check ran. The Setup page reports it as off, which is a supported
 * choice rather than a broken one.
 *
 * A ceiling of a day, because a value in the millions is far more likely to be
 * milliseconds pasted into a seconds field than a genuine intent to sync once
 * a decade.
 */
const DEFAULT_SYNC_SECONDS = 900;
const MAX_SYNC_SECONDS = 86_400;

/**
 * How much of each block to keep. `off` keeps none, and the trace page then
 * says which variable to unset rather than rendering empty rows.
 *
 * A ceiling because this multiplies across every block of every message: the
 * measured corpus is ~22,000 blocks, so a careless large value turns a 79MB
 * derived database into a copy of the transcripts it was derived from.
 */
const MAX_TRACE_CHARS = 20_000;

function parseTraceChars(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return DEFAULT_BLOCK_CHARS;
  if (raw === "off") return null;

  const chars = Number(raw);
  if (!Number.isFinite(chars) || chars <= 0) return null;
  return Math.min(Math.round(chars), MAX_TRACE_CHARS);
}

function parseSyncSeconds(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_SYNC_SECONDS;
  if (raw === "off") return 0;

  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(Math.round(seconds), MAX_SYNC_SECONDS);
}
