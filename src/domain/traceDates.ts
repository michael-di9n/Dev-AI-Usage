/**
 * Which runs the list shows, by when they ended. Pure: takes the clock as an
 * argument, never reads it.
 *
 * One mechanism, not two. The page used to carry a rolling window - a day, a
 * week, a month - which is a range expressed as an offset from now, and it
 * scoped a chart rather than the list. A range of two dates says everything an
 * offset can say and several things it cannot: one week in March, everything
 * before a release, a single day you remember something going wrong on. So the
 * stored thing is a range, and the old windows survive as presets that fill it
 * in - the reader keeps the one-click answer and gains the exact one.
 *
 * Both ends are optional and mean different things:
 *
 * - Neither set is no filter at all, which is the default. Every run the
 *   project has is a run the list shows.
 * - One set is open-ended in the other direction: "since the 3rd" and "up to
 *   the 3rd" are both useful and neither implies the other end.
 *
 * The bounds are inclusive whole local days. A reader who types the same date
 * in both boxes means that day, and a range that excluded it would be a
 * control that lies about what it did.
 */

import { TRACE_WINDOWS, type TraceWindowId } from "./traceWindow";

export interface DateRange {
  /** `YYYY-MM-DD`, or null for open-ended. */
  from: string | null;
  to: string | null;
}

export const NO_RANGE: DateRange = { from: null, to: null };

export const isFiltered = (range: DateRange): boolean =>
  range.from !== null || range.to !== null;

/** What a run needs for this to decide about it. */
export interface DatedRun {
  endedAt: string;
}

/**
 * The runs inside the range, in the order they arrived.
 *
 * Compared as text, which is exact here and not a shortcut: `endedAt` is an
 * ISO instant and the bounds are ISO dates, so `"2026-08-04" <= "2026-08-04T10:00"`
 * is true and `"2026-08-04T10:00" <= "2026-08-04￿"` is what makes the upper
 * bound cover the whole of its day. Parsing both into Date objects would do the
 * same comparison after two conversions that can each go wrong on a timezone.
 */
export function runsInRange<T extends DatedRun>(runs: T[], range: DateRange): T[] {
  if (!isFiltered(range)) return runs;

  return runs.filter((run) => {
    if (range.from !== null && run.endedAt < range.from) return false;
    // "￿" sorts after every character an ISO instant can hold, so the
    // whole of the last day is inside the range rather than only midnight.
    if (range.to !== null && run.endedAt > `${range.to}￿`) return false;
    return true;
  });
}

/**
 * A preset, as the range it stands for.
 *
 * `days` back from the start of today, so "1 day" is today and yesterday
 * rather than the last twenty-four hours - a control that moves its own
 * boundary as the afternoon wears on is one nobody can check. The `all` preset
 * has no days and clears the range, which is the honest way to say "no filter"
 * rather than picking a date far enough back to look like one.
 */
export function rangeForWindow(id: TraceWindowId, now: Date): DateRange {
  const window = TRACE_WINDOWS.find((w) => w.id === id);
  if (!window || window.days === null) return NO_RANGE;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - window.days);

  return { from: isoDate(start), to: isoDate(now) };
}

/** Local calendar date, not UTC: on UTC+10 `toISOString` is yesterday. */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * What came out of `app_state`, or no filter.
 *
 * The stored string may be an older build's or a row edited by hand, so
 * anything that is not two well-formed dates in order falls back to showing
 * everything. Falling back to *more* runs is the safe direction: a filter that
 * silently fails open shows the reader rows they did not ask for, which they
 * can see; one that fails closed hides rows, which they cannot.
 */
export function parseRange(stored: string | null): DateRange {
  const [from, to] = (stored ?? "").split("..");

  const start = isDate(from) ? from : null;
  const end = isDate(to) ? to : null;
  if (start !== null && end !== null && start > end) return NO_RANGE;

  return { from: start, to: end };
}

export const formatRange = (range: DateRange): string =>
  isFiltered(range) ? `${range.from ?? ""}..${range.to ?? ""}` : "";

/**
 * The filter in words, for the line above the rows it hides.
 *
 * A filtered list that does not say it is filtered is the same bug as a figure
 * with no denominator: the reader counts what is on screen and believes it is
 * everything.
 */
export function describeRange(range: DateRange): string | null {
  if (!isFiltered(range)) return null;
  if (range.from !== null && range.to !== null) {
    return range.from === range.to ? `on ${range.from}` : `between ${range.from} and ${range.to}`;
  }
  return range.from !== null ? `since ${range.from}` : `up to ${range.to}`;
}

const isDate = (s: string | undefined): s is string => s !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(s);
