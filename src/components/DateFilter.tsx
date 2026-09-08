"use client";

import { setRunRange } from "../app/trace-actions";
import { describeRange, isFiltered, type DateRange } from "../domain/traceDates";
import { TRACE_WINDOWS } from "../domain/traceWindow";
import { HeadingDialog } from "./HeadingDialog";

/**
 * Which runs the list shows, by when they ended.
 *
 * In the heading of the column it filters. It replaced a segmented
 * 1 day / 1 week / 1 month / All strip at the top of the page, which scoped a
 * chart rather than this list - and readers reasonably assumed otherwise,
 * because a row of time buttons above a list of runs looks like it narrows the
 * list. A control whose subject has to be explained is in the wrong place.
 *
 * The presets survived the move. They are one click for the commonest question
 * and they are also how a reader discovers what the boxes underneath them are
 * for; losing them to gain exact dates would have traded a fast answer for a
 * precise one rather than offering both.
 *
 * The dates are `<input type="date">`, so the calendar, the locale and the
 * keyboard handling are the browser's. Both ends are optional: "since the 3rd"
 * and "up to the 3rd" are useful and neither implies the other.
 */
export function DateFilter({ range }: { range: DateRange }) {
  const on = isFiltered(range);

  return (
    <HeadingDialog
      label="Filter by date"
      title={on ? `Filtered ${describeRange(range)} — change it` : "Filter runs by date"}
      active={on}
    >
      {(close) => (
        <>
          <p className="note">
            Which runs the list shows
          </p>

          {/*
            The presets post the window and let the server work out the dates
            from its own clock, so "the last week" cannot drift from what the
            rest of the page thinks the date is.
          */}
          <form action={setRunRange} className="filter-presets" onSubmit={close}>
            {TRACE_WINDOWS.map((w) => (
              <button key={w.id} type="submit" name="window" value={w.id} className="btn">
                {w.id === "all" ? "All time" : `Last ${w.label.replace("1 ", "")}`}
              </button>
            ))}
          </form>

          <form action={setRunRange} onSubmit={close}>
            <div className="bands-row">
              <label>
                From
                <input type="date" name="from" defaultValue={range.from ?? ""} />
              </label>
              <label>
                To
                <input type="date" name="to" defaultValue={range.to ?? ""} />
              </label>
            </div>

            <p className="note">
            </p>

            <div className="bands-actions">
              <button type="button" className="btn" onClick={close}>Cancel</button>
              <button type="submit" className="btn primary">Apply</button>
            </div>
          </form>
        </>
      )}
    </HeadingDialog>
  );
}
