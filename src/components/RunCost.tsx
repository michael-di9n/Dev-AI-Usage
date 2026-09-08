import type { RunCost as RunCostData } from "../app/trace";
import type { CostClass, CostPart } from "../domain/costSplit";
import { Decode } from "./Decode";
import { CacheReadIcon, CacheWriteIcon, CoinIcon, InputIcon, OutputIcon, ToolIcon } from "./icons";

/**
 * Where one run's money went: a bar, and the chips that read it.
 *
 * Every figure is `costOf` called with one class of token and the rest zeroed,
 * so the segments add up to the total by construction rather than by a second
 * multiplication that could drift from it.
 *
 * Tool calls are counted beside the money and deliberately not in it. A tool
 * call has no price of its own - what it costs is the input tokens its result
 * becomes on the next turn, which are already in the input segment. Giving it
 * a slice would mean counting the same money twice, and dropping the count
 * would hide the thing that drives the input side of most runs.
 *
 * ## One object, where there used to be two
 *
 * The four token classes had their own section further down the page, under a
 * heading and a paragraph. The bar and its own legend say the same thing in
 * the place the reader is already looking - above the run they are about to
 * read - so the section went and the legend came here. The explanation that
 * lived in that paragraph is on the chips themselves now: each one carries the
 * class's one-line description as its tooltip, which is where a reader asks
 * for it, rather than as prose everybody scrolls past.
 */
const ICONS: Record<CostClass, React.ReactNode> = {
  input: <InputIcon />,
  cacheRead: <CacheReadIcon />,
  cacheWrite: <CacheWriteIcon />,
  output: <OutputIcon />,
};

export function RunCostBar({ cost }: { cost: RunCostData }) {
  const { split } = cost;
  const drawable = split.parts.filter((p) => (p.share ?? 0) > 0);

  return (
    <div className="rc-top">
      <div className="rc-bar" role="img" aria-label={barLabel(cost)}>
        {drawable.length > 0 ? (
          drawable.map((part) => (
            <span
              key={part.cls}
              className={`rc-seg rc-${part.cls}`}
              style={{ flexGrow: part.share ?? 0 }}
              title={`${part.label} — ${usd(part.costUsd)} of ${usd(split.totalUsd)}`}
            />
          ))
        ) : (
          /* A run that priced nothing gets one flat segment rather than an
             empty box: an empty bar and a broken bar look the same, and one of
             them is a measurement. */
          <span className="rc-seg rc-none" />
        )}
      </div>

      {/*
        The total first, then the four classes it divides into, then the count
        that is not money at all. Read left to right that is a sentence: this
        is what it cost, this is where it went, and this is what it did.

        `--i` is the chip's place in the row, which the stylesheet turns into
        the delay it arrives on. It is data - it depends on how many chips
        there are - so it is written here; whether anything moves at all is the
        stylesheet's decision, behind the reduced-motion guard.
      */}
      <p className="rc-badge">
        <Chip i={0} cls="total" icon={<CoinIcon />} label="cost" figure={usd(split.totalUsd)} what="Everything below, added up. Derived from published rates, never a bill." />
        {split.parts.map((part, i) => (
          <Chip
            key={part.cls}
            i={i + 1}
            cls={part.cls}
            icon={ICONS[part.cls]}
            label={part.label}
            figure={usd(part.costUsd)}
            sub={tokens(part)}
            what={part.what}
          />
        ))}
        <Chip
          i={split.parts.length + 1}
          cls="tools"
          icon={<ToolIcon />}
          label="tool calls"
          figure={cost.toolCalls.toLocaleString()}
          what="Never billed directly — a tool call's result is charged as input tokens on the next turn, which is most of the input segment. Counted here rather than given a slice, because a slice would be the same money twice."
        />
      </p>

      {split.unpriced ? (
        <p className="note rc-short">
          Part of this run used a model with no row in the price table, so the total is
          short by an unknown amount rather than wrong by a known one.
        </p>
      ) : null}
    </div>
  );
}

/**
 * One reading, as a chip.
 *
 * The icon carries the class colour and the shape carries the meaning, so the
 * chip can be matched to its segment without reading the label and still works
 * for anyone who cannot tell the four hues apart. The figure is text either
 * way - colour is never the only channel here, and it is not even the second.
 *
 * `what` is the one-line explanation that used to be a paragraph under a
 * heading. As a tooltip it is where a reader reaches for it instead of where
 * they scroll past it.
 */
function Chip({ i, cls, icon, label, figure, sub, what }: {
  i: number;
  cls: CostClass | "total" | "tools";
  icon: React.ReactNode;
  label: string;
  figure: string;
  sub?: string;
  what: string;
}) {
  return (
    <span
      className={`rc-chip rc-${cls}`}
      style={{ "--i": i } as React.CSSProperties}
      title={`${label} — ${figure}${sub ? ` · ${sub}` : ""}. ${what}`}
    >
      <span className="rc-chip-icon" aria-hidden="true">{icon}</span>
      {/*
        The figure decodes itself in, staggered by the chip's place in the row
        - the same `--i` the stylesheet uses for the chip's own arrival, so the
        two are one movement rather than two rhythms fighting. Only the figure:
        the label is what the figure means and it is worth nothing arriving a
        beat later than the number it names.
      */}
      <b><Decode text={figure} delayMs={420 + i * 90} /></b>
      <span className="rc-chip-label">{label}</span>
    </span>
  );
}

const barLabel = (cost: RunCostData): string =>
  cost.split.parts
    .map((p) => `${p.label} ${p.share === null ? "unknown" : `${Math.round(p.share * 100)}%`}`)
    .join(", ");

/** Null is a dash, never $0.00 - the model was not priced, it was not free. */
const usd = (n: number | null): string =>
  n === null
    ? "—"
    : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const tokens = (part: CostPart): string =>
  `${compact(part.tokens)} tokens${part.share === null ? "" : ` · ${Math.round(part.share * 100)}%`}`;

/** 1,234,567 -> 1.2M. The exact figure is in the chip's own tooltip. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}
