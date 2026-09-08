import { describe, expect, it } from "vitest";
import {
  NO_RANGE, describeRange, formatRange, isFiltered, isoDate, parseRange,
  rangeForWindow, runsInRange, type DateRange,
} from "../src/domain/traceDates";

/**
 * The run list's date filter.
 *
 * Two rules carry the weight here. A range must include both of the days it
 * names - a reader who types one date in both boxes means that day, and a
 * filter that returned nothing would be lying about what it did. And a stored
 * value this build does not understand must fail *open*: showing rows nobody
 * asked for is visible to the reader, hiding rows is not.
 */
const run = (endedAt: string) => ({ endedAt, id: endedAt });
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

const CORPUS = [
  run("2026-08-01T09:30"),
  run("2026-08-04T00:00"),
  run("2026-08-04T23:59"),
  run("2026-08-09T12:00"),
];

describe("runsInRange", () => {
  it("shows everything when neither end is set", () => {
    expect(runsInRange(CORPUS, NO_RANGE)).toHaveLength(4);
    expect(isFiltered(NO_RANGE)).toBe(false);
  });

  /** The rule a single-day filter lives or dies on. */
  it("includes the whole of both days it names", () => {
    const oneDay: DateRange = { from: "2026-08-04", to: "2026-08-04" };

    expect(ids(runsInRange(CORPUS, oneDay)))
      .toEqual(["2026-08-04T00:00", "2026-08-04T23:59"]);
  });

  it("is open-ended when only one end is set", () => {
    expect(ids(runsInRange(CORPUS, { from: "2026-08-04", to: null })))
      .toEqual(["2026-08-04T00:00", "2026-08-04T23:59", "2026-08-09T12:00"]);
    expect(ids(runsInRange(CORPUS, { from: null, to: "2026-08-04" })))
      .toEqual(["2026-08-01T09:30", "2026-08-04T00:00", "2026-08-04T23:59"]);
  });

  it("keeps the order it was given", () => {
    expect(ids(runsInRange(CORPUS, { from: "2026-08-01", to: "2026-08-09" })))
      .toEqual(ids(CORPUS));
  });

  it("returns nothing rather than everything for a range nothing is in", () => {
    // An empty answer is a real answer here, and must not look like "no filter".
    expect(runsInRange(CORPUS, { from: "2027-01-01", to: "2027-01-02" })).toEqual([]);
  });
});

describe("rangeForWindow", () => {
  const now = new Date("2026-08-09T15:20:00");

  it("turns a preset into the range it stands for", () => {
    expect(rangeForWindow("day", now)).toEqual({ from: "2026-08-08", to: "2026-08-09" });
    expect(rangeForWindow("week", now)).toEqual({ from: "2026-08-02", to: "2026-08-09" });
  });

  /** "All" is the absence of a filter, not a very old date pretending to be one. */
  it("clears the range for the everything preset", () => {
    expect(rangeForWindow("all", now)).toEqual(NO_RANGE);
    expect(isFiltered(rangeForWindow("all", now))).toBe(false);
  });

  /**
   * Local dates, not UTC. `toISOString` on UTC+10 returns yesterday for
   * anything before 10am, which would quietly drop a day of runs.
   */
  it("reads the reader's own calendar", () => {
    expect(isoDate(new Date(2026, 0, 1, 3, 0))).toBe("2026-01-01");
    expect(isoDate(new Date(2026, 11, 31, 23, 30))).toBe("2026-12-31");
  });
});

describe("the stored range", () => {
  it("round-trips what it wrote", () => {
    for (const range of [
      { from: "2026-08-01", to: "2026-08-09" },
      { from: "2026-08-01", to: null },
      { from: null, to: "2026-08-09" },
      NO_RANGE,
    ] as DateRange[]) {
      expect(parseRange(formatRange(range)), JSON.stringify(range)).toEqual(range);
    }
  });

  it("fails open on anything it did not write", () => {
    for (const stored of [null, "", "nonsense", "2026-13-40..2026-08-09", "yesterday..today"]) {
      expect(parseRange(stored), stored ?? "null").toEqual(NO_RANGE);
    }
  });

  /** Backwards is not a filter, it is a typo. Showing everything is safe. */
  it("refuses a range that ends before it starts", () => {
    expect(parseRange("2026-08-09..2026-08-01")).toEqual(NO_RANGE);
  });
});

describe("describeRange", () => {
  it("says nothing when nothing is filtered", () => {
    expect(describeRange(NO_RANGE)).toBeNull();
  });

  /** A filtered list that does not say so lets the reader count what is on
   *  screen and believe it is everything. */
  it("names the filter in words for the line above the rows", () => {
    expect(describeRange({ from: "2026-08-01", to: "2026-08-09" })).toBe("between 2026-08-01 and 2026-08-09");
    expect(describeRange({ from: "2026-08-04", to: "2026-08-04" })).toBe("on 2026-08-04");
    expect(describeRange({ from: "2026-08-04", to: null })).toBe("since 2026-08-04");
    expect(describeRange({ from: null, to: "2026-08-04" })).toBe("up to 2026-08-04");
  });
});
