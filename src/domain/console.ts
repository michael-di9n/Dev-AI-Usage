/**
 * Where a knob points.
 *
 * The Setup panel reads its figures off dials, and a dial has to say something
 * a number alone does not: whether this is a lot. That is a judgement, so it is
 * a rule table a reader can check rather than anything cleverer - and it is one
 * table, not one per dial.
 *
 * The one-table part is the whole point, and it is the AI maturity bands'
 * lesson repeated. Those used to be a ladder per capability, every rung honest
 * arithmetic, and unreadable, because "silver" meant something different in
 * each cell. So here: files kept and files expired are both counts, and they
 * are banded by the same three numbers. Bytes get the second table only because
 * a megabyte is not a file and no shared threshold could mean anything in both.
 *
 * The panel prints the thresholds beside the dials. A pointer that says "high"
 * without saying what high starts at is a grade, and this tool does not give
 * those.
 */

export const BANDS = ["none", "low", "medium", "high"] as const;
export type Band = (typeof BANDS)[number];

export interface Scale {
  /** Where medium begins. Anything above zero and below it is low. */
  readonly medium: number;
  /** Where high begins, and stays. */
  readonly high: number;
  /** Renders a threshold for the printed rule: "100", "10 MB". */
  readonly format: (n: number) => string;
}

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** Counts: transcripts kept, transcripts expired. */
export const COUNT: Scale = {
  medium: 100,
  high: 1_000,
  format: (n) => n.toLocaleString(),
};

/** Bytes on disk. */
export const BYTES: Scale = {
  medium: 10 * MB,
  high: 250 * MB,
  format: (n) => bytes(n),
};

/**
 * A measured zero is `none`; an unmeasured figure is null.
 *
 * These are the project's two rules meeting on one dial. A source that was
 * asked and answered nothing points at NONE, because nothing is a reading. A
 * source that was never asked - archiving switched off - has no pointer at all
 * and an em dash in the window, because a pointer resting on NONE would be this
 * panel inventing a measurement it never took.
 */
export function bandOf(value: number | null, scale: Scale): Band | null {
  if (value === null || !Number.isFinite(value)) return null;
  if (value <= 0) return "none";
  if (value >= scale.high) return "high";
  if (value >= scale.medium) return "medium";
  return "low";
}

/**
 * Degrees from vertical, one detent per band.
 *
 * A 270-degree sweep with the dead zone at the bottom, which is where a real
 * rotary control puts it: the gap is what tells you at a glance which way is
 * up on a knob with no stop.
 */
export const KNOB_ANGLE: Record<Band, number> = {
  none: -135,
  low: -45,
  medium: 45,
  high: 135,
};

/**
 * The rule, written out, so the dial's word can be checked against arithmetic.
 *
 * Stated by where each band starts rather than where it ends. "medium to
 * 10.0 MB" is what the other phrasing produces for a threshold of exactly ten
 * megabytes, which reads as a contradiction of the band above it.
 */
export function ruleOf(scale: Scale): string {
  const { format, medium, high } = scale;
  return `low under ${format(medium)} · medium under ${format(high)} · high ${format(high)} and over`;
}

export function bytes(n: number): string {
  if (n < KB) return `${n} B`;
  if (n < MB) return `${Math.round(n / KB)} kB`;
  if (n < GB) return `${(n / MB).toFixed(1)} MB`;
  return `${(n / GB).toFixed(2)} GB`;
}
