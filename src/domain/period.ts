/**
 * The time window, and how finely to bucket it.
 *
 * Calendar-relative rather than rolling day counts. "Last 30 days" is the wrong
 * question for work: on a Tuesday it silently includes two weekends and half of
 * last month, so the figure moves for reasons that have nothing to do with what
 * you did. "This week" and "this month" are the periods people are actually
 * asked about, and they reset when the calendar does.
 *
 * The one rolling window is the three-month view, because "this quarter" is one
 * day long on the first of January and nobody wants that.
 *
 * Every boundary here is a LOCAL one. "Today" has to mean the reader's today:
 * on UTC+10 a UTC day boundary hides everything before 10am and counts last
 * night as this morning, which is a subtle skew on a daily total and a plainly
 * wrong x-axis on an hourly chart. `windowOf` at the foot of this file does
 * that conversion, taking the clock as an argument so this stays pure.
 */

export type PeriodId = "today" | "week" | "month" | "quarter";

export interface Period {
  id: PeriodId;
  /** The control's label. */
  label: string;
  /** Names the window in prose, for headings and tooltips. */
  phrase: string;
  /**
   * Names the comparison window in prose.
   *
   * Written out rather than derived as "the X before", because a delta is only
   * readable if the reader knows what it is a delta against - and "vs before"
   * makes them work that out from the filter row.
   */
  comparisonPhrase: string;
  /**
   * Whether the window is a single calendar day.
   *
   * It used to be load-bearing for a different reason: the habit badges and
   * the usage band both demanded three active days, which a one-day window
   * can never hold, so "you have not worked enough" was the only thing they
   * could say to someone who had worked all day. Those floors are gone - both
   * band on the rate per active day, and one day divides by one.
   *
   * What it still decides is voice, not eligibility: the badge heading says
   * "How you worked today" rather than "How you worked", because the same
   * chip means "this is how you work" over a month and only "this is what
   * today held" over a day. Anything that needs to know must ask this rather
   * than testing `id === "today"` from three different files.
   */
  spansOneDay: boolean;
  /** The finest bucket that yields more than one point in this window. */
  defaultGranularity: Granularity;
  /** Granularities that make sense here. A month has no month-sized trend. */
  granularities: Granularity[];
}

export type Granularity = "hour" | "day" | "week" | "month";

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  hour: "By hour",
  day: "By day",
  week: "By week",
  month: "By month",
};

export const PERIODS: Period[] = [
  {
    id: "today",
    label: "Today",
    phrase: "today",
    comparisonPhrase: "yesterday",
    spansOneDay: true,
    // Hours, because a day bucketed by day is one point. This is also the
    // only granularity finer than the period itself, which is why "today" is
    // the one period whose chart shows shape rather than a single total.
    defaultGranularity: "hour",
    granularities: ["hour"],
  },
  {
    id: "week",
    label: "This week",
    phrase: "this week",
    spansOneDay: false,
    comparisonPhrase: "last week",
    defaultGranularity: "day",
    granularities: ["day"],
  },
  {
    id: "month",
    label: "This month",
    phrase: "this month",
    spansOneDay: false,
    comparisonPhrase: "last month",
    defaultGranularity: "day",
    granularities: ["day", "week"],
  },
  {
    id: "quarter",
    label: "Last 3 months",
    phrase: "the last three months",
    spansOneDay: false,
    comparisonPhrase: "the three months before",
    defaultGranularity: "week",
    granularities: ["day", "week", "month"],
  },
];

export const DEFAULT_PERIOD: PeriodId = "month";

export function isPeriodId(value: unknown): value is PeriodId {
  return PERIODS.some((p) => p.id === value);
}

export function periodOf(id: PeriodId): Period {
  return PERIODS.find((p) => p.id === id) ?? PERIODS[2]!;
}

/**
 * The granularity to actually use.
 *
 * A requested bucket the period cannot support falls back to the period's own
 * default rather than rendering a one-point chart. Someone who picks "by month"
 * and then narrows to "today" should get a sensible chart, not an error.
 */
export function granularityFor(period: Period, requested: unknown): Granularity {
  return period.granularities.find((g) => g === requested) ?? period.defaultGranularity;
}

// ---------------------------------------------------------------------------
// Window arithmetic
// ---------------------------------------------------------------------------

/** A half-open span, `from` inclusive and `to` exclusive, as absolute instants. */
export interface Window {
  from: Date;
  to: Date;
}

/**
 * The period's boundaries, computed against the reader's local calendar.
 *
 * Returned as absolute instants rather than SQL, so the caller binds them as
 * parameters and the index on `message(ts)` still applies. Doing this in SQL
 * instead - `datetime(ts, 'localtime') >= date('now', 'localtime')` - is
 * correct but wraps the indexed column in a function, which turns every
 * headline figure into a full table scan. Measured on a 34k-message corpus
 * that is 1ms against 24ms, and the gap grows with the archive.
 *
 * `now` is an argument because this file is in `src/domain/` and owns no
 * clock. Every method here reads the local calendar via the platform Date,
 * which is what makes "today" mean the reader's today rather than UTC's.
 */
export function windowOf(period: PeriodId, now: Date): Window {
  return { from: floorOf(period, now), to: now };
}

/**
 * The same span, one period earlier, for a like-for-like delta.
 *
 * Both ends move, so "this month so far" is compared against the same number
 * of days into the month before it rather than against all of last month -
 * otherwise the 3rd of the month invents a 90% collapse every time.
 */
export function previousWindowOf(period: PeriodId, now: Date): Window {
  switch (period) {
    case "today":
      return { from: addDays(startOfDay(now), -1), to: addDays(now, -1) };
    case "week":
      return { from: addDays(startOfWeek(now), -7), to: addDays(now, -7) };
    case "month":
      return { from: addMonths(startOfMonth(now), -1), to: addMonths(now, -1) };
    case "quarter":
      return { from: addMonths(startOfDay(now), -6), to: addMonths(now, -3) };
  }
}

/**
 * A rolling window of whole local days ending now.
 *
 * Not a calendar period: the usage band asks "over the last N days", which is
 * a question that does not reset when the month does.
 */
export function rollingDays(days: number, now: Date): Window {
  return { from: addDays(startOfDay(now), -days), to: now };
}

function floorOf(period: PeriodId, now: Date): Date {
  switch (period) {
    case "today": return startOfDay(now);
    case "week": return startOfWeek(now);
    case "month": return startOfMonth(now);
    // Rolling, not calendar: "this quarter" is one day long on 1 January.
    case "quarter": return addMonths(startOfDay(now), -3);
  }
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Monday. `getDay()` is 0 for Sunday, so `(day + 6) % 7` is "days since Monday". */
function startOfWeek(d: Date): Date {
  const copy = startOfDay(d);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

function startOfMonth(d: Date): Date {
  const copy = startOfDay(d);
  copy.setDate(1);
  return copy;
}

/**
 * How far back a chart may look to pad a short period, as an instant.
 *
 * Pure, and takes the window start rather than a clock, because it is a
 * lookback from a boundary that `windowOf` has already decided. It exists so
 * the padded query has a floor: without one it groups the whole corpus, and
 * an hourly chart could reach back three weeks to find its seventh bucket and
 * label it "18:00" beside today's hours.
 *
 * `buckets` spans, in the reader's local calendar, so the floor lands on the
 * same kind of boundary the buckets do. The result is an instant, so the
 * query binds it as a parameter and the index on `message(ts)` still applies.
 */
export function bucketLookback(from: Date, granularity: Granularity, buckets: number): Date {
  if (granularity === "hour") {
    const copy = new Date(from);
    copy.setHours(copy.getHours() - buckets);
    return copy;
  }
  if (granularity === "day") return addDays(from, -buckets);
  if (granularity === "week") return addDays(from, -7 * buckets);
  return addMonths(from, -buckets);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Month arithmetic that clamps rather than overflowing.
 *
 * `setMonth(m - 1)` on 31 March asks for 31 February, and both JavaScript and
 * SQLite normalise that forward to 3 March - a date *inside* the current month.
 * As the upper bound of "the month before", that makes the comparison window
 * overlap the window it is being compared against, on exactly the days a
 * reader is most likely to be checking. Clamping to the 28th/29th/30th keeps
 * the two windows disjoint.
 */
function addMonths(d: Date, months: number): Date {
  const copy = new Date(d);
  const day = copy.getDate();
  copy.setDate(1);
  copy.setMonth(copy.getMonth() + months);
  copy.setDate(Math.min(day, daysInMonth(copy.getFullYear(), copy.getMonth())));
  return copy;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}
