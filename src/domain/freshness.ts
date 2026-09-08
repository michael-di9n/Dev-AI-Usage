/**
 * How old the numbers on screen are.
 *
 * A figure nobody can tell is stale is worse than an obviously empty page: the
 * empty page sends you to fix it, and the stale one gets acted on. So the age
 * of the last import is stated wherever the figures are, and it is a
 * measurement rather than a reassurance - "4 minutes ago", not "up to date".
 *
 * Pure, and takes both instants as arguments, so it is testable without
 * waiting for time to pass.
 */

export interface Freshness {
  /** "just now", "4 minutes ago", "yesterday". */
  phrase: string;
  /**
   * True once the figures are old enough that a reader should not assume they
   * include this morning. Not an error - the importer may simply be off.
   */
  stale: boolean;
  minutes: number | null;
}

/**
 * Three times the sync interval, floored at fifteen minutes.
 *
 * Relative to the interval because "stale" means "older than this install
 * intends", not a fixed number. Three passes rather than one, so a single
 * skipped or slow import does not cry wolf.
 */
export function staleAfterMinutes(syncSeconds: number): number {
  return Math.max(15, Math.round((syncSeconds * 3) / 60));
}

/** Null `lastSyncAt` means it has never imported, which is not the same as old. */
export function freshnessOf(
  lastSyncAt: string | null,
  now: Date,
  syncSeconds: number,
): Freshness {
  if (lastSyncAt === null) {
    return { phrase: "never", stale: true, minutes: null };
  }

  const then = new Date(lastSyncAt);
  if (Number.isNaN(then.getTime())) {
    return { phrase: "unknown", stale: true, minutes: null };
  }

  // Clamped at zero: a clock change, or a database copied from another
  // machine, can put the stamp in the future, and "in -3 minutes" reads as a
  // bug in this code rather than as the clock problem it is.
  const minutes = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 60_000));

  return {
    phrase: phraseFor(minutes),
    stale: minutes >= staleAfterMinutes(syncSeconds),
    minutes,
  };
}

function phraseFor(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
