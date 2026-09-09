import { GettingStarted, NothingYet } from "../../../components/GettingStarted";
import { Page } from "../../../components/Page";
import { Section } from "../../../components/primitives";
import { RunCostBar } from "../../../components/RunCost";
import { TraceControls } from "../../../components/TraceControls";
import { TerminalPanel } from "../../../components/TerminalPanel";
import { TracePath } from "../../../components/TracePath";
import { TraceRunList } from "../../../components/TraceRunList";
import { TraceTree } from "../../../components/TraceTree";
import { showFewerRows, showMoreRows } from "../../trace-actions";
import { DEFAULT_TRACE_ROWS, TRACE_ROWS_STEP } from "../../../domain/traceTree";
import { UsageBand } from "../../../components/UsageBand";
import { onboarding } from "../../dashboard";
import { traceView } from "../../trace";

export const dynamic = "force-dynamic";

/**
 * One project's runs, and one of them step by step.
 *
 * Scoped by a project picker at the top, because the question people bring
 * here is what a project did across several runs rather than what one session
 * numbered 2dd3fbcc happened to do. The choice is the same one AI maturity and
 * Readiness make, so the app has a current project rather than three of them,
 * and it survives leaving the tab.
 *
 * The tree used to be followed by three paragraphs explaining its em dashes,
 * its blank thinking rows and its cut bodies. All three were true and none was
 * about this run: they described how the tool works, every time, under every
 * trace. They live in the docs now, and the rows that need a word carry it
 * themselves.
 */
export default async function TracePage() {
  const state = onboarding();

  // The one genuine absence: nothing imported, so no session has a trace.
  if (state.showGuide) {
    return (
      <Page title="Trace" lede="One session, step by step.">
        <GettingStarted state={state} />
        <UsageBand />
      </Page>
    );
  }

  const view = traceView();

  return (
    <Page
      title="Trace"
      lede="What a project's runs cost, and any one of them step by step — the prompt, each tool call and its arguments, and what came back."
      meta={
        view.selected
          ? view.rows.shown < view.rows.total
            ? `${view.rows.shown.toLocaleString()} of ${view.rows.total.toLocaleString()} rows`
            : `${view.rows.total.toLocaleString()} rows`
          : undefined
      }
    >
      {view.nothingCaptured ? (
        <Section title="Nothing captured yet">
          <div className="panel panel-pad">
            <NothingYet
              what="Transcripts are imported, but none of their text was kept."
              command="npm run ingest"
            />
            <p className="note">
              Trace text is stored as transcripts are read, and this database was built
              before that existed. Re-reading them fills it in without losing anything:
              clear <code>ingest_cursor</code> and import again. Do not delete{" "}
              <code>data/usage.db</code> to force it — Claude Code has expired most of
              the transcripts it was built from, so a rebuild would drop those sessions
              for good. <code>data/archive.db</code> is untouched either way.
            </p>
          </div>
        </Section>
      ) : null}

      {view.project ? (
        <>
          {/* Both controls above everything they scope, acting on change. */}
          <TraceControls projects={view.projects} project={view.project} />

          {view.problem ? <p className="note">{view.problem}</p> : null}

          <div className="trace-layout">
            <TraceRunList
              sessions={view.sessions}
              selected={view.selected?.sessionId ?? null}
              order={view.order}
              bands={view.bands}
              open={view.runsOpen}
              range={view.range}
              total={view.total}
              otelOnly={view.otelOnly}
            />

            <div className="trace-main">
              {view.tree && view.selected ? (
                <Section
                  title="The run"
                  note={
                    <>
                      <code>{view.selected.sessionId}</code> — the id this run is
                      referred to by, and what its export is named after.
                    </>
                  }
                  action={
                    /*
                      Links, not buttons that build a blob: the browser's own
                      save dialog, a filename from the server, and both work
                      with JavaScript off. The routes read the same database
                      this page did.

                      Two, because "export" was one word for two questions.
                      This run is the one on screen and always was - the route
                      is named after its session id - but a button reading only
                      "Export JSON" beside a list of five hundred runs does not
                      say which of them it means. Naming it does.
                    */
                    <span className="trace-exports">
                      <a
                        className="btn primary"
                        href={`/api/trace/${view.selected.sessionId}`}
                        download
                      >
                        Export this run
                      </a>
                      {/*
                        Every run the page currently offers - this project,
                        narrowed by the date filter - so the button and the list
                        beside it can never mean different sets. The count is on
                        the label because "all" is the word that most needs a
                        number next to it.
                      */}
                      <a className="btn" href="/api/trace/all" download>
                        Export all {view.sessions.length.toLocaleString()}
                        {view.range.from || view.range.to ? " in range" : ""}
                      </a>
                    </span>
                  }
                >
                  {/* The bar, not a row of figures. It frames the tree with
                      where the money went rather than only how much, and the
                      totals stay under it so nothing was traded away. */}
                  {view.cost ? <RunCostBar cost={view.cost} /> : null}

                  {/* Keyed on the session, so the rows print themselves in
                      again when a different run is chosen and no row stays
                      open - or skipped - from the session before it. */}
                  <TerminalPanel key={view.selected.sessionId}>
                    {view.tree.roots.length === 0 ? (
                      <NothingYet what="This session recorded no prompts or tool calls." />
                    ) : (
                      <TraceTree nodes={view.tree.roots} />
                    )}
                  </TerminalPanel>

                  {/*
                    Both numbers, always, when rows are being held back. Drawing
                    every row of a long run cost 15.7 seconds of a 17-second
                    load, so the page draws the beginning of it and says so - a
                    row not on screen is one this chose not to draw, and saying
                    only "500 rows" would make it look like the run was short.
                  */}
                  {view.rows.shown < view.rows.total || view.rows.shown > DEFAULT_TRACE_ROWS ? (
                    <div className="trace-more">
                      <p className="note">
                        {view.rows.shown < view.rows.total ? (
                          <>
                            Showing the first {view.rows.shown.toLocaleString()} of{" "}
                            {view.rows.total.toLocaleString()} rows, in order. Export this
                            run always contains the whole of it.
                          </>
                        ) : (
                          <>
                            Showing all {view.rows.total.toLocaleString()} rows.
                          </>
                        )}
                      </p>
                      <span className="trace-more-acts">
                        {view.rows.shown < view.rows.total ? (
                          <form action={showMoreRows}>
                            <input type="hidden" name="total" value={view.rows.total} />
                            <button type="submit" className="btn">
                              Show {Math.min(
                                TRACE_ROWS_STEP,
                                view.rows.total - view.rows.shown,
                              ).toLocaleString()} more
                            </button>
                          </form>
                        ) : null}
                        {/* The way back. The budget is stored, so without this
                            a reader who asked for more would carry a slow page
                            into every later visit with no way to undo it. */}
                        {view.rows.shown > DEFAULT_TRACE_ROWS ? (
                          <form action={showFewerRows}>
                            <button type="submit" className="btn">
                              Back to the first {DEFAULT_TRACE_ROWS.toLocaleString()}
                            </button>
                          </form>
                        ) : null}
                      </span>
                    </div>
                  ) : null}

                  {/*
                    The shape of the run, under the whole of it.

                    Below the tree rather than above it because the tree is
                    what the page is for and the strip is a reading of it: put
                    first, it was a summary of something the reader had not
                    seen yet. Read in this order the section is the run, then
                    the run at a glance - and the glance is what you leave
                    with.
                  */}
                  {view.path ? <TracePath path={view.path} fresh={view.freshSteps} /> : null}

                  {view.tree.unjoined.length > 0 ? (
                    <p className="note">
                      {view.tree.unjoined.length.toLocaleString()} span
                      {view.tree.unjoined.length === 1 ? "" : "s"} arrived for this
                      session that no transcript row claims. They are counted here
                      rather than dropped, because work that happened should not
                      vanish for want of a join.
                    </p>
                  ) : null}
                </Section>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </Page>
  );
}
