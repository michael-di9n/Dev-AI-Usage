/**
 * How heavily this developer uses the tool, in three bands.
 *
 * A rule table, like everything else that concludes something here: the same
 * input gives the same band every run, and a reader can check the arithmetic.
 *
 * ## Why output tokens
 *
 * "Tokens used" has three candidate meanings and only one of them is honest.
 * Total tokens is dominated by cache reads - measured on a real corpus, 98% of
 * input was cache reads, which cost about a twelfth of a cache write. Ranking
 * on that number would put anyone with a long session in the top band for
 * re-reading context they had already paid for. Input alone has the same
 * problem. Output tokens are what the model actually generated for you, are
 * unaffected by caching, and track the work produced.
 *
 * ## Why per active day
 *
 * A total over a window rewards having been around longer, which is not usage.
 * Per active day is comparable between someone two weeks in and someone two
 * years in. Days with no sessions are excluded rather than counted as zero -
 * a fortnight on holiday is not light usage, it is no data.
 *
 * It is also why one active day is enough to band. The denominator is active
 * days, so a window holding one of them divides by one, and the rate is the
 * figure that day actually ran at. There used to be a three-day floor here;
 * it was an opinion about how much evidence a reader should be allowed to see
 * banded, and it told someone on their first day that they had not worked
 * enough. Zero active days is the only case with no answer, because there is
 * nothing to divide by.
 *
 * ## The bands are a local heuristic
 *
 * They are not an Anthropic tier, a quota, or a limit, and nothing in the app
 * behaves differently because of them. They exist to answer "is this a lot?",
 * which is a question a single large number cannot answer on its own. The
 * badge states the figure it used so the band can be argued with.
 */

export type Tier = "power" | "medium" | "low";

/** Output tokens per active day. */
const POWER_FLOOR = 500_000;
const MEDIUM_FLOOR = 50_000;

/**
 * Below this many active days there is no band, only an em dash.
 *
 * One, and it cannot go lower: with no active days there is no denominator,
 * and `outputTokens / 0` is not a band. Everything above that divides by a
 * real number of days and reports the rate it got.
 */
const MIN_ACTIVE_DAYS = 1;

export interface UsageTierInput {
  outputTokens: number;
  activeDays: number;
}

export interface UsageTier {
  tier: Tier;
  /** What the badge says. */
  label: string;
  /** The figure the band came from, so the badge can show its own evidence. */
  outputPerDay: number;
  activeDays: number;
}

const LABELS: Record<Tier, string> = {
  power: "Power user",
  medium: "Medium user",
  low: "Low user",
};

/**
 * Null when there is not enough to say - which the UI must render as an em
 * dash, never as the bottom band. "Low user" on an empty database is a
 * fabricated judgement, and it is the exact bug this project exists to avoid.
 */
export function usageTier(input: UsageTierInput): UsageTier | null {
  if (input.activeDays < MIN_ACTIVE_DAYS || input.outputTokens <= 0) return null;

  const outputPerDay = Math.round(input.outputTokens / input.activeDays);
  const tier: Tier =
    outputPerDay >= POWER_FLOOR ? "power" : outputPerDay >= MEDIUM_FLOOR ? "medium" : "low";

  return { tier, label: LABELS[tier], outputPerDay, activeDays: input.activeDays };
}

/** One sentence naming the figure and the band it fell in. */
export function explainTier(verdict: UsageTier, days: number): string {
  return (
    `${verdict.outputPerDay.toLocaleString()} output tokens per active day, ` +
    `over ${verdict.activeDays} active day${verdict.activeDays === 1 ? "" : "s"} in the last ${days}. ` +
    `Bands: under ${MEDIUM_FLOOR.toLocaleString()} is low, ` +
    `${POWER_FLOOR.toLocaleString()} and above is power. ` +
    (verdict.activeDays === 1
      ? `One active day, so this is the rate that day ran at rather than a habit. `
      : ``) +
    `A local heuristic, not an Anthropic tier.`
  );
}

/**
 * Why there is no band yet, in the same voice.
 *
 * One case left. There is no floor to quote at anyone any more, so the only
 * thing this has to explain is an empty window - and `outputTokens <= 0`
 * lands here too, which is the same statement: nothing was generated, so
 * there is no rate to rank.
 */
export function explainNoTier(activeDays: number, days: number): string {
  return activeDays === 0
    ? `No sessions in the last ${days} days, so there is nothing to rank.`
    : `Nothing generated in the last ${days} days, so there is no rate to rank.`;
}

/** Exported for the tests and the docs, so the numbers cannot drift apart. */
export const TIER_BANDS = { POWER_FLOOR, MEDIUM_FLOOR, MIN_ACTIVE_DAYS };
