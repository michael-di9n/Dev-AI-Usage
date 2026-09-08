/**
 * How much is a lot, for one run. Pure: no clock, no database, no model.
 *
 * A rule table, like everything else here that concludes something. Two
 * numbers per measure divide it into three bands, the same input always gives
 * the same band, and every band carries the figure and all three ranges so a
 * reader can disagree with it rather than take it on trust.
 *
 * ## Three states, not two
 *
 * The bands are drawn as a count of glyphs - coins for money, wrenches for
 * tool calls - and the count is the reading. That leaves three things to say
 * and they must not share a picture:
 *
 * - **Unanswerable.** No message in the run had a model this tool has a rate
 *   for. There is no figure, so there are no glyphs and the cell prints an em
 *   dash. `null` in, `null` band out.
 * - **Measured zero.** The run cost nothing, or called no tools. That is a
 *   figure and its value is zero, so the cell prints it - and still draws no
 *   glyphs, because one glyph would say "a little" where the answer is none.
 *   A quarter of the runs in a real corpus call no tools at all.
 * - **One, two or three.** Past zero, the thresholds decide.
 *
 * The first two rules are the project's two halves of the same rule, and this
 * is the one place they meet a shape rather than a number: `—` and `0` look
 * nothing alike, and neither looks like a single coin.
 *
 * ## The thresholds are the reader's
 *
 * They are stored, editable, and defaulted from a real corpus rather than
 * invented. The defaults split 264 recorded runs 150/48/43 by cost and
 * 142/42/80 by tool calls, which is a spread rather than a verdict - the point
 * of a band is to answer "is that a lot", and a band nothing ever falls into
 * cannot.
 */

/** Which measure a band is of. The two differ only in their numbers. */
export type BandMeasure = "cost" | "tools";

/** 0 is a measured zero; 1, 2 and 3 are the bands. Never a stand-in for null. */
export type BandStep = 0 | 1 | 2 | 3;

/** How many glyphs the top band draws, and therefore how many a row can hold. */
export const BAND_GLYPHS = 3;

export interface Thresholds {
  /** Below this is band 1. */
  fair: number;
  /** At or above this is band 3; between the two is band 2. */
  lots: number;
}

export type RunBands = Record<BandMeasure, Thresholds>;

/**
 * Read off the corpus, not handed down.
 *
 * Cost is the reader's own stated rule: under $10 is not much, $50 and up is a
 * lot. Tools takes the same two numbers, which is not a coincidence worth
 * hiding - one rule shape in both columns is a rule a reader can hold in their
 * head, and 10/50 splits the measured distribution about as evenly as 15/50 or
 * 20/60 do.
 */
export const DEFAULT_BANDS: RunBands = {
  cost: { fair: 10, lots: 50 },
  tools: { fair: 10, lots: 50 },
};

const MEASURE: Record<BandMeasure, { noun: string; format: (n: number) => string }> = {
  cost: { noun: "cost", format: (n) => usd(n) },
  tools: { noun: "tool calls", format: (n) => n.toLocaleString() },
};

export interface Band {
  /** Null only when there was no figure to band. */
  step: BandStep | null;
  /** The figure as the cell prints it: an em dash when there is none. */
  measured: string;
  /** One sentence naming the figure and all three ranges. */
  why: string;
}

/**
 * Band one figure.
 *
 * `null` is the absence and returns the absence. It is never coalesced: a run
 * whose models are all missing from the price table did not cost nothing, and
 * the difference is the whole reason this project exists.
 */
export function bandOf(value: number | null, measure: BandMeasure, bands: RunBands): Band {
  const { fair, lots } = bands[measure];
  const { noun, format } = MEASURE[measure];

  if (value === null) {
    return {
      step: null,
      measured: "—",
      why:
        `No ${noun} figure for this run. Nothing in it used a model with a row in ` +
        `the price table, so this is unmeasured rather than small.`,
    };
  }

  const step: BandStep = value <= 0 ? 0 : value < fair ? 1 : value < lots ? 2 : 3;
  const ranges =
    `under ${format(fair)} is one, ${format(fair)} to ${format(lots)} is two, ` +
    `${format(lots)} and up is three`;

  return {
    step,
    measured: format(value),
    why:
      step === 0
        ? `${format(value)} — measured, and zero. No mark is drawn, because one would say "a little". Bands: ${ranges}.`
        : `${format(value)} — ${step} of ${BAND_GLYPHS}. Bands: ${ranges}.`,
  };
}

/**
 * What came out of `app_state`, or the defaults.
 *
 * The stored value is a string this code did not necessarily write: an older
 * build's, or a row edited by hand. Anything that is not two finite, positive,
 * ascending numbers per measure falls back rather than throwing - a page that
 * will not render is a worse answer than a page showing the defaults, and a
 * threshold pair in the wrong order would band every run wrongly in silence.
 */
export function parseBands(stored: string | null): RunBands {
  if (!stored) return DEFAULT_BANDS;

  try {
    const raw: unknown = JSON.parse(stored);
    if (typeof raw !== "object" || raw === null) return DEFAULT_BANDS;

    const parsed = {
      cost: pair((raw as Record<string, unknown>).cost),
      tools: pair((raw as Record<string, unknown>).tools),
    };
    if (!parsed.cost || !parsed.tools) return DEFAULT_BANDS;
    return { cost: parsed.cost, tools: parsed.tools };
  } catch {
    return DEFAULT_BANDS;
  }
}

/** For the row `parseBands` reads back. */
export function formatBands(bands: RunBands): string {
  return JSON.stringify(bands);
}

/** Two finite, positive, ascending numbers, or nothing at all. */
function pair(raw: unknown): Thresholds | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { fair, lots } = raw as Record<string, unknown>;

  if (typeof fair !== "number" || typeof lots !== "number") return null;
  if (!Number.isFinite(fair) || !Number.isFinite(lots)) return null;
  if (fair <= 0 || lots <= 0 || fair >= lots) return null;

  return { fair, lots };
}

const usd = (n: number): string =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
