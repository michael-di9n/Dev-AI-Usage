"use client";

import { PickerSelect } from "./PickerSelect";
import { selectTraceProject } from "../app/trace-actions";
import type { TraceProject } from "../app/trace";

/**
 * The one control that scopes this page, above everything it scopes.
 *
 * It acts on change, with no second click. Reading a project's runs measures
 * in milliseconds and writes nothing but the choice, so a confirm step would
 * only stand between the reader and the answer they already asked for.
 *
 * The project is the same choice AI maturity and Readiness make, stored under
 * one key so the app has a current project rather than three of them - and it
 * is the same control, `PickerSelect`, for the same reason. It was a bare
 * browser `<select>` here for a while, unbordered and unpadded beside two tabs
 * whose selector was not, because this page had rebuilt the control out of the
 * same parts and left the `.picker-row` wrapper the styling hangs off out of it.
 *
 * The options name the full path, as they do on those two tabs. The last
 * segment alone is friendlier and ambiguous - two checkouts called `web` are
 * one line in this list - and worse, it meant three tabs sharing one stored
 * project called it two different things.
 *
 * There was a second control here - a 1 day / 1 week / 1 month strip - and it
 * has moved into the run list's own date column, where what it filters is
 * obvious. Above the list it looked like it narrowed the list and did not: it
 * scoped a chart that no longer exists. A control whose subject has to be
 * explained is in the wrong place.
 */
export function TraceControls({
  projects,
  project,
}: {
  projects: TraceProject[];
  /** The project on screen, so the box can never name a different one. */
  project: TraceProject | null;
}) {
  return (
    <div className="trace-controls">
      <PickerSelect
        action={selectTraceProject}
        id="trace-project"
        name="project"
        label="Project"
        value={project?.path ?? ""}
        submitLabel="Show"
        options={projects.map((p) => ({
          value: p.path ?? "",
          // `name` for the entry whose project was never recorded: it has no
          // path, and its name is a stated unknown rather than a directory.
          label: `${p.path ?? p.name} — ${p.runs.toLocaleString()} run${p.runs === 1 ? "" : "s"}`,
        }))}
      />

    </div>
  );
}
