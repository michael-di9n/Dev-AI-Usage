import { setOtelOnly, setRunRange } from "../app/trace-actions";

/**
 * The pane with no run in it, saying why and offering the way out.
 *
 * The run list's filters can hide every run, and the page used to answer
 * that with one sentence above the layout and a blank main pane under it -
 * correct, and read as broken, because the eye lands on the empty space and
 * not on the line. It happened on a real machine the day tracing was turned
 * on: the span filter kept only runs with a span, the date filter kept only
 * the days before that, and the two together kept nothing while a run with
 * spans sat one day outside the range.
 *
 * So the empty pane says it twice - once in words, once as buttons - and each
 * button says what it will produce, counted, because "clear the filter" is a
 * gamble and "show the 1 run with spans outside these dates" is a decision.
 * Only the filters actually in force get a button: a way out of a filter that
 * is not on is noise. Forms, like every other stored choice on this page.
 */
export function TraceEmpty({
  problem,
  widen,
}: {
  /** The sentence `traceView` already wrote about why the list is empty. */
  problem: string | null;
  widen: { dates: number | null; otel: number | null };
}) {
  const runs = (n: number): string => `${n.toLocaleString()} run${n === 1 ? "" : "s"}`;

  return (
    <div className="panel panel-pad nothing trace-empty">
      <p className="guide-p">
        <b>No run to show.</b> {problem}
      </p>
      <p className="note">
        The filters on Recorded runs decide what is listed here: the date filter under
        <em> Ended</em>, and the <em>OTEL only</em> switch, which keeps runs that have at
        least one span. A span arrives only for a session started after the traces exporter
        was set.
      </p>
      {widen.dates !== null || widen.otel !== null ? (
        <div className="trace-more-acts">
          {widen.dates !== null ? (
            <form action={setRunRange}>
              <button type="submit" name="window" value="all" className="btn">
                Show every date — {runs(widen.dates)}
              </button>
            </form>
          ) : null}
          {widen.otel !== null ? (
            <form action={setOtelOnly}>
              <input type="hidden" name="otel" value="false" />
              <button type="submit" className="btn">
                Show runs without spans — {runs(widen.otel)}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
