import { Application } from "../src/Application";
import { event } from "../src/observability";

/**
 * Import and report what happened - the command a developer actually wants.
 * Also the only place that emits `run.finished`.
 *
 * Nothing here reaches a model. The observability module records the run to a
 * local JSONL trail and stops there; reading anything into those numbers is a
 * job for a person.
 */
const app = Application.create();
const emit = app.observability.emitter;

const started = Date.now();

const ingestResults = await app.ingest.runAll();
for (const r of ingestResults) {
  const mark = r.status === "ok" ? "ok  " : r.status === "error" ? "ERR " : "skip";
  console.log(`[${mark}] ${r.sourceId.padEnd(14)} ${r.detail}`);
}
await emit.emit(
  event("ingest.finished", {
    sources: ingestResults.length,
    ok: ingestResults.filter((r) => r.status === "ok").length,
    skipped: ingestResults.filter((r) => r.status === "not-configured").length,
    failed: ingestResults.filter((r) => r.status === "error").length,
    rows: ingestResults.reduce((n, r) => n + r.recordsWritten, 0),
  }),
);

const totals = app.queries.totals("month");
const cachedInput = totals.cacheRead + totals.cacheCreate;

await emit.emit(
  event("run.finished", {
    activeDays: totals.activeDays,
    derivedCostUsdMonth: totals.costUsd === null ? null : Number(totals.costUsd.toFixed(2)),
    outputTokensMonth: totals.outputTokens,
    thinkingSharePct: pct(totals.thinkingTokens, totals.outputTokens),
    cacheReadSharePct: pct(totals.cacheRead, cachedInput),
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
  }),
);

console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s. Open the dashboard with \`npm run dev\`.`);

app.close();

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : Number(((part / whole) * 100).toFixed(1));
}
