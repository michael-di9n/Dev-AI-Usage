import { Application } from "../src/Application";

import { isPeriodId, periodOf, DEFAULT_PERIOD } from "../src/domain/period";

const requested = process.argv[2];
const period = periodOf(isPeriodId(requested) ? requested : DEFAULT_PERIOD);
const app = Application.create();

const totals = app.queries.totals(period.id);
if (totals.messages === 0) {
  // Zeros here would read as "you spent nothing", which is a different claim.
  console.log(`\nNothing recorded ${period.phrase}.`);
  console.log("Run `npm run ingest` to import, or `npm run doctor` to see what is missing.\n");
  app.close();
  process.exit(0);
}

const cachedInput = totals.cacheRead + totals.cacheCreate;

console.log(`\n=== ${period.label} (${period.phrase}) ===`);
console.log(`Derived cost      ${totals.costUsd === null ? "-" : `$${totals.costUsd.toFixed(2)}`}`);
console.log(`Output tokens     ${totals.outputTokens.toLocaleString()}`);
console.log(`Thinking share    ${pct(totals.thinkingTokens, totals.outputTokens)}`);
console.log(`Cache read share  ${pct(totals.cacheRead, cachedInput)}`);
console.log(`Sessions          ${totals.sessions.toLocaleString()} over ${totals.activeDays} active day(s)`);

console.log(`\n--- Derived cost beside Claude Code's own figure (second opinion, not a check) ---`);
const opinions = app.queries.costSecondOpinion(8);
if (opinions.length === 0) console.log("  No session carried a cost report.");
for (const o of opinions) {
  console.log(`  ${o.sessionId.slice(0, 8)}  derived $${o.derivedUsd.toFixed(2)}  cost-state $${o.reportedUsd.toFixed(2)}`);
}
console.log("  The two count different messages: cost-state resets on resume and uses its own");
console.log("  token accounting. The price table is validated by tests/cost.test.ts instead.");

app.close();

function pct(part: number, whole: number): string {
  return whole === 0 ? "n/a" : `${((part / whole) * 100).toFixed(1)}%`;
}
