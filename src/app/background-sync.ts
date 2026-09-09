import { app } from "./dashboard";
import { notifyLiveChange } from "./live-bus";

/**
 * Keeping the open dashboard up to date with itself.
 *
 * Without this the page is a snapshot of whenever someone last typed
 * `npm run run`. A tab left open all afternoon shows a "Today so far" that
 * stopped moving at lunchtime, and there is nothing on screen to say so -
 * which is a worse failure than an obviously empty page, because the figure
 * looks current.
 *
 * The timer lives in the Next server rather than in the operating system, so
 * there is nothing to install and nothing left running once you stop
 * `npm run dev`. That is the trade: it only covers the time the dashboard is
 * up. If you go weeks without opening it, only a real cron entry keeps the
 * archive ahead of Claude Code's own expiry - see the README.
 */

/** Per process, not per call: `register` can fire more than once in dev. */
let started = false;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * One import at a time.
 *
 * Two overlapping passes would race for the same byte offsets and the same
 * write lock, and the second would win nothing - the first has already
 * consumed the bytes. A promise rather than a boolean so a caller can wait on
 * the pass that is already running instead of starting a redundant one.
 */
let inFlight: Promise<void> | null = null;

/** Keys under which the last pass records itself, for the Setup page. */
export const SYNC_STATE = { at: "last_sync_at", detail: "last_sync_detail" } as const;

/**
 * Import now, and then on an interval.
 *
 * Not awaited by the caller: Next holds the server closed until `register`
 * resolves, and a first pass over a large corpus takes a second or two, which
 * would be a second or two of blank page on every restart.
 */
export function startBackgroundSync(): void {
  if (started) return;
  started = true;

  const seconds = app().config.syncSeconds;

  // Off means off, including the pass at startup.
  //
  // It was briefly the other way - import once, then stop - on the reasoning
  // that opening the dashboard is itself a request for current numbers. That
  // is a defensible reading and it was still wrong, because it made `off` a
  // setting nobody could rely on: `npm run ui-test -- --empty` points a server
  // at a scratch database precisely so it can render the fresh-clone state,
  // and the startup pass filled it with twenty thousand rows before the first
  // check ran. A switch that cannot actually stop the thing it names is worse
  // than no switch.
  if (seconds <= 0) {
    console.log("[sync] importing is off (DEV_AI_USAGE_SYNC_SECONDS=off).");
    return;
  }

  void sync();
  timer = setInterval(() => void sync(), seconds * 1000);
  // `unref` so this timer alone never keeps the process alive. A server that
  // refused to exit because a backup was pending would be a worse bug than a
  // skipped import.
  timer.unref?.();
  console.log(`[sync] importing every ${seconds}s.`);
}

/** Run one import pass, unless one is already running. */
export function sync(): Promise<void> {
  inFlight ??= runOnce().finally(() => { inFlight = null; });
  return inFlight;
}

async function runOnce(): Promise<void> {
  const application = app();
  try {
    const results = await application.ingest.runAll();
    const failed = results.filter((r) => r.status === "error");
    const rows = results.reduce((n, r) => n + r.recordsWritten, 0);

    // Recorded even when nothing changed. "Imported two minutes ago and found
    // nothing new" and "has not imported since Tuesday" are different states,
    // and only one of them is a problem.
    const detail = failed.length > 0
      ? `${failed.length} source${failed.length === 1 ? "" : "s"} failed: ${failed.map((f) => f.sourceId).join(", ")}`
      : `${rows.toLocaleString()} row${rows === 1 ? "" : "s"} from ${results.length} sources`;

    application.writes.setState(SYNC_STATE.at, new Date().toISOString());
    application.writes.setState(SYNC_STATE.detail, detail);

    for (const f of failed) console.error(`[sync] ${f.sourceId}: ${f.detail}`);
    if (rows > 0 || failed.length > 0) console.log(`[sync] ${detail}`);

    // A new row can be the one thing an open trace-tap terminal was waiting
    // on - the session that links a brand-new run to its project, most
    // often - so it hears about this pass the same way it hears about an
    // OTLP record.
    if (rows > 0) notifyLiveChange();
  } catch (error) {
    // Logged, never thrown. An import that cannot run must not take the
    // dashboard down with it - every figure already in the database is still
    // true, just older than it should be, and the Setup page says how old.
    console.error("[sync] FAILED:", error instanceof Error ? error.message : error);
  }
}

/** Test seam: stop the timer and forget the process-wide guards. */
export function stopBackgroundSync(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  started = false;
}
