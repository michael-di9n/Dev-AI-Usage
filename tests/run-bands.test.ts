import { describe, expect, it } from "vitest";
import {
  BAND_GLYPHS, DEFAULT_BANDS, bandOf, formatBands, parseBands, type RunBands,
} from "../src/domain/runBands";

/**
 * The band rule the run list draws its coins and wrenches from.
 *
 * The edges are pinned because a band is a claim about a figure, and a rule
 * that is right in the middle of every range and wrong at $10.00 is a rule
 * nobody can check. The three states matter more: unanswerable, measured zero,
 * and banded are three different things a cell can say, and the whole point of
 * the glyphs is that they do not look alike.
 */
const cost = (n: number | null, bands: RunBands = DEFAULT_BANDS) => bandOf(n, "cost", bands);
const tools = (n: number | null, bands: RunBands = DEFAULT_BANDS) => bandOf(n, "tools", bands);

describe("bandOf", () => {
  it("bands cost on the reader's own rule, at both edges", () => {
    expect(cost(9.99).step).toBe(1);
    expect(cost(10).step).toBe(2);
    expect(cost(49.99).step).toBe(2);
    expect(cost(50).step).toBe(3);
    expect(cost(1825.07).step).toBe(BAND_GLYPHS);
  });

  /**
   * The rule this project exists to keep. A run whose models are all absent
   * from the price table did not cost nothing.
   */
  it("gives a null cost no band and no glyphs, never one coin", () => {
    const band = cost(null);

    expect(band.step).toBeNull();
    expect(band.measured).toBe("—");
    expect(band.why).toContain("unmeasured rather than small");
    expect(band.why).not.toContain("$0.00");
  });

  /** And its mirror image: a measured zero is a figure, and it is zero. */
  it("prints a measured zero as a figure and still draws nothing", () => {
    const band = cost(0);

    expect(band.step).toBe(0);
    expect(band.measured).toBe("$0.00");
    expect(band.measured).not.toBe("—");
  });

  it("draws no wrench for a run that called no tools", () => {
    // A quarter of a real corpus. One wrench would say "a few".
    expect(tools(0).step).toBe(0);
    expect(tools(0).measured).toBe("0");
    expect(tools(1).step).toBe(1);
  });

  it("bands tools off the same table with their own numbers", () => {
    expect(tools(9).step).toBe(1);
    expect(tools(10).step).toBe(2);
    expect(tools(50).step).toBe(3);
    expect(tools(10904).step).toBe(3);
  });

  it("re-bands the same figure when the reader moves the thresholds", () => {
    const tight: RunBands = { cost: { fair: 1, lots: 5 }, tools: { fair: 2, lots: 4 } };

    expect(cost(2).step).toBe(1);
    expect(cost(2, tight).step).toBe(2);
    expect(tools(5, tight).step).toBe(3);
  });

  /** A number with no arithmetic beside it is a grade, not a measurement. */
  it("states the figure and all three ranges, whatever the band", () => {
    for (const band of [cost(4), cost(20), cost(90), cost(0), tools(7)]) {
      expect(band.why).toContain("is one");
      expect(band.why).toContain("is two");
      expect(band.why).toContain("and up is three");
    }
    expect(cost(20).why).toContain("$20.00");
    expect(cost(20).why).toContain("under $10.00");
  });
});

describe("parseBands", () => {
  it("round-trips what it wrote", () => {
    const mine: RunBands = { cost: { fair: 2, lots: 20 }, tools: { fair: 5, lots: 25 } };
    expect(parseBands(formatBands(mine))).toEqual(mine);
  });

  it("falls back to the defaults rather than banding on nonsense", () => {
    for (const stored of [
      null,
      "",
      "not json",
      "[]",
      '{"cost":{"fair":10,"lots":50}}',                              // tools missing
      '{"cost":{"fair":"10","lots":50},"tools":{"fair":10,"lots":50}}', // not numbers
      '{"cost":{"fair":-1,"lots":50},"tools":{"fair":10,"lots":50}}',   // negative
      '{"cost":{"fair":50,"lots":10},"tools":{"fair":10,"lots":50}}',   // out of order
      '{"cost":{"fair":10,"lots":10},"tools":{"fair":10,"lots":50}}',   // no middle band
    ]) {
      expect(parseBands(stored), stored ?? "null").toEqual(DEFAULT_BANDS);
    }
  });
});
