import { selectSession, setOtelOnly, setRunsOpen, sortRuns } from "../app/trace-actions";
import type { TraceableSession } from "../db/QueryRepository";
import { bandOf, type RunBands } from "../domain/runBands";
import { ariaSort, type RunColumn, type RunOrder } from "../domain/runOrder";
import { describeRange, isFiltered, type DateRange } from "../domain/traceDates";
import { localDateMinute } from "../domain/localClock";
import { BandMarks } from "./BandMarks";
import { BandSettings } from "./BandSettings";
import { DateFilter } from "./DateFilter";
import { CaretIcon } from "./icons";

/**
 * Every recorded run of the selected project, and what each one cost.
 *
 * It replaced a drop-down, and then a list grouped by project. The grouping
 * went when the project became a control of its own at the top of the page:
 * two ways to narrow to one project is one more than anybody needs, and a
 * heading repeated down a column that only ever holds one project is a heading
 * that says nothing.
 *
 * The session id is the handle. It is what the export is named after, what a
 * bug report quotes, and the only stable thing about a run - the time it ended
 * is how you recognise it, the id is how you refer to it.
 *
 * ## Why cost and tool calls are here rather than only in the run
 *
 * The reader's first question about a list of runs is which one to open, and
 * until these two columns existed the only way to answer it was to open each
 * one. Both are drawn as marks you can count as well as printed as figures -
 * the marks make the expensive run visible down the column, the figures make
 * it checkable. They cost one query: both aggregates ride along on the query
 * that already lists the runs.
 *
 * ## Forms, not click handlers
 *
 * A form per row and per heading rather than a client component: the whole row
 * is the button, everything works with JavaScript off, and the sqlite driver
 * stays off the browser bundle's import path. The one client component here is
 * the threshold modal, which has nothing to do with the database.
 */
export function TraceRunList({
  sessions,
  selected,
  order,
  bands,
  open,
  range,
  total,
  otelOnly,
}: {
  sessions: TraceableSession[];
  /** The run on screen, so the list can never disagree with the tree. */
  selected: string | null;
  order: RunOrder;
  bands: RunBands;
  /** Collapsed is a glance, not a filter: the runs are all still counted. */
  open: boolean;
  /** The date filter in force, and what the project holds without it. */
  range: DateRange;
  total: number;
  /** Whether the list is narrowed to runs with at least one OTEL span. */
  otelOnly: boolean;
}) {
  return (
    <nav className={open ? "runs" : "runs shut"} aria-label="Recorded runs">
      <h2 className="runs-head">
        Recorded runs
        {/*
          A filtered list has to say what it is a subset of. Without the
          denominator the reader counts what is on screen and believes it is
          everything - the same bug as a share with no total beside it. The
          OTEL filter is scope, the same as the project itself, so it rides on
          `total` rather than needing a second denominator - it names itself
          in the caption instead.
        */}
        <span>
          {isFiltered(range)
            ? `${sessions.length.toLocaleString()} of ${total.toLocaleString()} · ${describeRange(range)}${otelOnly ? " · OTEL only" : ""}`
            : `${sessions.length.toLocaleString()} in this project${otelOnly ? " · OTEL only" : ""}`}
        </span>

        {/*
          A filter, not a glance - so it gets `aria-pressed`, not the
          `aria-expanded` the disclosure button beside it uses. Its own form:
          submitting either must never also submit the other's hidden value.
        */}
        <form action={setOtelOnly} className="otel-toggle">
          <input type="hidden" name="otel" value={otelOnly ? "false" : "true"} />
          <button
            type="submit"
            className="icon-btn otel-btn"
            aria-pressed={otelOnly}
            title={otelOnly ? "Show every run" : "Show only runs with an OTEL span"}
          >
            <span aria-hidden="true">{otelOnly ? "◆" : "◇"}</span>
            {/* Visible now, not just the accessible name: an icon nobody has
                learned yet is decoration, and "OTEL only" is what tells this
                control apart from the plain collapse chevron beside it. */}
            <span className="otel-btn-label">OTEL only</span>
          </button>
        </form>

        {/* The count stays visible when the list does not, so collapsing hides
            the rows and never the figure. */}
        <form action={setRunsOpen} className="runs-toggle">
          <input type="hidden" name="open" value={open ? "false" : "true"} />
          <button
            type="submit"
            className="icon-btn"
            aria-expanded={open}
            aria-controls="runs-body"
            title={open ? "Collapse the run list" : "Expand the run list"}
          >
            <CaretIcon open={open} />
            <span className="vh">{open ? "Collapse" : "Expand"} the run list</span>
          </button>
        </form>
      </h2>

      <div id="runs-body" hidden={!open}>
        {/* A header row, not a table: the rows below are buttons, and a button
            inside a <td> that has to fill the cell is a fight with the layout
            for no gain. The columns line up because both use the same grid. */}
        <div className="runs-cols" role="row">
          <SortHeader column="id" label="Trace id" order={order} />
          <SortHeader column="ended" label="Ended" order={order}>
            <DateFilter range={range} />
          </SortHeader>
          <SortHeader column="cost" label="Cost" order={order}>
            <BandSettings bands={bands} measure="cost" />
          </SortHeader>
          <SortHeader column="tools" label="Tools" order={order}>
            <BandSettings bands={bands} measure="tools" />
          </SortHeader>
        </div>

        <div className="runs-scroll">
          <ul>
            {sessions.map((session, i) => {
              const cost = bandOf(session.costUsd, "cost", bands);
              const tools = bandOf(session.toolCalls, "tools", bands);

              return (
                /*
                  `--i` is the row's place in the list, which the stylesheet
                  turns into the delay it prints on - the same `--i` and the
                  same keyframes the trace tree's own rows use, so a run list
                  and the run it opens arrive in one handwriting rather than
                  two.

                  It is data (it depends on how many runs there are) so it is
                  written here; whether anything moves at all is the
                  stylesheet's decision, behind the reduced-motion guard.

                  Keyed on the session, which is what stops this replaying: a
                  sort or a selection re-renders the list, React reorders the
                  same nodes rather than making new ones, and a CSS animation
                  only fires when its element is created. Rows that are
                  genuinely new - a different project, a changed date filter -
                  print, and rows that were already there stay put.
                */
                <li key={session.sessionId} style={{ "--i": i } as React.CSSProperties}>
                  <form action={selectSession}>
                    <input type="hidden" name="session" value={session.sessionId} />
                    <button
                      type="submit"
                      className={session.sessionId === selected ? "run on" : "run"}
                      // The list is a set of destinations, one of which you are
                      // already at. Colour alone would not say which.
                      aria-current={session.sessionId === selected ? "true" : undefined}
                      /*
                        The row count used to be a third line on every row. Cost
                        and tool calls answer "how big was this run" better than
                        a block count does, so it moved here rather than being
                        dropped - it is still the figure the page's own meta
                        line quotes for the open run.
                      */
                      title={`${session.sessionId} — ${session.blocks.toLocaleString()} rows, ${cost.measured} cost, ${tools.measured} tool calls`}
                    >
                      <span className="run-id">{session.sessionId.slice(0, 8)}</span>
                      <span className="run-when">{when(session)}</span>

                      {/* Figure and marks in one cell, the figure first. The
                          marks are the thing you can scan a column of; the
                          figure is the thing you can argue with. */}
                      <span className="run-cell">
                        <span className="run-fig">{cost.measured}</span>
                        <BandMarks band={cost} measure="cost" label="Cost" />
                      </span>
                      <span className="run-cell">
                        <span className="run-fig">{tools.measured}</span>
                        <BandMarks band={tools} measure="tools" label="Tool calls" />
                      </span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}

/**
 * One sortable column heading.
 *
 * A submit button rather than a link, because sorting is a stored choice and
 * this page writes it the way it writes every other one. `aria-sort` goes on
 * the cell and not the button: it describes the column, and a reader tabbing
 * through headings needs to hear which one is currently in force.
 *
 * `children` is the sliders control on the three columns that have one - the
 * date filter on Ended, and the thresholds on Cost and Tools. It sits outside
 * the sorting form, so clicking it opens the dialog and does not also re-sort:
 * two affordances share the cell and must never be the same click.
 */
function SortHeader({
  column,
  label,
  order,
  children,
}: {
  column: RunColumn;
  label: string;
  order: RunOrder;
  children?: React.ReactNode;
}) {
  const on = order.column === column;

  return (
    <span className="runs-col" role="columnheader" aria-sort={ariaSort(order, column)}>
      <form action={sortRuns}>
        <input type="hidden" name="column" value={column} />
        <button type="submit" className={on ? "col-sort on" : "col-sort"}>
          {label}
          {/* The arrow is only on the column actually sorted, and it points
              the way the values run. `aria-sort` above says the same thing to
              anyone who cannot see it. */}
          <span aria-hidden="true" className="col-arrow">
            {on ? (order.direction === "asc" ? "↑" : "↓") : ""}
          </span>
        </button>
      </form>
      {children}
    </span>
  );
}

/**
 * When the run finished, to the minute.
 *
 * Not a relative time. "3 days ago" has to be recomputed to be compared with
 * anything, and the commonest use of this list is lining a run up against a
 * commit or a note that carries a real date.
 */
function when(session: TraceableSession): string {
  if (!session.endedAt) return "not recorded";
  return localDateMinute(session.endedAt);
}
