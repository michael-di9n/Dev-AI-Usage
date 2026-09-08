"use client";

import { setRunBands } from "../app/trace-actions";
import { DEFAULT_BANDS, type BandMeasure, type RunBands } from "../domain/runBands";
import { HeadingDialog } from "./HeadingDialog";

/**
 * The thresholds behind one column's marks, editable where they are read.
 *
 * In the column heading rather than a page-level settings panel, because the
 * question "why is this two coins and that one three" is asked while looking at
 * the column, and an answer three clicks away in a different region is an
 * answer nobody finds. The rule is stated in the dialog as well as changed
 * there.
 *
 * One control per bandable column, each editing only its own pair. The other
 * measure's numbers ride along as hidden fields so a save is always the whole
 * stored row - the alternative is a partial write that has to merge, and a
 * merge is where the two columns start disagreeing about what was saved.
 */
export function BandSettings({ bands, measure }: { bands: RunBands; measure: BandMeasure }) {
  const label = measure === "cost" ? "cost" : "tool call";
  const unit = measure === "cost" ? "dollars" : "calls";
  const other: BandMeasure = measure === "cost" ? "tools" : "cost";

  return (
    <HeadingDialog
      label={`${measure === "cost" ? "Cost" : "Tool call"} bands`}
      title={`Set the ${label} bands`}
    >
      {(close) => (
        <form action={setRunBands} onSubmit={close}>
          <p className="note">
          </p>

          <div className="bands-row">
            <label>
              Two marks at ({unit})
              <input
                type="number"
                name={`${measure}Fair`}
                defaultValue={bands[measure].fair}
                min="0"
                step={measure === "cost" ? "0.01" : "1"}
                required
              />
            </label>
            <label>
              Three marks at ({unit})
              <input
                type="number"
                name={`${measure}Lots`}
                defaultValue={bands[measure].lots}
                min="0"
                step={measure === "cost" ? "0.01" : "1"}
                required
              />
            </label>
          </div>

          {/* The other column's pair, unchanged. A save is the whole row. */}
          <input type="hidden" name={`${other}Fair`} value={bands[other].fair} />
          <input type="hidden" name={`${other}Lots`} value={bands[other].lots} />

          <p className="note">
          </p>

          <div className="bands-actions">
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button type="submit" className="btn primary">Save</button>
          </div>
        </form>
      )}
    </HeadingDialog>
  );
}
