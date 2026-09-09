/**
 * Tells the open trace-tap terminal that its answer may have changed.
 *
 * The terminal used to re-render on a timer, which meant it was either slow
 * (a long interval) or wasteful (a short one) with no way to be both fast and
 * idle. Two things can make its answer stale, and both notify here: an OTLP
 * receiver route decoding a record, and an import pass linking a brand-new
 * session to its project - the live evidence is scoped by project, so a
 * session OTLP already heard from stays invisible to it until that link
 * exists. Both run in this one server process - see `src/db/CLAUDE.md` on
 * `Application` being one per process - so a module-level set of listeners
 * is the whole mechanism. No queue, no cross-process bus, because there is
 * only one process to cross.
 *
 * Deliberately not on `Application`: this has nothing to do with the
 * database, and giving it a home there would be a second reason for that
 * class to change.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Called whenever something the trace-tap terminal reads from may have changed. */
export function notifyLiveChange(): void {
  for (const listener of listeners) listener();
}

/** Subscribes until the returned function is called. */
export function onLiveChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
