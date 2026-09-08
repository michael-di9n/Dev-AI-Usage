/**
 * The shell, while a page works out its answer.
 *
 * Every page here is `force-dynamic` and reads SQLite synchronously, so
 * without a loading boundary the browser sat on the previous page - or on a
 * blank one - until the whole render finished. On a large trace that was
 * seventeen seconds of nothing.
 *
 * Deliberately plain: no skeleton rows pretending to be data. This tool's one
 * rule is that a figure is never invented, and a grey box shaped like a number
 * is an invented number.
 */
export default function Loading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      Reading…
    </div>
  );
}
