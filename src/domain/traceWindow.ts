/**
 * How far back the trace page's charts look. Pure: no clock, no database.
 *
 * Rolling days rather than the calendar periods in `period.ts`, and
 * deliberately a different vocabulary from them. Trends asks "what did this
 * month cost", which resets when the month does; this asks "what have the last
 * few runs looked like", which does not care that it is the 1st. Sharing
 * `PeriodId` would have meant "today" as an option, and a chart of one day's
 * runs on the 1st of the month is a chart of nothing.
 */

export type TraceWindowId = "day" | "week" | "month" | "all";

export interface TraceWindow {
  id: TraceWindowId;
  /** The control's label. */
  label: string;
  /**
   * Whole days back from now, or null for everything captured.
   *
   * Null rather than a very large number. A window of 36,500 days would work
   * and would be a lie in the one place it matters: the empty-state sentence
   * names the window, and "no runs in the last hundred years" is a worse
   * answer than "no runs at all".
   */
  days: number | null;
  /** Names the window in prose, for headings. */
  phrase: string;
}

export const TRACE_WINDOWS: TraceWindow[] = [
  { id: "day", label: "1 day", days: 1, phrase: "the last day" },
  { id: "week", label: "1 week", days: 7, phrase: "the last week" },
  { id: "month", label: "1 month", days: 30, phrase: "the last month" },
  /*
   * The overview under the chart reads every run of a project at once, and a
   * project worked in last quarter would otherwise have an empty one with no
   * way to widen it. It is last in the row because it is the widest, not
   * because it is least useful.
   */
  { id: "all", label: "All", days: null, phrase: "everything captured" },
];

export const DEFAULT_TRACE_WINDOW: TraceWindowId = "week";

/**
 * The stored choice, or the default.
 *
 * Takes whatever came out of `app_state`, which is a string this code did not
 * write and may not recognise - an older build's value, or a row edited by
 * hand. An unknown one falls back rather than throwing, because a page that
 * will not render is a worse answer than a page showing the default week.
 */
export function traceWindowOf(stored: string | null): TraceWindow {
  return (
    TRACE_WINDOWS.find((w) => w.id === stored) ??
    TRACE_WINDOWS.find((w) => w.id === DEFAULT_TRACE_WINDOW)!
  );
}
