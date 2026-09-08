import { MATURITY_TONE, type MaturityBand } from "../domain/readiness";

/**
 * A count, as a struck seal.
 *
 * A number set in 46px type states a fact; an object states that the fact is
 * the page's headline, which on this page it is - everything below it is the
 * evidence for this one figure. So the count gets a form rather than just a
 * size: a serrated rim, a face, an inner rule and the figure struck in the
 * middle, in the metal of its band.
 *
 * Drawn rather than lettered. A seal has to be a shape to read as one, and an
 * SVG polygon is cheaper here than the alternative - there is no font to load,
 * nothing to hydrate, and it scales with the type around it.
 */

/** Notches on the rim. Enough to read as milled, few enough to stay distinct
 *  at the sizes this renders at. */
const TEETH = 22;

/** The rim's two radii. The gap between them is what makes it look struck
 *  rather than merely round. */
const OUTER = 48;
const INNER = 43.5;

/** Alternating radii around the circle: the classic notarial seal edge. */
const rim = Array.from({ length: TEETH * 2 }, (_, i) => {
  const angle = (Math.PI * i) / TEETH - Math.PI / 2;
  const r = i % 2 === 0 ? OUTER : INNER;
  return `${(50 + r * Math.cos(angle)).toFixed(2)},${(50 + r * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

export function MaturitySeal({
  count,
  total,
  band,
  /** What is being counted. Two pages strike this seal over different things,
   *  and a screen reader hearing "capabilities" on the readiness ladder would
   *  be told about a measurement that page does not take. */
  unit = "capabilities configured",
}: {
  count: number;
  total: number;
  band: MaturityBand;
  unit?: string;
}) {
  return (
    <span className={`seal seal-${MATURITY_TONE[band]}`}>
      {/*
        One image with one label, rather than a number a screen reader has to
        assemble out of three sibling elements. The band is in the label
        because it is the only thing the colour carries, and colour reaches no
        screen reader at all.
      */}
      <svg
        viewBox="0 0 100 100"
        width="76"
        height="76"
        role="img"
        aria-label={`${count} of ${total} ${unit} — ${band}`}
      >
        <polygon className="seal-rim" points={rim} />
        <circle className="seal-face" cx="50" cy="50" r="41" />
        <circle className="seal-rule" cx="50" cy="50" r="35.5" />
        <text className="seal-n" x="50" y="51" textAnchor="middle" dominantBaseline="central">
          {count}
        </text>
      </svg>
    </span>
  );
}
