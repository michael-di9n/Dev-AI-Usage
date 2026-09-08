import { BAND_GLYPHS, type Band, type BandMeasure } from "../domain/runBands";
import { CoinMark, WrenchIcon } from "./icons";

/**
 * A run's cost or tool-call band, as marks you can count.
 *
 * The same device as the capability chevrons on AI maturity, for the same
 * reason: a number in a cell invites the reader to work out what it is out of,
 * and the answer here is a threshold pair they can change. Three positions,
 * some of them filled, needs no denominator printed beside it.
 *
 * Colour is never the only channel, and here it is the third. The count of
 * filled marks is the reading; the tone reinforces it; and the figure itself
 * is printed as text in the same cell, so a reader who cannot see the marks at
 * all still has the number. The `title` carries the arithmetic - the figure
 * and all three ranges - because a band with no rule beside it is a grade.
 *
 * Three states, three pictures, which is the whole point of the shape:
 *
 * - `step: null` - nothing was measured. No marks, and the cell prints an em
 *   dash. Never one mark: that would be a claim.
 * - `step: 0` - measured, and zero. Still no marks, because one would say "a
 *   little" where the answer is none, and a quarter of real runs call no tools.
 *   The cell prints the figure, which is what separates this from the above.
 * - `1`-`3` - that many filled, the rest left as outlines so the distance to
 *   the top stays visible in the same glyph.
 */
export function BandMarks({ band, measure, label }: {
  band: Band;
  measure: BandMeasure;
  /** What the marks are of, for the accessible name. */
  label: string;
}) {
  const Mark = measure === "cost" ? CoinMark : WrenchIcon;
  const filled = band.step ?? 0;

  return (
    <span
      className={`marks marks-${measure} marks-${filled}`}
      role="img"
      aria-label={`${label}: ${band.why}`}
      title={band.why}
    >
      {Array.from({ length: BAND_GLYPHS }, (_, i) => (
        <span key={i} className={i < filled ? "mark on" : "mark"}>
          <Mark />
        </span>
      ))}
    </span>
  );
}
