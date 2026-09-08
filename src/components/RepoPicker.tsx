"use client";

import { PickerSelect } from "./PickerSelect";
import { selectRepo } from "../app/repo-actions";

/**
 * The project selector, at the top of the page it scopes.
 *
 * Two ways in, because either can be the only one available: the list is empty
 * on a fresh clone with no transcripts, and a repository you have never opened
 * Claude Code in will never appear in it.
 *
 * A select rather than a table of every project. The list comes from every
 * transcript ever written, which on a working machine is dozens of paths, most
 * of them touched once months ago. Rendering all of them buries the two or
 * three you actually work in.
 *
 * Changing the select scans, with no second click. A scan measured 1-2ms and
 * writes nothing, so there is nothing for a confirm step to protect: the button
 * only stood between the reader and the answer they had already asked for. The
 * free-text path keeps its button, because there is no moment during typing
 * when a half-finished path is the one you meant.
 */
export function RepoPicker({
  projects,
  selected,
  cwd,
  compact = false,
}: {
  projects: { path: string; sessions: number; exists: boolean }[];
  /** The path currently scanned, so the box shows what the page is showing. */
  selected: string | null;
  cwd: string;
  compact?: boolean;
}) {
  // Only paths that still resolve. These come from transcripts that may be
  // months old, so a moved or deleted repository is the ordinary case.
  const usable = projects.filter((p) => p.exists);

  /*
   * A selection typed by hand, or one whose repository has since moved, is not
   * in the list. It still has to be the option the select shows, or the box
   * would name a different project from the one the page is reporting on.
   */
  const listed = selected !== null && usable.some((p) => p.path === selected);
  const options = listed || selected === null ? usable : [{ path: selected, sessions: 0, exists: true }, ...usable];

  return (
    <div className={compact ? "picker compact" : "picker"}>
      {!compact ? (
        <>
          <h2>Which repository?</h2>
          <p className="note">
            Pick one to see how much of Claude Code it actually configures.
          </p>
        </>
      ) : null}

      {options.length > 0 ? (
        /* Ordered by session count upstream, so with nothing stored the first
           option is the project you have worked in most. */
        <PickerSelect
          action={selectRepo}
          id="repo-select"
          name="path"
          label="Project"
          value={selected ?? options[0]!.path}
          submitLabel="Scan"
          options={options.map((p) => ({
            value: p.path,
            label:
              p.sessions > 0
                ? `${p.path} — ${p.sessions.toLocaleString()} session${p.sessions === 1 ? "" : "s"}`
                : p.path,
          }))}
        />
      ) : (
        <p className="note">
          No projects to list yet
        </p>
      )}

      <form action={selectRepo} className="picker-form">
        <label htmlFor="repo-path">Or scan any directory</label>
        <div className="picker-row">
          <input
            id="repo-path"
            name="path"
            type="text"
            defaultValue={compact ? "" : cwd}
            placeholder="/path/to/a/repository"
            spellCheck={false}
          />
          <button type="submit" className="btn primary">Scan</button>
        </div>
      </form>
    </div>
  );
}
