/**
 * The key the trace page stores its chosen session under, and nothing else.
 *
 * Its own module because of who needs it. `trace.ts` reads it and drags in the
 * database, the tree builder and the read repository; `trace-actions.ts` writes
 * it and is a `"use server"` module; and `TraceRunList` imports the action to
 * post a row with. With the constant living beside the view helpers,
 * that chain puts the sqlite driver on the path to the browser bundle - which
 * is how a `node:sqlite` import ends up being evaluated in Chrome. One constant
 * with no imports of its own cannot do that to anyone.
 *
 * This is the same argument as `repo-key.ts`, written out again rather
 * than cross-referenced, because the file it protects is the one someone
 * tidying up would inline.
 */
export const SELECTED_SESSION = "trace.selectedSession";


/**
 * The keys the run list stores its own shape under.
 *
 * All three are choices the reader makes on the page, so all three survive
 * leaving the tab - the rule in AGENTS.md that anything chosen is remembered.
 * Looking at the page still writes nothing; only choosing on it does.
 *
 * Separate keys rather than one blob, because they change for different
 * reasons and at different moments: collapsing the list is a glance, sorting
 * it is a question, and moving a threshold is a decision about every run at
 * once. One row per reason keeps a modal save from quietly re-writing the sort.
 */
export const TRACE_RUNS_OPEN = "trace.runsOpen";
/**
 * The date range the run list is filtered to.
 *
 * It replaced `trace.window`, which held a rolling window and scoped a chart
 * that no longer exists. A range says everything the window could and several
 * things it could not, and it filters the list - which is what a reader looking
 * at a control above a list of runs expects it to do.
 */
export const TRACE_RUNS_RANGE = "trace.runsRange";
export const TRACE_RUNS_ORDER = "trace.runsOrder";
export const TRACE_RUN_BANDS = "trace.runBands";

/**
 * The key the run stores how many of its rows to draw under.
 *
 * A stored choice like the other five, for the reason AGENTS.md gives: a
 * reader who asked for more of a run and came back to find it collapsed again
 * has been asked the same question twice. Its own key rather than part of
 * `TRACE_RUNS_OPEN`, because that one is about the list on the left and this
 * one is about the run on the right.
 */
export const TRACE_ROW_LIMIT = "trace.rowLimit";

/**
 * The key the path strip stores how many of its steps to draw under.
 *
 * Its own key rather than sharing `TRACE_ROW_LIMIT`: the tree and the strip
 * count different things - rows against steps - and expanding one is not a
 * request to expand the other. A reader who wants the whole strip on a long
 * run usually wants the tree left where it is, because that is the trade the
 * two objects exist to offer.
 */
export const TRACE_PATH_STEPS = "trace.pathSteps";

/**
 * Whether the run list is narrowed to runs with OTEL spans.
 *
 * A stored choice like the other five: it changes what the list shows, not
 * how it's drawn, so it deserves its own key rather than folding into
 * `TRACE_RUNS_OPEN` (which only ever hides the list, never the rows in it).
 */
export const TRACE_OTEL_ONLY = "trace.otelOnly";
