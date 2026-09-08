/**
 * The derived cost, as a stack of $100 coins.
 *
 * A unit chart, not decoration. A dollar figure at 48px is precise and hard to
 * feel; a pile you can count gives the same number a size. The two sit
 * together, so nothing here is the only way to read the total - which is what
 * lets the glyph be playful without the page becoming vague.
 *
 * Three rules it inherits from the rest of the project:
 *
 * - A missing number is never a zero. A null cost draws no coins and says so.
 *   An empty stack and "no cost figure" must not look like the same picture.
 * - Every figure carries its evidence. The caption always states the coin's
 *   value and what did not fit, so the stack can never round in silence.
 * - Colour is never the only channel. The count is in the caption as text.
 *
 * The coins drop into place when the page arrives. It is decoration over a
 * figure that is already printed twice beside it, which is the only footing on
 * which motion is allowed here - see the note on `.coin` in globals.css for
 * the reduced-motion default and why the drop's length does not grow with the
 * total.
 */

/** One coin. The whole chart is this number, so it is stated everywhere. */
const COIN_USD = 100;

/** A column is $1,000, which is what makes a glance countable: read the full
 *  columns as thousands and only the last one coin by coin. */
const PER_COLUMN = 10;

/** The stack stops at $10,000. Past that the pile stops being countable and
 *  starts being a wall, so the remainder goes to the caption as a number. */
const MAX_COLUMNS = 10;
const MAX_COINS = PER_COLUMN * MAX_COLUMNS;

// Geometry, in viewBox units. The pitch is deliberately under the rim height
// so coins overlap the way a real stack does rather than floating apart.
const RX = 16;
const RY = 5;
const RIM = 3.5;
const PITCH = 6.5;
const COLUMN_GAP = 38;
const BASE_Y = 84;
const HEIGHT = 96;
const EDGE = 3;

/**
 * How long the whole stack takes to land, in milliseconds.
 *
 * A budget rather than a per-coin delay, because the count is the data: at 60ms
 * a coin a $9,000 month would still be dropping six seconds after the page
 * arrived. Dividing the budget by the number of coins keeps the drop the same
 * length whatever the figure, so the animation never becomes a slow way of
 * saying the number is large - the caption says that, in words, immediately.
 */
const DROP_MS = 620;

export function CoinStack({ amountUsd }: { amountUsd: number | null }) {
  // Null is not zero: no priced messages means no figure to stack, which is a
  // different statement from "you spent under $100".
  if (amountUsd === null) {
    return (
      <figure className="coins">
        <Svg columns={[0]} ghost />
        <figcaption>No cost figure for this period · a coin would be ${COIN_USD}</figcaption>
      </figure>
    );
  }

  const coins = Math.floor(amountUsd / COIN_USD);
  const shown = Math.min(coins, MAX_COINS);
  const remainder = amountUsd - coins * COIN_USD;

  const columns: number[] = [];
  for (let filled = 0; filled < shown; filled += PER_COLUMN) {
    columns.push(Math.min(PER_COLUMN, shown - filled));
  }

  return (
    <figure className="coins">
      <Svg columns={columns.length > 0 ? columns : [0]} ghost={coins === 0} />
      <figcaption>{caption(coins, shown, remainder)}</figcaption>
    </figure>
  );
}

/**
 * What the stack is not showing.
 *
 * Every branch names the coin's value and the money that did not become one,
 * because a unit chart always rounds down and a reader who cannot see by how
 * much is being asked to trust the picture.
 *
 * That leftover used to be labelled "short of the next", which is the other
 * figure: $2,463.11 is $63.11 past its 24th coin and $36.89 short of its 25th.
 * The number was always the remainder the picture rounds off - which is the
 * one worth stating, and what the comment above has always said - so the
 * wording is what changed. A zero window is where it became impossible to
 * miss: "$0.00 short of the next" reads as a coin being one cent away.
 */
function caption(coins: number, shown: number, remainder: number): string {
  const left = `$${remainder.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (coins === 0) return `Not yet one coin · $${COIN_USD} a coin · ${left} so far`;
  if (shown < coins) {
    return `${shown} of ${coins.toLocaleString()} coins · $${COIN_USD} a coin · the stack stops at $${(MAX_COINS * COIN_USD).toLocaleString()}`;
  }
  return `${coins} coin${coins === 1 ? "" : "s"} · $${COIN_USD} a coin · ${left} beyond the last`;
}

/**
 * Hidden from assistive technology on purpose: the caption below already
 * carries the count and the units as text, and announcing both would read the
 * same fact twice with no extra meaning.
 */
function Svg({ columns, ghost = false }: { columns: number[]; ghost?: boolean }) {
  const width = 2 * RX + 2 * EDGE + (columns.length - 1) * COLUMN_GAP;
  const total = columns.reduce((a, b) => a + b, 0);
  const step = total > 1 ? DROP_MS / (total - 1) : 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${HEIGHT}`}
      width={width}
      height={HEIGHT}
      aria-hidden="true"
      focusable="false"
    >
      {columns.map((count, column) => {
        const cx = RX + EDGE + column * COLUMN_GAP;
        // One coin so the unit is visible even before the first one is earned.
        const drawn = ghost ? 1 : count;
        return (
          <g key={column} opacity={ghost ? 0.35 : 1}>
            {/* Bottom coin first, so each one above overlaps the one below and
                the stack reads as a stack rather than as a column of discs.
                The drop follows the same order for the same reason: a coin
                cannot land on one that is not there yet. */}
            {Array.from({ length: drawn }, (_, i) => (
              <Coin
                key={i}
                cx={cx}
                cy={BASE_Y - i * PITCH}
                outline={ghost}
                // The unearned coin is a placeholder, not a coin that was
                // counted, so it does not drop into anything.
                dropMs={ghost ? null : Math.round((column * PER_COLUMN + i) * step)}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * One coin: a rim and a face.
 *
 * The rim ellipse and the face ellipse share `rx`, so the rectangle between
 * them meets both at their widest point and the silhouette closes with no
 * corner poking out - which is why this is three primitives rather than a
 * hand-fitted path.
 *
 * The outline variant is the unearned coin, drawn flat with no rim: it has to
 * read as the shape of a coin rather than as a coin that is merely dim, or
 * "not yet $100" and "$100" become the same picture at a glance.
 *
 * `dropMs` is when this coin lands, as a custom property the stylesheet reads.
 * The delay is data-shaped - it depends on how many coins there are - so it
 * has to be written here; whether anything moves at all is the stylesheet's
 * decision, behind the reduced-motion guard. Null means this coin never
 * drops, and then no property is set and there is nothing for a rule to hang
 * an animation on.
 */
function Coin(
  { cx, cy, outline = false, dropMs = null }:
  { cx: number; cy: number; outline?: boolean; dropMs?: number | null },
) {
  const top = cy - RIM;
  return (
    <g
      className={dropMs === null ? undefined : "coin"}
      style={dropMs === null ? undefined : ({ "--drop": `${dropMs}ms` } as React.CSSProperties)}
    >
      {outline ? null : (
        <>
          <ellipse cx={cx} cy={cy} rx={RX} ry={RY} fill="var(--coin-edge)" />
          <rect x={cx - RX} y={top} width={RX * 2} height={RIM} fill="var(--coin-edge)" />
        </>
      )}
      <ellipse
        cx={cx}
        cy={top}
        rx={RX}
        ry={RY}
        fill={outline ? "none" : "var(--coin)"}
        stroke="var(--coin-line)"
        strokeWidth="1"
        strokeDasharray={outline ? "3 3" : undefined}
      />
      {/* The milled inner ring. Without it a face this small reads as a
          counter, not as money. */}
      <ellipse
        cx={cx}
        cy={top}
        rx={RX * 0.55}
        ry={RY * 0.55}
        fill="none"
        stroke="var(--coin-line)"
        strokeWidth="0.8"
        opacity="0.55"
      />
    </g>
  );
}
