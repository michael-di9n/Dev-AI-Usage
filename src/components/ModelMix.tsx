import type { ModelUsage } from "../db/QueryRepository";
import { ModelFamilyIcon } from "./icons";
import { Usd } from "./primitives";

/**
 * Where the hero figure went, split by model.
 *
 * It sits inside the cost section because it is not a new measurement - it is
 * the same money, taken apart. What changed is where in the card: the bar is
 * now the figure's underline rather than a footnote on the card floor, and the
 * rows carry the dollars.
 *
 * The dollars are the point of the redesign. This strip used to show shares
 * alone and keep the money in each row's `title`, which put the base of every
 * percentage behind a hover - unreachable by touch, and invisible to anyone
 * reading the page rather than probing it. A percentage with no base is the
 * shape of a claim rather than of evidence, which is the one thing this project
 * does not ship. So the rows are a small ledger now: mark, name, dollars,
 * share, largest first, and the dollars column adds up to the figure above it.
 *
 * A pie was the obvious alternative and is the wrong form for this data. A real
 * corpus here runs 99.1% / 0.8% / 0.1% / 0.0%; as a circle that is a solid disc
 * with a scratch in it, and the minimum arc a reader can see would draw 1.1%
 * where the truth is 0.05%. A bar takes the same distortion at a twentieth the
 * size - see MIN_SEGMENT_PCT - and the rows below carry the exact figures
 * either way.
 *
 * Three rules it keeps, because they are not decoration:
 *
 * - A missing number is never a zero. A model the price table has no rate for
 *   shows an em dash and draws no segment, and the caption then says how many
 *   are in that state.
 * - A real number never rounds to zero either. See SHARE_FLOOR_PCT.
 * - Colour is never the only channel. Each mark is a glyph before it is a
 *   colour - three strokes for a haiku, a page of lines for a sonnet, a note
 *   for an opus - so the strip survives greyscale, and the name and the dollars
 *   are written beside it either way.
 */

/**
 * Marks the bar draws before it folds the tail into one.
 *
 * Four, because that is how many hues in `--mix-1..4` separate cleanly. Once
 * folding starts only three are drawn individually, so the fold gets a colour
 * of its own instead of sharing the fourth model's - two adjacent slices in
 * one hue is not a bar anyone can read. Every model keeps its own row below
 * regardless, so this decides how the bar is drawn and never what it counts.
 */
const SEGMENTS = 4;

/**
 * The smallest share the rows will print as a number.
 *
 * Below it they print "<0.1%" instead. A model that cost $0.48 out of $8,819 is
 * 0.005% of the money, and one decimal renders that "0.0%" - the same false
 * zero this project refuses everywhere else, arrived at by rounding rather than
 * by a missing source. The dollars are on the row beside it, so nothing here is
 * hidden; this only stops the share column from stating a zero that is not one.
 */
const SHARE_FLOOR_PCT = 0.05;

/**
 * The narrowest segment the bar will draw, as a percentage of its width.
 *
 * The one place this bar is deliberately not to scale. A model at 0.005% of the
 * quarter is a hundredth of a pixel and simply would not be drawn - so the bar
 * would show one model where the rows name four, and the ones it dropped are
 * the ones nobody would notice missing. Held in the component rather than in
 * CSS because the arithmetic has to come off the largest segment: a floor
 * applied by `min-width` silently pushes the total over 100% and the last
 * segment off the end of the track.
 */
const MIN_SEGMENT_PCT = 0.6;

export function ModelMix({ models, period }: { models: ModelUsage[]; period: string }) {
  // Reachable, just barely: a window holding only your own messages and
  // Claude Code's local notices has messages but no model. Saying so in one
  // muted line beats vanishing, which would read as a rendering fault rather
  // than as an answer.
  if (models.length === 0) {
    return <div className="mix"><p className="mix-foot">no model recorded {period}</p></div>;
  }

  const priced = models.filter((m) => m.costUsd !== null);
  const total = priced.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);
  const unpriced = models.length - priced.length;

  const drawnCount = priced.length > SEGMENTS ? SEGMENTS - 1 : priced.length;
  const folded = priced.slice(drawnCount);
  const foldedUsd = folded.reduce((sum, m) => sum + (m.costUsd ?? 0), 0);

  const share = (usd: number) => (total > 0 ? (usd / total) * 100 : 0);

  const slices = [
    ...priced.slice(0, drawnCount).map((m, i) => ({ key: m.model, label: shortModel(m.model), usd: m.costUsd ?? 0, tone: i + 1 })),
    ...(folded.length > 0
      ? [{ key: " rest", label: `${folded.length} more`, usd: foldedUsd, tone: SEGMENTS }]
      : []),
  ];

  const widths = segmentWidths(slices.map((s) => share(s.usd)));

  /** The slice a model's money is in, which is the colour its mark wears. */
  const toneOf = (index: number) => Math.min(index + 1, drawnCount + 1);

  return (
    <div className="mix">
      {total > 0 ? (
        <div
          className="mix-bar"
          role="img"
          aria-label={`Share of derived cost by model: ${slices.map((s) => `${s.label} ${shareText(share(s.usd))}`).join(", ")}`}
        >
          {slices.map((s, i) => (
            <i
              key={s.key}
              className={`mix-seg mix-${s.tone}`}
              style={{ width: `${widths[i]}%` }}
              title={`${s.label} · ${shareText(share(s.usd))}`}
            />
          ))}
        </div>
      ) : null}

      {/* A ledger, not a wrapping row of chips. It was the second once, when a
          row was a name and a share and reading them as a set was the whole
          job. With the dollars on it the columns are the job: the eye runs
          down them and lands on the figure above, and a wrapping row would put
          two models' money on one line with nothing lining up. */}
      <ul className="mix-list">
        {models.map((m, i) => (
          <li
            key={m.model}
            className={m.costUsd === null ? "mix-off" : `mix-${toneOf(i)}`}
            title={detail(m, period)}
          >
            <ModelFamilyIcon model={m.model} />
            <span className="mix-name">{shortModel(m.model)}</span>
            <span className="mix-usd"><Usd n={m.costUsd} /></span>
            <span className="mix-pct">
              {m.costUsd === null
                ? <span className="dash" title="No published rate, so no share of the total">—</span>
                : shareText(share(m.costUsd))}
            </span>
          </li>
        ))}
      </ul>

      <p className="mix-foot">
        share of derived cost
        {unpriced > 0 ? ` · ${unpriced} unpriced, not drawn` : ""}
      </p>
    </div>
  );
}

/**
 * One decimal, or "<0.1%" for a share too small to have one.
 *
 * Both the bar's label and the rows go through here, so the two can never
 * disagree about what a sliver is called.
 */
function shareText(pct: number): string {
  if (pct > 0 && pct < SHARE_FLOOR_PCT) return `<${SHARE_FLOOR_PCT * 2}%`;
  return `${pct.toFixed(1)}%`;
}

/**
 * Widths that hold the floor without overflowing the track.
 *
 * Every segment under the floor is raised to it, and the total raise comes off
 * the largest segment - the only one with pixels to spare, and the only one
 * where a fraction of a percent is not visible. The widths still sum to 100,
 * so the last segment ends flush with the end of the bar.
 */
function segmentWidths(shares: number[]): number[] {
  const raised = shares.map((s) => Math.max(s, MIN_SEGMENT_PCT));
  const owed = raised.reduce((sum, w) => sum + w, 0) - shares.reduce((sum, s) => sum + s, 0);
  if (owed <= 0) return raised;

  const largest = raised.indexOf(Math.max(...raised));
  const widths = [...raised];
  widths[largest] = Math.max(MIN_SEGMENT_PCT, widths[largest]! - owed);
  return widths;
}

/**
 * Everything the rows do not print, on the row that owns it.
 *
 * The message and token counts, and the full model id: a reader who wants to
 * know whether a model's money came from many cheap answers or a few expensive
 * ones asks here. The dollars used to live in this string and now do not -
 * they are on the page, which is where the base of a percentage belongs.
 */
function detail(m: ModelUsage, period: string): string {
  const cost = m.costUsd === null ? "no published rate, so no derived cost" : `derived ${period}`;
  return `${m.model} · ${cost} · ${m.messages.toLocaleString()} messages · ${m.outputTokens.toLocaleString()} output tokens`;
}

/**
 * The model's name, minus the dated build suffix.
 *
 * `claude-haiku-4-5-20251001` and `claude-haiku-4-5` are the same model to a
 * reader, and the date is eight characters of noise on a strip this small. The
 * full id stays in the row's `title`, so nothing is lost - only shortened.
 */
export function shortModel(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}
