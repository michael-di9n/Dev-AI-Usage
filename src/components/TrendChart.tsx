"use client";

import { useId, useState } from "react";
import type { Granularity } from "../domain/period";

export interface SeriesPoint {
  /** The first instant of the bucket, as an ISO date. */
  date: string;
  value: number;
  /**
   * True for a bucket the query padded in from before the selected period.
   *
   * Drawn muted, behind a divider, and counted in a line under the chart.
   * Blending it into the series would make the chart's own table disagree
   * with the total above it, which is the failure the single period filter
   * exists to prevent.
   */
  beforePeriod?: boolean;
}

const WIDTH = 1100;
const HEIGHT = 200;
/** The bottom pad is the x-axis band. Sized in, not excluded, so the card
 *  never grows a nested scrollbar to reach its own labels. */
const PAD = { top: 14, right: 14, bottom: 26, left: 56 };

/**
 * Hand-rolled SVG rather than a charting library.
 *
 * One series over a date axis. A library would add a client bundle and a
 * theming problem to something that renders from the page's own tokens.
 *
 * A client component only for the hover layer. An HTML chart is interactive by
 * default - a reader aims at a date, never at a 2px line - so the crosshair
 * snaps to the nearest bucket rather than requiring a hit on the mark. Every
 * value it shows is also in the table below it, so nothing is gated behind a
 * pointer: keyboard and touch readers lose nothing.
 */
/**
 * How to render a value. A name, not a function.
 *
 * This is a client component, and a server component cannot hand a function
 * across that boundary - React rejects it at render time, and TypeScript
 * cannot see the boundary to warn you. So the caller names a format and the
 * formatting lives here.
 */
export type ValueFormat = "usd" | "count";

const FORMATTERS: Record<ValueFormat, (value: number) => string> = {
  usd: (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  count: (v) => Math.round(v).toLocaleString(),
};

/**
 * Which palette token draws the series. A name rather than a colour, so a
 * chart cannot be given one that the theme has never measured for contrast.
 */
export type ChartTone = "accent" | "alert";

const TONE_TOKEN: Record<ChartTone, string> = {
  accent: "var(--accent)",
  alert: "var(--high-fg)",
};

export function TrendChart({ points, label, granularity, valueFormat, tone = "accent" }: {
  points: SeriesPoint[];
  label: string;
  granularity: Granularity;
  valueFormat: ValueFormat;
  tone?: ChartTone;
}) {
  const format = FORMATTERS[valueFormat];
  const stroke = TONE_TOKEN[tone];
  const [active, setActive] = useState<number | null>(null);
  const clipId = useId();

  /*
   * The chart is always drawn.
   *
   * There used to be two bail-outs here: one bucket printed "A trend needs at
   * least two" and no buckets printed "No data in this period yet", both in
   * place of the graph. Neither was worth the page it took. The reader picked
   * a period and asked for a chart of it; withholding the axes to lecture
   * them about sample size answers a question nobody asked, and it made the
   * commonest case of all - looking at today before the day has got going -
   * the one case the page refuses to draw.
   *
   * So both cases render. One bucket is a labelled dot on a real axis, which
   * is the same fact the sentence carried and in the place the eye was already
   * looking. No buckets is the frame with its baseline at zero, which is what
   * an empty window measured.
   *
   * What is NOT done is joining a lone point into a line, or spreading one
   * bucket's value across the width. A dot is a dot.
   */
  const empty = points.length === 0;
  // A stand-in bucket so an empty window still has a baseline to draw. Its
  // date is never rendered: `empty` suppresses the axis labels, the value
  // label, the hover layer and the table, all of which would otherwise be
  // reporting a bucket that does not exist.
  const drawn: SeriesPoint[] = empty ? [{ date: "", value: 0 }] : points;

  const values = drawn.map((p) => p.value);
  const max = niceCeiling(Math.max(...values, 1));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;

  // A lone bucket sits in the middle of the plot rather than pinned to the
  // left edge, where it reads as the start of a line that failed to draw.
  const x = (i: number) =>
    drawn.length === 1
      ? PAD.left + plotW / 2
      : PAD.left + (plotW * i) / Math.max(drawn.length - 1, 1);
  const y = (v: number) => PAD.top + plotH - (plotH * v) / max;

  /*
   * An empty window is drawn as a flat line along the floor rather than as a
   * lone dot. It is the honest shape: no rows anywhere in the window means
   * every bucket in it was zero, which is a line, and one dot at the middle
   * would claim a single bucket had been measured.
   */
  const path = (from: number, to: number) =>
    values
      .slice(from, to + 1)
      .map((v, n) => `${n === 0 ? "M" : "L"}${x(from + n).toFixed(1)},${y(v).toFixed(1)}`)
      .join(" ");

  /*
   * Where the selected period starts, as an index. Everything before it was
   * padded in to give a lone point some context, so it is drawn as its own
   * muted path - including the segment that joins the two, which belongs to
   * the run it comes out of rather than to the period.
   */
  const padded = drawn.filter((p) => p.beforePeriod).length;
  const first = padded;

  /*
   * Every drawn point can be padding.
   *
   * On the first morning of a period - a fresh "today" before the day's first
   * session - the query pads backwards for context and the period itself
   * contributes no bucket at all. `path(first, ...)` then slices nothing and
   * returns "", which made `area` start with " L" and the browser reject the
   * whole path: four console errors, and no area under the lead-in.
   *
   * The period is genuinely empty here, so it is drawn the way an empty window
   * is drawn - a flat line along the floor - while the padded run keeps its own
   * muted path beside it. A measured zero, not a missing figure.
   */
  const periodHasPoints = first <= values.length - 1;
  const floor = `M${PAD.left},${y(0)} L${WIDTH - PAD.right},${y(0)}`;

  const line = empty || !periodHasPoints ? floor : path(first, values.length - 1);
  const before = padded > 0 ? path(0, first) : "";
  // The area is the period's own, so it starts where the period does.
  const area =
    empty || !periodHasPoints
      ? ""
      : `${line} L${x(values.length - 1).toFixed(1)},${y(0)} L${x(first).toFixed(1)},${y(0)} Z`;

  // Label the last point and the peak, and nothing else. A value on every
  // point is chaos and goes unread; the axis and the tooltip carry the rest.
  const lastIndex = drawn.length - 1;
  /*
   * The peak is the period's peak, not the padding's. A muted lead-in that
   * happened to be busier would otherwise take the one value label the chart
   * has, and put it on a bucket the page is not reporting on.
   */
  const periodValues = values.slice(padded);
  const peakIndex = padded + periodValues.indexOf(Math.max(...periodValues));
  const labelled = empty
    ? []
    : [...new Set(peakIndex === lastIndex ? [lastIndex] : [peakIndex, lastIndex])];

  const ticks = empty ? [] : axisTicks(drawn.length);
  const hovered = active === null ? null : drawn[active];

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        role="img"
        aria-label={`${label}, by ${granularity}`}
        onPointerLeave={() => setActive(null)}
        onPointerMove={(event) => {
          // Nothing to snap to in an empty window, and a crosshair over a
          // bucket that does not exist would report a value nobody measured.
          if (empty) return;
          // Snap to the nearest bucket in viewBox space, so the reader aims at
          // a date rather than at the line itself.
          const box = event.currentTarget.getBoundingClientRect();
          const vbX = ((event.clientX - box.left) / box.width) * WIDTH;
          const ratio = (vbX - PAD.left) / plotW;
          const index = Math.round(ratio * (drawn.length - 1));
          setActive(Math.min(drawn.length - 1, Math.max(0, index)));
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        {/* Solid hairlines, one step off the surface. Dashes read as a
            threshold when this is only a grid. */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="var(--line-soft)"
              strokeWidth="1"
            />
            <text x={PAD.left - 10} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
              {compact(max * f)}
            </text>
          </g>
        ))}

        <g clipPath={`url(#${clipId})`}>
          <path d={area} fill={stroke} opacity="0.1" />
          {/* The padded run, and the boundary. Muted and thinner, so the eye
              reads it as lead-in rather than as part of the answer. */}
          {before ? (
            <>
              <path
                d={before}
                fill="none"
                stroke="var(--muted)"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity="0.6"
              />
              <line
                x1={x(first)}
                x2={x(first)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--line)"
                strokeWidth="1"
              />
            </>
          ) : null}
          <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </g>

        {/* The crosshair. Drawn under the marker so the dot stays on top. */}
        {active !== null ? (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={PAD.top}
            y2={PAD.top + plotH}
            stroke="var(--muted)"
            strokeWidth="1"
          />
        ) : null}

        {/* End and peak markers: >=8px, with a 2px surface ring so they stay
            legible where they cross the line. */}
        {labelled.map((i) => (
          <circle
            key={`m${i}`}
            cx={x(i)}
            cy={y(values[i]!)}
            r="4"
            fill={stroke}
            stroke="var(--panel)"
            strokeWidth="2"
          />
        ))}

        {active !== null ? (
          <circle
            cx={x(active)}
            cy={y(values[active]!)}
            r="4.5"
            fill={stroke}
            stroke="var(--panel)"
            strokeWidth="2"
          />
        ) : null}

        {labelled.map((i) => (
          <text
            key={`l${i}`}
            x={x(i)}
            y={y(values[i]!) - 10}
            textAnchor={i === lastIndex && i !== 0 ? "end" : "middle"}
            fontSize="11.5"
            fontWeight="600"
            fill="var(--text)"
          >
            {format(values[i]!)}
          </text>
        ))}

        {ticks.map((i) => (
          <text
            key={`t${i}`}
            x={x(i)}
            y={HEIGHT - 8}
            textAnchor={drawn.length === 1 ? "middle" : i === 0 ? "start" : i === lastIndex ? "end" : "middle"}
            fontSize="11"
            fill="var(--muted)"
          >
            {axisLabel(drawn[i]!.date, granularity)}
          </text>
        ))}
      </svg>

      {/* Values lead, the label follows: the reader has the date and wants the
          number. Rendered in the flow rather than floating, so it cannot be
          clipped by the card and needs no positioning maths. */}
      <div className="chart-readout" aria-live="polite">
        {empty ? (
          /* The measurement, not a complaint about it: an empty window is a
             window of zeroes, and this says which zero. */
          <>
            <strong>{format(0)}</strong>
            <span>every {granularity} of this period</span>
          </>
        ) : hovered ? (
          <>
            <strong>{format(hovered.value)}</strong>
            <span>
              {axisLabel(hovered.date, granularity, true)}
              {hovered.beforePeriod ? " · before this period" : ""}
            </span>
          </>
        ) : padded > 0 ? (
          /* The one thing the reader has to be told: some of this is not in
             the period, so the chart's own table will not add up to the
             figure above it. */
          <span className="chart-hint">
            The {padded} muted {granularity}
            {padded === 1 ? "" : "s"} on the left are before this period, shown for
            context. Hover any {granularity} for its figure.
          </span>
        ) : (
          /* The same hint whatever the bucket count. A lone point already
             carries its value as a label, and a hint that counted the buckets
             for the reader would be the sample-size note coming back in by
             the side door. */
          <span className="chart-hint">Hover the chart for any single {granularity}.</span>
        )}
      </div>

      {/*
        The table twin. Every figure the chart draws is here as text, so the
        hover layer only ever enhances - a keyboard or screen-reader user, or
        anyone on a touch screen with no hover at all, loses nothing. Collapsed
        by default because the chart is the point when you can see it.
      */}
      <details className="chart-table" hidden={empty}>
        <summary>All {drawn.length} values as a table</summary>
        <div className="panel-scroll">
          <table>
            <thead>
              <tr>
                <th>{COLUMN_HEADING[granularity]}</th>
                <th className="num">{label}</th>
              </tr>
            </thead>
            <tbody>
              {drawn.map((point) => (
                <tr key={point.date}>
                  <td>{point.date}</td>
                  <td className="num">{format(point.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** At most five x labels: an axis cannot carry ninety dates. */
function axisTicks(count: number): number[] {
  if (count <= 5) return [...Array(count).keys()];
  const last = count - 1;
  return [...new Set([0, Math.round(last * 0.25), Math.round(last * 0.5), Math.round(last * 0.75), last])];
}

function axisLabel(date: string, granularity: Granularity, long = false): string {
  if (granularity === "hour") {
    // 'YYYY-MM-DDTHH:00'. An hour is a span, not an instant, so the readout
    // names both ends - "14:00" alone reads as a moment the money was spent.
    const hour = Number(date.slice(11, 13));
    return long ? `${pad(hour)}:00\u2013${pad((hour + 1) % 24)}:00` : `${pad(hour)}:00`;
  }
  if (granularity === "month") {
    const [year, month] = date.split("-");
    return `${MONTHS[Number(month) - 1] ?? month}${long ? ` ${year}` : ""}`;
  }
  const label = date.slice(5);
  return granularity === "week" ? `w/c ${label}` : label;
}

const pad = (n: number) => String(n).padStart(2, "0");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** What the table twin's first column is actually listing. */
const COLUMN_HEADING: Record<Granularity, string> = {
  hour: "Hour",
  day: "Day",
  week: "Week of",
  month: "Month",
};

/** Rounds up to a readable axis top: 1, 2 or 5 times a power of ten. */
function niceCeiling(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function compact(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}k`;
  // Below ten, whole numbers collapse distinct gridlines onto one label: a
  // $1.00 axis top and its $0.50 midpoint both rendered "1", which reads as a
  // flat axis and makes the chart unreadable rather than merely coarse. Two
  // decimals, trailing zeros dropped, so nothing that was already legible
  // grows a ".00".
  if (value > 0 && value < 10) return value.toFixed(2).replace(/\.?0+$/, "");
  return value.toFixed(0);
}
