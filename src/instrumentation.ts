/**
 * What happens when the server starts, and keeps happening while it runs.
 *
 * `register` is Next's one hook that runs once per server instance, before it
 * accepts a request. Two things need it.
 *
 * The archive: Claude Code expires transcripts on a schedule this project does
 * not control, so the moment the dashboard is opened is the last reliable
 * moment to notice today's work exists and copy it. Waiting for someone to
 * remember `npm run run` is how a month goes missing.
 *
 * The import: without it the page is a snapshot of the last time somebody ran
 * the importer by hand, and a tab left open shows a "Today so far" that
 * quietly stopped moving.
 *
 * Neither is awaited. Next holds the server closed until `register` resolves,
 * and a first pass over a 150MB corpus takes a second or two - which would be
 * a second or two of blank page every time the dev server restarts. Both are
 * idempotent, so a pass still running when the first request lands costs
 * nothing but its own time.
 */
export async function register(): Promise<void> {
  // The edge runtime has no filesystem and no SQLite. Importing the app there
  // fails at module load, which would take the whole server down.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startBackgroundSync } = await import("./app/background-sync");
  startBackgroundSync();
}
