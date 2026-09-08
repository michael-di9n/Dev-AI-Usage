import type { TokenUsage } from "./types";

export interface ModelRates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

export interface PriceTableFile {
  updated: string;
  models: Record<string, ModelRates>;
}

/**
 * Resolves a model id to its per-million-token rates.
 *
 * Claude Code decorates model ids in its own records - `claude-opus-5[1m]` for a
 * context variant, `claude-haiku-4-5-20251001` for a dated snapshot. Those are
 * presentation, not distinct price points, so we canonicalise before lookup
 * rather than duplicating rows in the price file.
 */
export class PriceTable {
  constructor(private readonly rates: Record<string, ModelRates>, readonly updated: string) {}

  static fromFile(file: PriceTableFile): PriceTable {
    return new PriceTable(file.models, file.updated);
  }

  /** `claude-opus-5[1m]` -> `claude-opus-5`; `claude-haiku-4-5-20251001` -> `claude-haiku-4-5`. */
  static canonicalise(modelId: string): string {
    return modelId
      .replace(/\[[^\]]*\]/g, "")
      .replace(/-\d{8}$/, "")
      .trim();
  }

  /** null for an unknown model - callers must surface that, never assume zero. */
  ratesFor(modelId: string | null): ModelRates | null {
    if (!modelId) return null;
    return this.rates[PriceTable.canonicalise(modelId)] ?? null;
  }
}

const PER_MILLION = 1_000_000;

/**
 * Turns token counts into dollars. Split from PriceTable so the arithmetic can
 * be tested against real `cost-state` rows without constructing a price file.
 */
export class CostCalculator {
  constructor(private readonly prices: PriceTable) {}

  /**
   * What a lapsed cache cost, over and above a hit.
   *
   * These tokens had already been cached once in this session, so the
   * alternative was never "don't send them" - it was a cache read. The premium
   * is the write price minus the read price for the same tokens, which is the
   * money the lapse actually cost. Charging the full write price would count
   * context that had to travel either way and overstate the loss.
   */
  cacheMissPremiumOf(
    modelId: string | null,
    tokens: { create5m: number; create1h: number },
  ): number | null {
    const r = this.prices.ratesFor(modelId);
    if (!r) return null;
    const written = tokens.create5m * r.cacheWrite5m + tokens.create1h * r.cacheWrite1h;
    const asRead = (tokens.create5m + tokens.create1h) * r.cacheRead;
    return (written - asRead) / PER_MILLION;
  }

  /** null signals "unknown model" - the UI renders that, it never shows $0.00. */
  costOf(modelId: string | null, usage: TokenUsage): number | null {
    const r = this.prices.ratesFor(modelId);
    if (!r) return null;
    return (
      (usage.inputTokens * r.input +
        usage.outputTokens * r.output +
        usage.cacheReadTokens * r.cacheRead +
        usage.cacheCreate5mTokens * r.cacheWrite5m +
        usage.cacheCreate1hTokens * r.cacheWrite1h) /
      PER_MILLION
    );
  }
}
