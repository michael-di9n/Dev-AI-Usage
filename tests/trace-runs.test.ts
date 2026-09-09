import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BandMarks } from "../src/components/BandMarks";
import { TraceRunList } from "../src/components/TraceRunList";
import type { TraceableSession } from "../src/db/QueryRepository";
import { DEFAULT_BANDS, bandOf, type BandMeasure } from "../src/domain/runBands";
import { DEFAULT_ORDER, type RunOrder } from "../src/domain/runOrder";
import { NO_RANGE, type DateRange } from "../src/domain/traceDates";

/**
 * The marks a run's cost and tool count are drawn as.
 *
 * These hold the three-state rule where it becomes a picture. Unanswerable, a
 * measured zero, and a banded figure have to look like three different things,
 * and two of them draw no filled marks - so what separates them is the figure
 * printed beside them, which is why it may never be dropped for space.
 */
const marks = (value: number | null, measure: BandMeasure = "cost") =>
  renderToStaticMarkup(
    createElement(BandMarks, {
      band: bandOf(value, measure, DEFAULT_BANDS),
      measure,
      label: measure === "cost" ? "Cost" : "Tool calls",
    }),
  );

/** The count under the heading: the only place the list says how many it has. */
const headCount = (html: string) =>
  html.match(/<h2 class="runs-head">Recorded runs<span>([^<]*)<\/span>/)?.[1] ?? "";

/** One <span class="mark on"> per filled mark. */
const filled = (html: string) => html.match(/class="mark on"/g)?.length ?? 0;
const total = (html: string) => html.match(/class="mark(?: on)?"/g)?.length ?? 0;

describe("BandMarks", () => {
  it("fills one, two or three and leaves the rest as outlines", () => {
    for (const [value, expected] of [[4, 1], [20, 2], [90, 3]] as const) {
      expect(filled(marks(value)), `$${value}`).toBe(expected);
      // The scale never changes height: two rows have to be comparable.
      expect(total(marks(value))).toBe(3);
    }
  });

  it("fills nothing for a figure it could not measure", () => {
    expect(filled(marks(null))).toBe(0);
    expect(total(marks(null))).toBe(3);
  });

  it("fills nothing for a measured zero either", () => {
    // One mark would say "a little" where the answer is none.
    expect(filled(marks(0))).toBe(0);
    expect(filled(marks(0, "tools"))).toBe(0);
  });

  /**
   * The two states above draw the same marks on purpose, so the figure beside
   * them is the only thing that tells them apart - and it always says which.
   */
  it("carries the arithmetic that separates a zero from an unknown", () => {
    expect(marks(null)).toContain("unmeasured rather than small");
    expect(marks(0)).toContain("measured, and zero");
    expect(marks(0)).toContain("$0.00");
  });

  it("names what the marks are of, so they are never an unlabelled picture", () => {
    expect(marks(20)).toContain('aria-label="Cost:');
    expect(marks(20, "tools")).toContain('aria-label="Tool calls:');
    expect(marks(20)).toContain('role="img"');
  });

  /**
   * Every figure that HAS a band states the rule that put it there. The
   * unmeasured one does not, and must not: there was no figure to band, so
   * printing the thresholds beside it would suggest one had been tried.
   */
  it("states the bands it counted against, whenever it counted", () => {
    for (const value of [0, 4, 90]) {
      expect(marks(value), String(value)).toContain("under $10.00");
    }
    expect(marks(null)).not.toContain("$10.00");
  });
});

/**
 * The list itself.
 *
 * Rendered rather than reasoned about, because the things worth holding here
 * are all "is it actually on the page": the figure beside the marks, the
 * sorted column announcing itself, and a collapsed list still saying how many
 * runs it is hiding.
 */
const SESSIONS: TraceableSession[] = [
  { sessionId: "aaaaaaaa-1", projectPath: "/p", startedAt: "2026-08-01T09:00", endedAt: "2026-08-01T10:00", blocks: 120, costUsd: 22.23, toolCalls: 70, otelSpans: 0 },
  { sessionId: "bbbbbbbb-2", projectPath: "/p", startedAt: "2026-08-02T09:00", endedAt: "2026-08-02T10:00", blocks: 8, costUsd: null, toolCalls: 0, otelSpans: 0 },
];

const list = (over: { open?: boolean; order?: RunOrder; range?: DateRange; total?: number; otelOnly?: boolean } = {}) =>
  renderToStaticMarkup(
    createElement(TraceRunList, {
      sessions: SESSIONS,
      selected: "aaaaaaaa-1",
      order: over.order ?? DEFAULT_ORDER,
      bands: DEFAULT_BANDS,
      open: over.open ?? true,
      range: over.range ?? NO_RANGE,
      total: over.total ?? SESSIONS.length,
      otelOnly: over.otelOnly ?? false,
    }),
  );

describe("TraceRunList", () => {
  it("prints every figure as text beside its marks", () => {
    const html = list();

    expect(html).toContain("$22.23");
    expect(html).toContain(">70<");
    // The unpriced run says so rather than showing a number it does not have.
    expect(html).toContain("—");
  });

  /**
   * The denominator. Without it the reader counts the rows on screen and
   * believes that is every run the project has.
   */
  it("says what it is a subset of when a date filter is on", () => {
    expect(headCount(list({ range: { from: "2026-08-02", to: "2026-08-02" }, total: 9 })))
      .toBe("2 of 9 · on 2026-08-02");
    // And claims no subset when it is showing everything.
    expect(headCount(list())).toBe("2 in this project");
  });

  it("announces which column is sorted, and only that one", () => {
    const html = list({ order: { column: "cost", direction: "asc" } });

    expect(html).toContain('aria-sort="ascending"');
    expect(html.match(/aria-sort="(ascending|descending)"/g)).toHaveLength(1);
    expect(html.match(/aria-sort="none"/g)).toHaveLength(3);
  });

  it("gives the collapse control a name and a state, not just an arrow", () => {
    expect(list({ open: true })).toContain('aria-expanded="true"');
    expect(list({ open: false })).toContain('aria-expanded="false"');
    expect(list()).toContain("Collapse the run list");
    expect(list({ open: false })).toContain("Expand the run list");
  });

  /**
   * A filter, not a disclosure - so it gets `aria-pressed`, and the caption
   * has to say the filter is on, the same way it already says a date range
   * is on. Without either, a reader who turned it on and left would come back
   * to a shorter list with no explanation.
   */
  it("gives the OTEL filter a name and a state, and says so in the count", () => {
    expect(list({ otelOnly: true })).toContain('aria-pressed="true"');
    expect(list({ otelOnly: false })).toContain('aria-pressed="false"');
    expect(headCount(list({ otelOnly: true }))).toBe("2 in this project · OTEL only");
    expect(headCount(list({ otelOnly: false }))).toBe("2 in this project");
  });

  /**
   * Collapsing is a glance, not a filter. The rows go; the count of what is
   * being hidden stays, or putting the list away would look like losing the
   * runs.
   */
  it("keeps saying how many runs it has when it is closed", () => {
    const shut = list({ open: false });

    expect(shut).toContain("2 in this project");
    expect(shut).toContain("hidden");
  });
});
