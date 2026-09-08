import type { ReactNode } from "react";

/**
 * The presentational vocabulary, in one file.
 *
 * `Value` carries the project's central rule: a missing number and a zero mean
 * different things - "this source does not record it" versus "it recorded none" -
 * so null renders an em dash and never 0.
 */

/**
 * A stat tile: icon, label, value, and an optional sub-line.
 *
 * The icon is wayfinding and sits at the muted step - it must not compete with
 * the number, which is the only thing on a tile allowed to be loud.
 *
 * `accent` exists for the one tile that is a live figure rather than a period
 * total, because "today so far" and "this month" side by side otherwise read
 * as two measurements of the same thing.
 *
 * `alert` is red, and it is the only red figure on the dashboard. It marks a
 * price class, not a verdict: these are the tokens charged at the full input
 * rate because no cache read or write covered them. The tile still only
 * reports - it says what was paid at full price, never that you were wrong to
 * pay it.
 */
export function Tile({ label, value, sub, icon, tone }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: "accent" | "alert";
}) {
  return (
    <div className={tone ? `tile tile-${tone}` : "tile"}>
      <div className="k">
        {icon ? <span className="k-icon">{icon}</span> : null}
        {label}
      </div>
      <div className="v">{value}</div>
      {sub ? <div className="s">{sub}</div> : null}
    </div>
  );
}

/**
 * A signed change, beside the figure it is a change from.
 *
 * Two decisions here.
 *
 * The comparison value is shown, not just the percentage. "+24% vs before"
 * asks the reader to hold the filter row in their head and work out what
 * "before" was; "+24% vs $1,983.44 last month" is the same fact with nothing
 * left to reconstruct. A percentage with no base is the shape of a claim
 * rather than of evidence, and this project does not ship those.
 *
 * The arrow is coloured, and the metals are the reason it can be. Spending
 * more is not failing and spending less is not winning, so red and green are
 * out - a green "down" would be this tool telling you what to want. Gold and
 * bronze carry no verdict: they are the two ends of a scale of quantity, which
 * is exactly what the arrow measures. They also sit at almost the same
 * luminance (1.03:1 in light mode), so under greyscale or full colour-vision
 * deficiency they are indistinguishable from each other - which is fine here
 * and only here, because the arrow glyph already states the direction and the
 * colour is the second channel rather than the only one.
 *
 * Past ten-fold, the percentage stops informing. "+7,851%" is arithmetically
 * true and tells a reader nothing they can hold; "x80" is the same fact in a
 * shape you can picture. Off a small base - a quiet first week, a new
 * machine - large ratios are the normal case here, not the exception.
 */
const MULTIPLIER_FLOOR = 10;

/** Compact, because this sits on a tile's sub-line: "3.4M" fits where
 *  "3,405,221" wraps, and the exact figure is in the table below. */
const COMPACT = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

const USD = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** On screen: short enough to sit on one line beside the change. */
const DELTA_FORMAT = {
  usd: USD,
  count: (v: number) => COMPACT.format(v),
} as const;

/** In the title: never rounded. The compact form is a convenience for the eye,
 *  and the exact figure has to stay reachable from the same element. */
const DELTA_EXACT = {
  usd: USD,
  count: (v: number) => v.toLocaleString(),
} as const;

export function Delta({ from, to, against, format = "count" }: {
  from: number | null;
  to: number | null;
  /** The comparison window, named: "last month", "yesterday". */
  against: string;
  format?: keyof typeof DELTA_FORMAT;
}) {
  const ratio = from === null || to === null || from === 0 ? null : to / from;

  if (ratio === null || !Number.isFinite(ratio)) {
    return (
      <>
        <span className="dash" title={`Nothing recorded ${against} to compare against`}>—</span>{" "}
        <span className="delta-vs">vs {against}</span>
      </>
    );
  }

  const rendered = DELTA_FORMAT[format](from!);
  const title = `${DELTA_EXACT[format](from!)} ${against}, ${DELTA_EXACT[format](to!)} now`;
  const direction = to! > from! ? "rise" : to! < from! ? "fall" : "flat";
  const arrow = direction === "rise" ? "\u2191" : direction === "fall" ? "\u2193" : "\u2192";

  return (
    <>
      <span className={`delta ${direction}`} title={title}>
        <span className="delta-arrow" aria-hidden="true">{arrow}</span>
        {magnitude(ratio)}
      </span>{" "}
      <span className="delta-vs">vs {rendered} {against}</span>
    </>
  );
}

function magnitude(ratio: number): string {
  if (ratio >= MULTIPLIER_FLOOR || (ratio > 0 && ratio <= 1 / MULTIPLIER_FLOOR)) {
    const factor = ratio >= MULTIPLIER_FLOOR ? ratio : 1 / ratio;
    return `\u00d7${factor < 10 ? factor.toFixed(1) : Math.round(factor).toLocaleString()}`;
  }
  const pct = (ratio - 1) * 100;
  const rounded = Math.abs(pct) < 1 ? Math.round(pct * 10) / 10 : Math.round(pct);
  return `${Math.abs(rounded).toLocaleString()}%`;
}

export function Value({ n, suffix = "", digits = 0 }: { n: number | null; suffix?: string; digits?: number }) {
  if (n === null || !Number.isFinite(n)) {
    return <span className="dash" title="Not recorded by this source">—</span>;
  }
  return <>{n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}{suffix}</>;
}

export function Usd({ n }: { n: number | null }) {
  if (n === null) return <span className="dash" title="No cost figure for this row">—</span>;
  return <>${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>;
}

export function Pct({ part, whole }: { part: number; whole: number }) {
  if (whole === 0) return <span className="dash">—</span>;
  return <>{((part / whole) * 100).toFixed(1)}%</>;
}

/** Soft tinted pill. Each tone's text clears 5.9:1 on its own background. */
export function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  const known = ["ok", "busy", "warn", "high", "info", "plain"].includes(tone) ? tone : "plain";
  return <span className={`pill ${known}`}>{children}</span>;
}

export function Section({ title, note, action, children }: {
  title: string;
  note?: ReactNode;
  /**
   * A control belonging to the section, on the heading's right.
   *
   * Added for Trace's export button, which sat under the note taking a line to
   * itself. A section's one action belongs on the section's own line: it is
   * about everything below it, not about the sentence above it.
   */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="section-head">
        <h2>{title}</h2>
        {action ? <div className="section-action">{action}</div> : null}
      </div>
      {note ? <p className="note">{note}</p> : null}
      {children}
    </section>
  );
}

/** A table's own footer, so "how much am I looking at" is always answered. */
export function TableFoot({ showing, total, note }: { showing: number; total: number; note?: ReactNode }) {
  return (
    <div className="table-foot">
      <span>
        Showing <strong>{showing}</strong> of {total.toLocaleString()}
      </span>
      {note ? <span style={{ marginLeft: "auto" }}>{note}</span> : null}
    </div>
  );
}

/** Shortens a long absolute path to its last two segments for display. */
export function shortPath(path: string | null): string {
  if (!path) return "unknown";
  const parts = path.split("/").filter(Boolean);
  return parts.length <= 2 ? path : parts.slice(-2).join("/");
}

/** Maps a finding's severity onto a pill tone. */
export function severityTone(severity: string): string {
  if (severity === "high") return "high";
  if (severity === "warn") return "warn";
  return "info";
}
