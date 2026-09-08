import { explainNoTier, explainTier, usageTier, type Tier } from "../domain/usageTier";
import { app } from "../app/dashboard";

/**
 * The usage band, under the figure it is a reading of.
 *
 * It used to be a chip in the top bar of every page, which put a thirty-day
 * rank next to the page title on four pages that are not about volume at all -
 * and on Trends it sat above and apart from the one number it is derived from.
 * It is on Trends now, directly under the derived cost, where the two figures
 * can be read as one sentence.
 *
 * Struck at size, and that is the point of it. As a 12px chip it was a piece
 * of the frame; at this size it is the second thing the page says after the
 * cost, which is the right weight for the answer to "is that a lot". The words
 * went the other way to pay for it: the paragraph that used to sit beside the
 * chip is gone, and what is left is the rank, the figure it came from and the
 * window - the three things a reader needs to check it. The rest - both
 * thresholds, the active-day count, and that it is a local heuristic - is in
 * the tooltip, which is where it was even when the paragraph was there.
 *
 * A fixed window rather than the page's period filter, so the band does not
 * change meaning when the chart below it is narrowed to today. The window is
 * named on the band for that reason: beside a one-day cost figure, a
 * thirty-day rank has to say it is not reading the same slice.
 *
 * Reads the database directly rather than taking a prop: it is one figure over
 * a window of its own, and threading it through the page's props would tie it
 * to the period it deliberately ignores.
 */
export const WINDOW_DAYS = 30;

/**
 * Gold, silver, bronze - a podium, which is what a rank of three is.
 *
 * The three metals sit at nearly the same luminance, so colour alone would be
 * useless in greyscale, in print, and to a reader with full colour-vision
 * deficiency. It is the third channel here, never the only one: the word is
 * set larger than anything else on the band, and the medal's face carries the
 * rank as marks that differ in count.
 */
const MEDAL: Record<Tier, { tone: string; rank: 1 | 2 | 3 }> = {
  power: { tone: "gold", rank: 1 },
  medium: { tone: "silver", rank: 2 },
  low: { tone: "bronze", rank: 3 },
};

export async function UsageBand() {
  const window = app().queries.usageWindow(WINDOW_DAYS);
  const verdict = usageTier(window);

  // No band is a real answer, and it renders as a dash on an unstruck medal.
  // "Low user" on an empty database would be a judgement invented out of
  // nothing, and a band that simply vanished would take the question with it.
  if (!verdict) {
    return (
      <div className="usage-band none" title={explainNoTier(window.activeDays, WINDOW_DAYS)}>
        <UsageMedal rank={null} />
        <div className="usage-band-text">
          <strong>No band yet</strong>
          <span>{explainNoTier(window.activeDays, WINDOW_DAYS)}</span>
        </div>
      </div>
    );
  }

  const medal = MEDAL[verdict.tier];
  return (
    <div
      className={`usage-band ${medal.tone}`}
      title={explainTier(verdict, WINDOW_DAYS)}
    >
      <UsageMedal rank={medal.rank} />
      <div className="usage-band-text">
        <strong>{verdict.label}</strong>
        <span>
          {compact(verdict.outputPerDay)} output tokens a day
          {" · "}
          last {WINDOW_DAYS} days
        </span>
      </div>
    </div>
  );
}

/**
 * The medal, drawn rather than lettered.
 *
 * Deliberately not the struck seal the AI maturity page uses. That one is a
 * notarial seal with a serrated rim, and it means "this many of eight
 * capabilities"; this is a ribboned medal and it means "this rank of three".
 * Two different measurements should not arrive as the same object at two
 * sizes.
 *
 * `rank` is null when there is no band, and then the face carries a dash and
 * the whole thing is drawn as an outline - visibly a medal that was never
 * struck, rather than a fourth rank in a duller metal. The sway and the glint
 * are both off in that state for the same reason: an unstruck medal swinging
 * and catching the light would be the page acting pleased about a rank it has
 * just said it cannot give.
 */
function UsageMedal({ rank }: { rank: 1 | 2 | 3 | null }) {
  return (
    <svg
      className="usage-medal"
      viewBox="0 0 100 100"
      width="88"
      height="88"
      aria-hidden="true"
      focusable="false"
    >
      {/* Everything hangs off the ribbon, so everything is in one group: it
          rocks about the point the straps meet at, which is the only way a
          medal moves. See `.medal-swing` in globals.css. */}
      <g className="medal-swing">
        {/* Two straps, behind the disc. Same for all three ranks: the ribbon
            says "this is a rank", the face says which. */}
        <path className="medal-ribbon" d="M28 4 L44 52 L34 56 L18 8 Z" />
        <path className="medal-ribbon" d="M72 4 L56 52 L66 56 L82 8 Z" />

        <circle className="medal-disc" cx="50" cy="62" r="31" />
        {/* The glint: a short arc of the inner ring, at full strength where
            the ring itself is faint, travelling round it and fading as it
            goes. It carries nothing - it is the same circle in the same
            colour, and with motion off it is not drawn at all. */}
        <circle className="medal-gleam" cx="50" cy="62" r="24" />
        <circle className="medal-ring" cx="50" cy="62" r="24" />

      {/* The rank, as marks that differ in count as well as in shape - one
          upward arrow, two bars, one bar. Countable in greyscale, which the
          three metals are not. */}
        {rank === 1 ? (
          <path className="medal-mark" d="M50 74 L50 51 M40 61 L50 51 L60 61" />
        ) : null}
        {rank === 2 ? <path className="medal-mark" d="M39 55 h22 M39 69 h22" /> : null}
        {rank === 3 ? <path className="medal-mark" d="M39 62 h22" /> : null}
        {rank === null ? <path className="medal-mark" d="M41 62 h18" /> : null}
      </g>
    </svg>
  );
}

/** 1,234,567 -> 1.2M. The band names the unit, and the tooltip carries the
 *  exact figure. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}
