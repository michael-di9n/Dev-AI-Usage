/**
 * How the run list is ordered. Pure: no clock, no database.
 *
 * Four columns, one of them chosen, and a direction. The rules that are not
 * obvious:
 *
 * **A missing number is not a small one.** A run whose models are absent from
 * the price table has no cost, and sorting it as if it cost zero would put it
 * at the top of "cheapest first" - a claim the data does not support. Runs
 * with no figure sort last in BOTH directions, so neither end of the list is
 * ever a lie. They are still in the list, because they are still runs.
 *
 * **The sort is stable.** Two runs that cost the same keep the order they
 * arrived in, which is newest-first from the query. Without that, re-rendering
 * a list of equal figures shuffles rows under the reader's cursor.
 *
 * **A new column starts at descending.** Every column here answers "which was
 * the biggest" first: the dearest run, the busiest run, the most recent. Only
 * the trace id is alphabetical, and it has no interesting end either way.
 */

export type RunColumn = "id" | "ended" | "cost" | "tools";
export type SortDirection = "asc" | "desc";

export interface RunOrder {
  column: RunColumn;
  direction: SortDirection;
}

export const DEFAULT_ORDER: RunOrder = { column: "ended", direction: "desc" };

/** What each column sorts on. Null is the absence, and never becomes a zero. */
export interface OrderableRun {
  sessionId: string;
  endedAt: string;
  costUsd: number | null;
  toolCalls: number;
}

/**
 * The order after clicking a column heading.
 *
 * The same column flips; a different one starts descending. Re-clicking to
 * reverse is the convention every table has, and starting a new column at
 * ascending would answer "which was the smallest", which is nobody's first
 * question about a list of runs.
 */
export function nextOrder(current: RunOrder, clicked: RunColumn): RunOrder {
  if (current.column !== clicked) return { column: clicked, direction: "desc" };
  return { column: clicked, direction: current.direction === "desc" ? "asc" : "desc" };
}

/** Returns a new array. Nothing here mutates what it was given. */
export function sortRuns<T extends OrderableRun>(runs: T[], order: RunOrder): T[] {
  const sign = order.direction === "asc" ? 1 : -1;

  return runs
    .map((run, index) => ({ run, index }))
    .sort((a, b) => {
      const known = missing(a.run, order.column) - missing(b.run, order.column);
      // Ahead of the direction, not inside it: unanswerable is last either way.
      if (known !== 0) return known;

      const by = compare(a.run, b.run, order.column) * sign;
      return by !== 0 ? by : a.index - b.index;
    })
    .map((r) => r.run);
}

/** 1 for a row this column cannot answer for, so it sinks. */
function missing(run: OrderableRun, column: RunColumn): number {
  return column === "cost" && run.costUsd === null ? 1 : 0;
}

function compare(a: OrderableRun, b: OrderableRun, column: RunColumn): number {
  switch (column) {
    case "id":
      return a.sessionId.localeCompare(b.sessionId);
    case "ended":
      return a.endedAt.localeCompare(b.endedAt);
    case "cost":
      return (a.costUsd ?? 0) - (b.costUsd ?? 0);
    case "tools":
      return a.toolCalls - b.toolCalls;
  }
}

/** What a sortable heading tells assistive technology it is doing. */
export function ariaSort(order: RunOrder, column: RunColumn): "ascending" | "descending" | "none" {
  if (order.column !== column) return "none";
  return order.direction === "asc" ? "ascending" : "descending";
}

/**
 * The stored order, or the default.
 *
 * Same contract as every other stored choice here: whatever is in the row may
 * be an older build's or edited by hand, and an unrecognised one falls back
 * rather than throwing.
 */
export function parseOrder(stored: string | null): RunOrder {
  const [column, direction] = (stored ?? "").split(":");
  const known = COLUMNS.includes(column as RunColumn) && (direction === "asc" || direction === "desc");
  return known ? { column: column as RunColumn, direction } : DEFAULT_ORDER;
}

export const formatOrder = (order: RunOrder): string => `${order.column}:${order.direction}`;

const COLUMNS: RunColumn[] = ["id", "ended", "cost", "tools"];
