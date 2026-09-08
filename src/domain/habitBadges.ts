/**
 * How this developer worked, in badges, measured per active day.
 *
 * Rule tables, like everything else here that concludes something: the same
 * input gives the same badge every run, a reader can check the arithmetic, and
 * every badge carries the figure it came from so the band can be argued with.
 *
 * ## Why per active day, again
 *
 * The same reason as the usage band. A total over a window rewards having been
 * around longer, which is not a habit. "Twenty skill calls" says nothing until
 * you know whether that was one afternoon or three months. Days with no work
 * are absent from the tables rather than counted as zero, so a fortnight off
 * does not quietly turn someone into a light user of everything.
 *
 * ## Two kinds of badge, and why they do not share a colour scheme
 *
 * A RANK badge measures more-of-something: skills invoked, subagents launched,
 * distinct tools reached for. More is genuinely more, so gold/silver/bronze
 * says something true and the bottom of the scale is "you did little of this".
 *
 * A SHAPE badge measures which of two habits, not how much of one. Using a
 * single model all week is not the bronze version of using four - it is a
 * different way of working, and this tool has no opinion about which is
 * better. Painting it bronze would be a verdict the data does not support, so
 * shape badges wear a neutral tone and say what happened instead.
 *
 * ## One day gets a band too, and why that is not a verdict
 *
 * There used to be a floor here: three active days before any band was shown,
 * and a second function that described a single day without one. It was
 * removed, because the arithmetic never needed it. The bands are rates per
 * active day, and a one-day window has one active day in its denominator - so
 * a day with twelve skill calls is twelve a day, exactly and checkably. The
 * floor was an opinion about how much evidence a reader should be allowed to
 * band, and it made the Today filter answer "not enough days" to someone who
 * had deliberately asked about one day.
 *
 * What stops the band becoming a verdict is the same thing that stops every
 * other figure here becoming one: it says what it divided by. `why` names the
 * count, the number of active days behind it and all three thresholds, so a
 * gold on one day reads as "that day ran at a gold rate" rather than as "this
 * is how you work". The heading says which of the two the reader has asked
 * for.
 *
 * ## These are local heuristics
 *
 * Not an Anthropic anything. Nothing in the app behaves differently because of
 * them, and the thresholds below were set by looking at a real corpus, not
 * handed down. They exist to answer "is that a lot?", which a bare count
 * cannot answer on its own.
 */

export type BadgeTone = "gold" | "silver" | "bronze" | "plain" | "info";

export interface Badge {
  id: BadgeId;
  /** What the chip says. */
  label: string;
  /** The figure behind it, short enough to sit under the label. */
  measure: string;
  /** One sentence naming the figure and the bands, for the tooltip. */
  why: string;
  tone: BadgeTone;
}

export type BadgeId = "skills" | "subagents" | "toolkit" | "models";

/**
 * Per active day. Read off a real corpus: a heavy month here runs about 3.5
 * skill calls, 6 subagents and 16 distinct tools a day, so the silver floors
 * sit near that and gold is meaningfully above it.
 */
export const BADGE_BANDS = {
  skills: { gold: 10, silver: 4, bronze: 1 },
  subagents: { gold: 10, silver: 3, bronze: 1 },
  toolkit: { gold: 20, silver: 10, bronze: 1 },
  /** Share of active days on which more than one model was used. */
  adaptiveShare: 0.5,
} as const;

export interface HabitInput {
  /** Days with at least one tool call. The denominator for the rank badges. */
  toolDays: number;
  skillCalls: number;
  subagentCalls: number;
  /** Distinct tool names, summed over each day. Not distinct across the whole
   *  window: reaching for twelve tools every day is a broader habit than
   *  reaching for twelve different ones once each. */
  distinctToolsPerDaySum: number;
  /** Days with at least one priced message. The denominator for the models badge. */
  modelDays: number;
  /** Of those, how many used more than one model. */
  multiModelDays: number;
}

/**
 * Always four badges. An empty window is a row of zeroes, not an absent row.
 *
 * This used to return null when the window held nothing, and the caller drew a
 * sentence instead. That was right while "nothing here" and "nothing imported"
 * were the same state; they are not. The page returns the getting-started
 * guide when the corpus is empty, so by the time this is called there is a
 * corpus - and a window inside it with no sessions is a window in which you
 * used no skills, launched no subagents and reached for no tools. Those are
 * measurements, and they are zero.
 *
 * What must not happen is a *rate* being invented for a window with no active
 * days. `zero()` is that case: it reports the count, which is nothing, and
 * says there was no denominator rather than dividing by one and printing
 * "0 a day" as if a day had been measured.
 */
export function habitBadges(input: HabitInput): Badge[] {
  return [
    input.toolDays > 0
      ? rank("skills", "skill", input.skillCalls, input.toolDays, BADGE_BANDS.skills, SKILL_LABELS)
      : zero("skills", "skill", SKILL_LABELS.none),
    input.toolDays > 0
      ? rank("subagents", "subagent", input.subagentCalls, input.toolDays, BADGE_BANDS.subagents, AGENT_LABELS)
      : zero("subagents", "subagent", AGENT_LABELS.none),
    input.toolDays > 0
      ? rank("toolkit", "distinct tool", input.distinctToolsPerDaySum, input.toolDays, BADGE_BANDS.toolkit, TOOLKIT_LABELS)
      : zero("toolkit", "distinct tool", TOOLKIT_LABELS.none),
    input.modelDays > 0
      ? modelShape(input.modelDays, input.multiModelDays)
      : zero("models", "model", "No models"),
  ];
}

/**
 * A window with no active days, stated rather than divided.
 *
 * The bottom-band label is the right one - "No skills" is what happened - but
 * the measure is a count and not a rate, because there was no day to divide
 * by. Printing "0 a day" here would be 0/0 dressed as a measurement, and the
 * tone stays off the metals for the same reason the label is the bottom rung:
 * nothing happened, which is not the bronze version of something.
 */
function zero(id: BadgeId, noun: string, label: string): Badge {
  return {
    id,
    label,
    measure: `no ${noun}s`,
    why:
      `Nothing recorded in this period, so there is no active day to divide by ` +
      `and no rate to report - the figure is a count, and it is zero. Widen the ` +
      `period for the ranked version.`,
    tone: "plain",
  };
}

// ---------------------------------------------------------------------------

const SKILL_LABELS = {
  gold: "Skill power user",
  silver: "Skill user",
  bronze: "Occasional skills",
  none: "No skills",
} as const;

const AGENT_LABELS = {
  gold: "Heavy delegator",
  silver: "Delegator",
  bronze: "Occasional delegate",
  none: "Works solo",
} as const;

const TOOLKIT_LABELS = {
  gold: "Wide toolkit",
  silver: "Broad toolkit",
  bronze: "Narrow toolkit",
  none: "No tools recorded",
} as const;

type RankLabels = { gold: string; silver: string; bronze: string; none: string };
type Bands = { gold: number; silver: number; bronze: number };

function rank(
  id: BadgeId,
  noun: string,
  total: number,
  days: number,
  bands: Bands,
  labels: RankLabels,
): Badge {
  const perDay = total / days;
  const tone: BadgeTone =
    perDay >= bands.gold ? "gold"
      : perDay >= bands.silver ? "silver"
        : perDay >= bands.bronze ? "bronze"
          : "plain";
  const key = tone === "plain" ? "none" : tone;

  return {
    id,
    label: labels[key],
    measure: `${round(perDay)} ${noun}${perDay === 1 ? "" : "s"} a day`,
    why:
      `${total.toLocaleString()} ${noun} call${total === 1 ? "" : "s"} over ${days} active ` +
      `day${days === 1 ? "" : "s"} — ${round(perDay)} a day. ` +
      `Bands per day: ${bands.bronze}+ bronze, ${bands.silver}+ silver, ${bands.gold}+ gold. ` +
      (days === 1
        ? `One active day, so this is the rate that day ran at rather than a habit. `
        : ``) +
      `A local heuristic, not an Anthropic tier.`,
    tone,
  };
}

/**
 * Adaptive or consistent - a shape, not a rank.
 *
 * Counted as "days you reached for more than one model", not as an average
 * number of models, because 1.66 models a day is not a figure anyone can
 * picture. "Two or more models on 14 of 29 days" is the same fact in a shape
 * a reader can check against their own memory of the month.
 */
function modelShape(days: number, multiDays: number): Badge {
  const share = multiDays / days;
  const adaptive = share > BADGE_BANDS.adaptiveShare;

  return {
    id: "models",
    label: adaptive ? "Adaptive" : "Consistent",
    measure: adaptive
      ? `${multiDays} of ${days} days mixed models`
      : `one model on ${days - multiDays} of ${days} days`,
    why:
      `More than one model on ${multiDays} of ${days} active day${days === 1 ? "" : "s"} ` +
      `(${Math.round(share * 100)}%). Above ${BADGE_BANDS.adaptiveShare * 100}% reads as adaptive, ` +
      `below it as consistent. Neither is better — this describes how you worked, ` +
      `not how well.`,
    // Deliberately not a metal: see the note at the top of this file. Calling
    // one habit bronze would be a verdict, and there is no verdict here.
    tone: "info",
  };
}

/** One decimal below ten, whole numbers above: "0.4 a day" and "16 a day" are
 *  both readable, "15.9 a day" is false precision. */
function round(value: number): string {
  return value >= 10 ? String(Math.round(value)) : (Math.round(value * 10) / 10).toString();
}
