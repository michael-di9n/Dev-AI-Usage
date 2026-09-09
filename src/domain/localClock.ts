/**
 * Turns a stored UTC instant into the reader's local wall clock.
 *
 * Every timestamp this app stores - `ts`, `startedAt`, `endedAt`, `lastSeen` -
 * is ISO 8601 UTC, because that is what SQLite and the transcripts hand over.
 * Printing it verbatim shows the reader someone else's day: on a UTC+10
 * machine, `09:14` in the database is `19:14` on the clock beside it, and a
 * timestamp that is wrong by exactly the reader's own offset is worse than
 * one that is missing, because it reads as plausible.
 *
 * `new Date` parses the `Z`, and the plain (non-`UTC`) getters below read it
 * back through the runtime's own timezone - which is this machine's, since
 * nothing here is served over a network. Same approach `domain/period.ts`
 * takes for calendar boundaries, applied to a single instant instead of a
 * window.
 *
 * Unparseable input is returned unchanged rather than guessed at: a clock
 * that shows the wrong time silently is worse than one that shows raw text.
 */
const pad = (n: number): string => String(n).padStart(2, "0");

function localParts(ts: string): { date: string; minute: string; second: string } | null {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;

  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    minute: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    second: pad(d.getSeconds()),
  };
}

/** `2026-09-09T09:14:40.597Z` on a UTC+10 machine -> `2026-09-09 19:14:40`. */
export function localDateTime(ts: string): string {
  const p = localParts(ts);
  return p ? `${p.date} ${p.minute}:${p.second}` : ts;
}

/** Minute precision, for a column that has no use for seconds. */
export function localDateMinute(ts: string): string {
  const p = localParts(ts);
  return p ? `${p.date} ${p.minute}` : ts;
}

/** Time of day only, for a log line whose own order already says "newest first". */
export function localTime(ts: string): string {
  const p = localParts(ts);
  return p ? `${p.minute}:${p.second}` : ts;
}
