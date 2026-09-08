import { describe, expect, it } from "vitest";
import { CostCalculator } from "../src/domain/PriceTable";
import { COST_CLASSES, costSplit, type ModelUsageRow } from "../src/domain/costSplit";
import { ZERO_USAGE } from "../src/domain/types";
import { priceTable } from "./factories";
import {
  DEFAULT_TRACE_WINDOW,
  TRACE_WINDOWS,
  traceWindowOf,
} from "../src/domain/traceWindow";

const calculator = () => new CostCalculator(priceTable());

const row = (model: string | null, over: Partial<typeof ZERO_USAGE>): ModelUsageRow => ({
  model,
  usage: { ...ZERO_USAGE, ...over },
});

describe("costSplit", () => {
  it("splits a run into four classes that add up to its total", () => {
    /*
     * The property the whole panel rests on. Each part is `costOf` with one
     * class and the rest zeroed, so the parts summing to the total is
     * arithmetic rather than a coincidence - and a second multiplication
     * against the rate table is exactly how the two would drift apart.
     */
    const rows = [
      row("claude-opus-5", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
        cacheCreate5mTokens: 1_000_000,
      }),
    ];

    const split = costSplit(rows, calculator());
    const parts = split.parts.map((p) => p.costUsd!);

    expect(parts).toEqual([5, 0.5, 6.25, 25]);
    expect(split.totalUsd).toBeCloseTo(36.75, 6);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(split.totalUsd!, 10);
  });

  it("prices each model at its own rates rather than the run at one", () => {
    // A run that switched models cannot be priced from one set of totals, so
    // the rows arrive grouped by model and each is priced on its own.
    const split = costSplit(
      [
        row("claude-opus-5", { outputTokens: 1_000_000 }),
        row("claude-haiku-4-5", { outputTokens: 1_000_000 }),
      ],
      calculator(),
    );

    const output = split.parts.find((p) => p.cls === "output")!;
    expect(output.costUsd).toBeCloseTo(30, 6);
    expect(output.tokens).toBe(2_000_000);
  });

  it("counts both cache TTLs as one write class, priced apart", () => {
    const split = costSplit(
      [row("claude-opus-5", { cacheCreate5mTokens: 1_000_000, cacheCreate1hTokens: 1_000_000 })],
      calculator(),
    );

    const write = split.parts.find((p) => p.cls === "cacheWrite")!;
    expect(write.tokens, "both TTLs are the same class to a reader").toBe(2_000_000);
    expect(write.costUsd, "and are still charged at their own rates").toBeCloseTo(16.25, 6);
  });

  it("flags an unpriced model rather than reporting it as free", () => {
    const split = costSplit([row("some-model-nobody-priced", { outputTokens: 500 })], calculator());

    expect(split.unpriced, "the reader has to be told the total is short").toBe(true);
    expect(split.totalUsd, "nothing in the run could be priced").toBeNull();
    for (const part of split.parts) {
      expect(part.costUsd, part.cls).toBeNull();
      expect(part.share, part.cls).toBeNull();
    }
  });

  it("keeps the tokens of an unpriced model, which were still counted", () => {
    // The price is unknown; the tokens are not. Dropping them would lose a
    // measurement that was taken.
    const split = costSplit([row("nope", { outputTokens: 500 })], calculator());
    expect(split.parts.find((p) => p.cls === "output")!.tokens).toBe(500);
  });

  it("gives a share of nothing as null, never as zero", () => {
    // A percentage with an empty denominator is unanswerable, which is the
    // same rule the Trends page follows.
    const split = costSplit([row("claude-opus-5", {})], calculator());

    expect(split.totalUsd).toBe(0);
    for (const part of split.parts) expect(part.share, part.cls).toBeNull();
  });

  it("reports every class every time, so the legend never changes shape", () => {
    const split = costSplit([row("claude-opus-5", { outputTokens: 10 })], calculator());
    expect(split.parts.map((p) => p.cls)).toEqual(COST_CLASSES);
  });
});

describe("traceWindowOf", () => {
  it("offers a day, a week, a month and everything", () => {
    expect(TRACE_WINDOWS.map((w) => w.id)).toEqual(["day", "week", "month", "all"]);
    expect(TRACE_WINDOWS.map((w) => w.days)).toEqual([1, 7, 30, null]);
  });

  /**
   * "All" carries null days rather than a very large number. The number would
   * work everywhere except the one place it matters: the empty-window sentence
   * names the window, and "no runs in the last hundred years" is a worse answer
   * than "no runs at all".
   */
  it("says everything captured in words, not as a hundred years of days", () => {
    const all = TRACE_WINDOWS.find((w) => w.id === "all")!;

    expect(all.days).toBeNull();
    expect(all.phrase).toBe("everything captured");
  });

  it("falls back rather than throwing on a value it does not recognise", () => {
    // The stored string was not written by this code path: it may be an older
    // build's value or a row edited by hand. A page that will not render is a
    // worse answer than the default week.
    expect(traceWindowOf(null).id).toBe(DEFAULT_TRACE_WINDOW);
    expect(traceWindowOf("quarter").id).toBe(DEFAULT_TRACE_WINDOW);
    expect(traceWindowOf("").id).toBe(DEFAULT_TRACE_WINDOW);
  });

  it("returns the stored window when it is one this build knows", () => {
    expect(traceWindowOf("month").days).toBe(30);
    expect(traceWindowOf("day").days).toBe(1);
  });
});
