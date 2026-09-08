import { BAND_STEPS, TIER_TONE, type CapabilityBand } from "../domain/readiness";

/**
 * A capability's band, as three stacked chevrons in the corner of its cell.
 *
 * It replaced a struck seal with the tier number inside it. The seal was the
 * right object for the page's one headline figure and the wrong one repeated
 * eight times: a numbered badge invites the reader to work out what the
 * number is out of, and the answer differed by capability, so every cell had
 * to print its own ceiling beside it to be readable at all.
 *
 * Chevrons carry the same three steps without a scale to explain. Filled ones
 * are the band; the rest stay as outlines rather than disappearing, so the
 * distance to the top is visible in the same glyph - which is the thing a
 * number could only say by also stating its denominator.
 *
 * Stacked pointing up, bottom-filled-first, because that is the direction the
 * eye already reads as "more" - and it means the lowest chevron is the one
 * that fills for a capability that has just been started, which is where most
 * of them sit.
 *
 * Colour is never the only channel: the count of filled chevrons is the
 * reading, the metal reinforces it, and the cell states the rule in words
 * underneath. The whole thing is one labelled image rather than three
 * siblings a screen reader would have to add up.
 *
 * ## Two layers, and why the fill is its own group
 *
 * The three outlines are drawn once, always, and never move: they are the
 * scale, and two cells whose scales were different heights could not be
 * compared at a glance. The filled ones are a second group painted over the
 * top of them, at the same coordinates.
 *
 * That is what lets the fill be animated - it counts itself up, one chevron
 * at a time, and starts again - without the glyph ever losing a position. A
 * band that faded out would otherwise leave a hole where the scale should be,
 * and "one of three" and "one, drawn alone" are not the same picture. The
 * animation is decoration over a reading that is already complete underneath:
 * see the reduced-motion note in globals.css.
 */
export function BandChevrons({ band, label }: { band: CapabilityBand; label: string }) {
  /*
   * Three readings, not two, because band 0 covers two states. Nothing found
   * is "not configured". A count short of the capability's minimum - which
   * only hooks has, at 3 - is not: the cell beside this names a file and
   * counts what is in it, and a glyph announcing "not configured" over the
   * top of that would be the page contradicting itself. It reads out the
   * count and the minimum instead, and omits the band's name, which at 0 is
   * the word "none" and would say the same wrong thing.
   */
  const description =
    band.band > 0
      ? `${label}: ${band.name}, ${band.measured} — ${band.rule}`
      : band.instances > 0
        ? `${label}: ${band.measured} — ${band.rule}`
        : `${label}: not configured`;

  return (
    <span className={`chevrons chevrons-${TIER_TONE[band.band]}`}>
      <svg viewBox="0 0 24 28" width="24" height="28" role="img" aria-label={description}>
        {/* The scale. Bottom to top; index 0 is the lowest chevron. */}
        <g className="chev-track">
          {Array.from({ length: BAND_STEPS }, (_, i) => (
            <path key={i} className="chev" d={chevron(i)} />
          ))}
        </g>
        {/* The reading, over the scale. Empty at band 0, which is the whole of
            "not configured" - there is nothing to count up to. */}
        <g className="chev-fill">
          {Array.from({ length: band.band }, (_, i) => (
            <path key={i} className="chev on" d={chevron(i)} />
          ))}
        </g>
      </svg>
    </span>
  );
}

/** Index 0 is the lowest chevron, and each one above sits 8 units higher. */
function chevron(i: number): string {
  return `M3.5 ${25 - i * 8} L12 ${18 - i * 8} L20.5 ${25 - i * 8}`;
}
