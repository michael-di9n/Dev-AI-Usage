import { describe, expect, it } from "vitest";
import { CostCalculator, PriceTable } from "../src/domain/PriceTable";
import { ZERO_USAGE } from "../src/domain/types";
import { priceTable } from "./factories";

const calculator = () => new CostCalculator(priceTable());

describe("PriceTable.canonicalise", () => {
  it("strips the context-variant suffix Claude Code adds", () => {
    expect(PriceTable.canonicalise("claude-opus-5[1m]")).toBe("claude-opus-5");
  });

  it("strips a dated snapshot suffix", () => {
    expect(PriceTable.canonicalise("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5");
  });

  it("leaves a plain id alone", () => {
    expect(PriceTable.canonicalise("claude-sonnet-5")).toBe("claude-sonnet-5");
  });
});

describe("CostCalculator", () => {
  it("prices cache reads far below fresh input", () => {
    const read = calculator().costOf("claude-opus-5", { ...ZERO_USAGE, cacheReadTokens: 1_000_000 });
    const fresh = calculator().costOf("claude-opus-5", { ...ZERO_USAGE, inputTokens: 1_000_000 });
    expect(read).toBeCloseTo(0.5, 6);
    expect(fresh).toBeCloseTo(5, 6);
  });

  it("prices the two cache TTLs differently", () => {
    const fiveMin = calculator().costOf("claude-opus-5", { ...ZERO_USAGE, cacheCreate5mTokens: 1_000_000 });
    const oneHour = calculator().costOf("claude-opus-5", { ...ZERO_USAGE, cacheCreate1hTokens: 1_000_000 });
    expect(fiveMin).toBeCloseTo(6.25, 6);
    expect(oneHour).toBeCloseTo(10, 6);
  });

  /**
   * The figure the Trends page prints in red.
   *
   * These tokens had already been cached once, so the alternative was never
   * "don't send them" - it was a cache read. Charging the full write price
   * would bill context that had to travel either way and overstate the loss.
   */
  it("prices a lapsed cache as the write, less what a hit would have cost", () => {
    // Opus: 5m write $6.25/Mtok, read $0.50/Mtok.
    const premium = calculator().cacheMissPremiumOf("claude-opus-5", {
      create5m: 1_000_000,
      create1h: 0,
    });
    expect(premium).toBeCloseTo(5.75, 6);
  });

  it("prices the two cache TTLs apart when a lapse spans both", () => {
    // 1h write is $10/Mtok, so the premium over a $0.50 read is $9.50.
    const premium = calculator().cacheMissPremiumOf("claude-opus-5", {
      create5m: 1_000_000,
      create1h: 1_000_000,
    });
    expect(premium).toBeCloseTo(5.75 + 9.5, 6);
  });

  it("is zero for a lapse of no tokens, which is not the same as no lapse", () => {
    expect(calculator().cacheMissPremiumOf("claude-opus-5", { create5m: 0, create1h: 0 })).toBe(0);
  });

  it("returns null for an unknown model rather than assuming free", () => {
    expect(calculator().cacheMissPremiumOf("claude-not-a-model", { create5m: 10, create1h: 0 })).toBeNull();
    expect(calculator().cacheMissPremiumOf(null, { create5m: 10, create1h: 0 })).toBeNull();
    expect(calculator().costOf("claude-not-a-model", { ...ZERO_USAGE, outputTokens: 1_000 })).toBeNull();
    expect(calculator().costOf(null, { ...ZERO_USAGE, outputTokens: 1_000 })).toBeNull();
  });

  /**
   * Golden test against a real cost-state row from the corpus this was built on.
   * Haiku had no cache reads that session, which pins the cache-write rate
   * exactly rather than leaving it inside a sum.
   */
  it("reproduces a recorded Haiku session cost to the cent", () => {
    const cost = calculator().costOf("claude-haiku-4-5-20251001", {
      ...ZERO_USAGE,
      inputTokens: 917,
      outputTokens: 1_036,
      cacheCreate5mTokens: 259_230,
    });
    expect(cost).toBeCloseTo(0.3301345, 6);
  });

  /**
   * The Opus half of the same session. cost-state does not split the cache TTLs,
   * so the split is solved from the total - and the fact that it lands on a
   * plausible 32% at the 1h rate is the check that both rates are right.
   */
  it("reproduces a recorded Opus session cost given the solved TTL split", () => {
    const oneHour = 699_544;
    const cost = calculator().costOf("claude-opus-5[1m]", {
      ...ZERO_USAGE,
      inputTokens: 231_999,
      outputTokens: 533_103,
      cacheReadTokens: 72_098_951,
      cacheCreate1hTokens: oneHour,
      cacheCreate5mTokens: 2_165_307 - oneHour,
    });
    expect(cost).toBeCloseTo(66.6935, 2);
  });
});
