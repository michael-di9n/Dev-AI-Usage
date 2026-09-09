"use server";

import { revalidatePath } from "next/cache";
import { app } from "./dashboard";
import { SELECTED_REPO } from "./repo-key";
import {
  SELECTED_SESSION, TRACE_OTEL_ONLY, TRACE_PATH_STEPS, TRACE_ROW_LIMIT, TRACE_RUNS_OPEN,
  TRACE_RUNS_ORDER, TRACE_RUNS_RANGE, TRACE_RUN_BANDS,
} from "./trace-key";
import { DEFAULT_TRACE_ROWS, TRACE_ROWS_STEP, traceRowsOf } from "../domain/traceTree";
import { DEFAULT_PATH_STEPS, PATH_STEPS_STEP, pathStepsOf } from "../domain/tracePath";
import { formatBands } from "../domain/runBands";
import { formatRange, parseRange, rangeForWindow } from "../domain/traceDates";
import type { TraceWindowId } from "../domain/traceWindow";
import { formatOrder, nextOrder, parseOrder, type RunColumn } from "../domain/runOrder";

/**
 * The three writes this page makes. Split from trace.ts because a "use server"
 * module may export only async functions, and the view helpers there export
 * types and plain functions.
 *
 * Looking at the page writes nothing. Choosing on it writes one of these.
 */

export async function selectSession(formData: FormData): Promise<void> {
  const sessionId = text(formData, "session");
  if (!sessionId) return;

  app().writes.setState(SELECTED_SESSION, sessionId);
  revalidatePath("/observability/trace");
}

/**
 * The project, which is the same choice AI maturity and Readiness make.
 *
 * One key across all three, so the app has a current project rather than three
 * of them. The candidate lists differ - this one offers projects that have a
 * captured trace, those offer directories that still exist on disk - and that
 * is fine: each page offers what it can answer for, and a choice made on one
 * that the others cannot resolve produces their stated "no longer exists"
 * sentence rather than a wrong answer.
 *
 * Clearing the session is not a tidy-up. A run belongs to a project, so a
 * stored session from the project you just navigated away from would leave the
 * tree and the list describing different things.
 */
export async function selectTraceProject(formData: FormData): Promise<void> {
  const path = text(formData, "project");
  if (path === null) return;

  const writes = app().writes;
  writes.setState(SELECTED_REPO, path);
  writes.setState(SELECTED_SESSION, "");
  revalidatePath("/observability/trace");
  revalidatePath("/static");
  revalidatePath("/observability");
}


/**
 * The date range the run list is filtered to.
 *
 * Two ways in, one stored value. The presets post a `window` and the range is
 * computed here from the clock; the date boxes post `from` and `to` directly.
 * Computing the preset on the server rather than in the dialog keeps "the last
 * week" meaning the same thing as the reader's own clock, and keeps the rule
 * in one pure function instead of in the markup.
 *
 * Validated by `parseRange` on the way back out rather than here, so a value
 * this action stored and a value someone typed into the database by hand are
 * held to the same rule - and a range that does not survive it shows every run
 * rather than none.
 */
export async function setRunRange(formData: FormData): Promise<void> {
  const preset = text(formData, "window");
  const range = preset
    ? rangeForWindow(preset as TraceWindowId, new Date())
    : { from: text(formData, "from") || null, to: text(formData, "to") || null };

  app().writes.setState(TRACE_RUNS_RANGE, formatRange(parseRange(formatRange(range))));
  revalidatePath("/observability/trace");
}

/** Empty string is a real value for the project key: it means "not recorded". */
function text(formData: FormData, name: string): string | null {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim() : null;
}

/**
 * Whether the run list is open. A glance, not a scope - it changes nothing
 * about what the page measured, only how much of it is on screen.
 */
export async function setRunsOpen(formData: FormData): Promise<void> {
  const open = text(formData, "open");
  if (open === null) return;

  app().writes.setState(TRACE_RUNS_OPEN, open === "true" ? "true" : "false");
  revalidatePath("/observability/trace");
}

/**
 * Whether the run list is narrowed to runs with OTEL spans.
 *
 * A filter, not a glance: unlike `setRunsOpen`, this changes which runs are
 * counted, so `exportScope` has to read the same key to keep "export all"
 * meaning what the list on screen shows.
 */
export async function setOtelOnly(formData: FormData): Promise<void> {
  const on = text(formData, "otel");
  if (on === null) return;

  app().writes.setState(TRACE_OTEL_ONLY, on === "true" ? "true" : "false");
  revalidatePath("/observability/trace");
}

/**
 * The column the run list is sorted by, and which way.
 *
 * The next order is computed here rather than sent by the page, so the rule
 * that a new column starts descending lives in one pure function instead of in
 * every heading that posts to this.
 */
export async function sortRuns(formData: FormData): Promise<void> {
  const column = text(formData, "column");
  if (!column) return;

  const current = parseOrder(app().queries.readState(TRACE_RUNS_ORDER));
  const next = nextOrder(current, column as RunColumn);

  app().writes.setState(TRACE_RUNS_ORDER, formatOrder(next));
  revalidatePath("/observability/trace");
}

/**
 * The thresholds the coins and wrenches are counted against.
 *
 * Validated by `parseBands` on the way back out rather than here, so a value
 * this action stored and a value someone typed into the database by hand are
 * held to exactly the same rule. A pair that does not survive that check falls
 * back to the defaults, which is why the modal states them.
 */
export async function setRunBands(formData: FormData): Promise<void> {
  const bands = {
    cost: { fair: number(formData, "costFair"), lots: number(formData, "costLots") },
    tools: { fair: number(formData, "toolsFair"), lots: number(formData, "toolsLots") },
  };

  app().writes.setState(TRACE_RUN_BANDS, formatBands(bands));
  revalidatePath("/observability/trace");
}

/** NaN rather than zero for something unparseable: `parseBands` rejects it. */
function number(formData: FormData, name: string): number {
  const raw = formData.get(name);
  return typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
}

/**
 * Draw more of the run.
 *
 * The next budget is computed here rather than posted by the page, so the step
 * lives in one place instead of in every button that asks for more. Clamped to
 * the run's own row count so the stored number can never claim more rows than
 * the run has - and so a reader who has reached the end and comes back does
 * not silently carry a budget from a much larger run.
 */
export async function showMoreRows(formData: FormData): Promise<void> {
  const total = Number(text(formData, "total"));
  const current = traceRowsOf(app().queries.readState(TRACE_ROW_LIMIT));
  const next = current + TRACE_ROWS_STEP;

  app().writes.setState(
    TRACE_ROW_LIMIT,
    String(Number.isSafeInteger(total) && total > 0 ? Math.min(next, total) : next),
  );
  revalidatePath("/observability/trace");
}

/**
 * Draw the beginning of the run again.
 *
 * The way back from `showMoreRows`. Without it the budget only ever grew, and
 * a reader who asked for more a few times had no way to undo a page that had
 * become slow again - the choice is stored, so it would have followed them
 * into every later visit.
 */
export async function showFewerRows(): Promise<void> {
  app().writes.setState(TRACE_ROW_LIMIT, String(DEFAULT_TRACE_ROWS));
  revalidatePath("/observability/trace");
}

/**
 * Draw more of the path.
 *
 * The strip's own `showMoreRows`, and clamped the same way: to the run's own
 * step count, so a stored budget can never claim more steps than a run has and
 * a reader who reached the end of a long strip does not carry that budget into
 * a short run and see nothing change.
 */
export async function showMorePathSteps(formData: FormData): Promise<void> {
  const total = Number(text(formData, "total"));
  const next = pathStepsOf(app().queries.readState(TRACE_PATH_STEPS)) + PATH_STEPS_STEP;

  app().writes.setState(
    TRACE_PATH_STEPS,
    String(Number.isSafeInteger(total) && total > 0 ? Math.min(next, total) : next),
  );
  revalidatePath("/observability/trace");
}

/**
 * Draw the beginning of the path again.
 *
 * The way back, for the reason `showFewerRows` exists: the budget is stored, so
 * without this a reader who expanded a 203-step strip once would carry seven
 * rows of chips into every later visit with no way to undo it.
 */
export async function showFewerPathSteps(): Promise<void> {
  app().writes.setState(TRACE_PATH_STEPS, String(DEFAULT_PATH_STEPS));
  revalidatePath("/observability/trace");
}
