import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORDER, ariaSort, formatOrder, nextOrder, parseOrder, sortRuns,
  type OrderableRun, type RunOrder,
} from "../src/domain/runOrder";

/**
 * The run list's order.
 *
 * Two of these are the whole reason this is a module rather than a comparator
 * written inline: a run with no cost figure must not be sorted as if it cost
 * nothing, and rows that tie must not shuffle. Both are invisible when they
 * break - the list still looks like a sorted list.
 */
const run = (sessionId: string, endedAt: string, costUsd: number | null, toolCalls = 0): OrderableRun =>
  ({ sessionId, endedAt, costUsd, toolCalls });

const ids = (runs: OrderableRun[]) => runs.map((r) => r.sessionId);

const CORPUS = [
  run("cheap", "2026-08-01T10:00", 0.82, 4),
  run("dear", "2026-08-03T10:00", 134.7, 900),
  run("unpriced", "2026-08-02T10:00", null, 12),
  run("middling", "2026-08-04T10:00", 22.23, 70),
];

describe("sortRuns", () => {
  it("puts the dearest run first descending, and reverses it ascending", () => {
    expect(ids(sortRuns(CORPUS, { column: "cost", direction: "desc" })).slice(0, 3))
      .toEqual(["dear", "middling", "cheap"]);
    expect(ids(sortRuns(CORPUS, { column: "cost", direction: "asc" })).slice(0, 3))
      .toEqual(["cheap", "middling", "dear"]);
  });

  /**
   * The rule the whole project turns on, in its sorting form. "Cheapest first"
   * with an unpriced run at the top would be this tool claiming a figure it
   * has just said it does not have.
   */
  it("sorts a run with no cost figure last in both directions", () => {
    for (const direction of ["asc", "desc"] as const) {
      const sorted = ids(sortRuns(CORPUS, { column: "cost", direction }));
      expect(sorted[sorted.length - 1], direction).toBe("unpriced");
    }
  });

  it("leaves an unpriced run in the ordinary order of other columns", () => {
    // It has no cost. It has a date and a tool count like everything else.
    expect(ids(sortRuns(CORPUS, { column: "ended", direction: "desc" })))
      .toEqual(["middling", "dear", "unpriced", "cheap"]);
  });

  it("keeps tied rows in the order they arrived", () => {
    const tied = [run("first", "2026-08-04T10:00", 5), run("second", "2026-08-01T10:00", 5)];

    expect(ids(sortRuns(tied, { column: "cost", direction: "desc" }))).toEqual(["first", "second"]);
    expect(ids(sortRuns(tied, { column: "cost", direction: "asc" }))).toEqual(["first", "second"]);
  });

  it("returns a new array and leaves the caller's alone", () => {
    const before = ids(CORPUS);
    sortRuns(CORPUS, { column: "cost", direction: "asc" });
    expect(ids(CORPUS)).toEqual(before);
  });

  it("orders tool calls as numbers, not as the strings they are printed as", () => {
    expect(ids(sortRuns(CORPUS, { column: "tools", direction: "desc" })).slice(0, 2))
      .toEqual(["dear", "middling"]);
  });
});

describe("nextOrder", () => {
  it("starts a newly clicked column at descending", () => {
    // Every column here answers "which was the biggest" first.
    expect(nextOrder({ column: "ended", direction: "asc" }, "cost"))
      .toEqual({ column: "cost", direction: "desc" });
  });

  it("flips the direction when the same column is clicked again", () => {
    const once = nextOrder(DEFAULT_ORDER, "cost");
    const twice = nextOrder(once, "cost");

    expect(twice).toEqual({ column: "cost", direction: "asc" });
    expect(nextOrder(twice, "cost")).toEqual(once);
  });
});

describe("the stored order", () => {
  it("round-trips what it wrote", () => {
    const order: RunOrder = { column: "tools", direction: "asc" };
    expect(parseOrder(formatOrder(order))).toEqual(order);
  });

  it("falls back rather than throwing on a value it did not write", () => {
    for (const stored of [null, "", "nonsense", "cost", "cost:sideways", "colour:desc"]) {
      expect(parseOrder(stored), stored ?? "null").toEqual(DEFAULT_ORDER);
    }
  });
});

describe("ariaSort", () => {
  it("announces the direction only on the column actually sorted", () => {
    const order: RunOrder = { column: "cost", direction: "desc" };

    expect(ariaSort(order, "cost")).toBe("descending");
    expect(ariaSort(order, "tools")).toBe("none");
    expect(ariaSort({ column: "cost", direction: "asc" }, "cost")).toBe("ascending");
  });
});
