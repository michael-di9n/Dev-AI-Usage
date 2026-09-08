/**
 * Where a run's money went, by token class. Pure.
 *
 * Every figure here is `CostCalculator.costOf` called with one class of token
 * and the rest zeroed, so the parts are priced by exactly the arithmetic that
 * priced the whole and cannot drift from it. Writing a second multiplication
 * against the rate table would have been the obvious way to do this and the
 * way the two figures end up disagreeing.
 *
 * Null propagates. An unpriced model has no total and no parts, and a zero in
 * either would be a measurement nobody took - see the rule on
 * `costUsdDerived` in `types.ts`.
 */

import type { CostCalculator } from "./PriceTable";
import { ZERO_USAGE, type TokenUsage } from "./types";

export type CostClass = "input" | "cacheRead" | "cacheWrite" | "output";

export const COST_CLASS_LABELS: Record<CostClass, { label: string; what: string }> = {
  input: {
    label: "Input",
    what: "The prompt and everything re-sent with it that was not already cached.",
  },
  cacheRead: {
    label: "Cache read",
    what: "Re-reading a prefix that was already written. The cheapest tokens on the bill.",
  },
  cacheWrite: {
    label: "Cache write",
    what: "Writing a prefix so later turns can read it instead of re-sending it.",
  },
  output: {
    label: "Output",
    what: "What the model wrote, thinking included.",
  },
};

/** The class order the bar is drawn in: how a turn actually spends. */
export const COST_CLASSES: CostClass[] = ["input", "cacheRead", "cacheWrite", "output"];

/** Only the fields of one class, so `costOf` prices that class alone. */
const ONLY: Record<CostClass, (u: TokenUsage) => TokenUsage> = {
  input: (u) => ({ ...ZERO_USAGE, inputTokens: u.inputTokens }),
  cacheRead: (u) => ({ ...ZERO_USAGE, cacheReadTokens: u.cacheReadTokens }),
  cacheWrite: (u) => ({
    ...ZERO_USAGE,
    cacheCreate5mTokens: u.cacheCreate5mTokens,
    cacheCreate1hTokens: u.cacheCreate1hTokens,
  }),
  output: (u) => ({ ...ZERO_USAGE, outputTokens: u.outputTokens }),
};

/** How many tokens of a class there were, for the label beside the money. */
const TOKENS: Record<CostClass, (u: TokenUsage) => number> = {
  input: (u) => u.inputTokens,
  cacheRead: (u) => u.cacheReadTokens,
  cacheWrite: (u) => u.cacheCreate5mTokens + u.cacheCreate1hTokens,
  output: (u) => u.outputTokens,
};

export interface CostPart {
  cls: CostClass;
  label: string;
  what: string;
  tokens: number;
  /** Null when the model is unpriced. Never coalesced to zero. */
  costUsd: number | null;
  /** Share of the priced total, 0-1. Null when there is no priced total. */
  share: number | null;
}

export interface CostSplit {
  parts: CostPart[];
  /** Null when nothing in the run could be priced. */
  totalUsd: number | null;
  /** True when at least one model in the run has no row in the price table. */
  unpriced: boolean;
}

/**
 * One run's usage, already summed per model.
 *
 * Per model and not per session, because rates differ by model and a run that
 * used two of them cannot be priced from one total. The caller sums the rows;
 * this prices them.
 */
export interface ModelUsageRow {
  model: string | null;
  usage: TokenUsage;
}

export function costSplit(rows: ModelUsageRow[], calculator: CostCalculator): CostSplit {
  const totals = new Map<CostClass, number | null>();
  const tokens = new Map<CostClass, number>();
  let unpriced = false;

  for (const cls of COST_CLASSES) {
    let sum: number | null = null;
    let count = 0;

    for (const row of rows) {
      count += TOKENS[cls](row.usage);
      const part = calculator.costOf(row.model, ONLY[cls](row.usage));
      if (part === null) {
        unpriced = true;
        continue;
      }
      sum = (sum ?? 0) + part;
    }

    totals.set(cls, sum);
    tokens.set(cls, count);
  }

  const priced = COST_CLASSES.map((c) => totals.get(c) ?? null).filter((v): v is number => v !== null);
  const totalUsd = priced.length === 0 ? null : priced.reduce((a, b) => a + b, 0);

  return {
    totalUsd,
    unpriced,
    parts: COST_CLASSES.map((cls) => {
      const costUsd = totals.get(cls) ?? null;
      return {
        cls,
        label: COST_CLASS_LABELS[cls].label,
        what: COST_CLASS_LABELS[cls].what,
        tokens: tokens.get(cls) ?? 0,
        costUsd,
        // A share of nothing is not zero, it is unanswerable - the same rule
        // the Trends page follows for a percentage with an empty denominator.
        share: costUsd === null || totalUsd === null || totalUsd === 0 ? null : costUsd / totalUsd,
      };
    }),
  };
}
