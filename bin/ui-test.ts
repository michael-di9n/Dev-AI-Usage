import { readConfig } from "../src/config";
import { event, attachObservability } from "../src/observability";
import {
  createUiTestRunner, describeAssertion, emptyStateChecks, passed, populatedChecks,
  summariseResults,
} from "../src/ui-testing";

/**
 * Runs the UI checks against an already-running dashboard.
 *
 *   npm run ui-test                    # against http://localhost:3000
 *   npm run ui-test -- --empty         # the fresh-clone checks
 *   npm run ui-test -- --url http://localhost:3121
 *   npm run ui-test -- --screenshots      # a PNG per check, passing or not
 *
 * Results go to the observability module too, so a UI regression shows up in
 * the same trail as everything else.
 */
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
};

const baseUrl = value("url", "http://localhost:3000").replace(/\/$/, "");
const empty = flag("empty");
/** Every check gets a PNG, not just the failures. For looking at the design. */
const screenshots = flag("screenshots");
const config = readConfig();

const reachable = await fetch(`${baseUrl}/api/otlp/health`).then((r) => r.ok).catch(() => false);
if (!reachable) {
  console.error(`\nNo dashboard at ${baseUrl}.`);
  console.error("Start it with `npm run dev`, then run this again.");
  console.error("Different port? Pass it: npm run ui-test -- --url http://localhost:3121\n");
  process.exit(2);
}

const runner = createUiTestRunner(config, baseUrl, screenshots);
const checks = empty ? emptyStateChecks() : populatedChecks();

console.log(`\nUI checks against ${baseUrl}`);
console.log(`${checks.length} checks, ${empty ? "fresh-clone" : "populated"} mode`);
// Every check is measured in the browser. Nothing here asks a model anything,
// and nothing leaves this machine.
console.log();

const results = await runner.run(checks);

for (const result of results) {
  const ok = passed(result);
  console.log(`${ok ? "  ok  " : " FAIL "} ${result.check.name} [${result.check.viewport.label}]`);

  if (!result.loaded) console.log(`         page did not load: ${result.check.path}`);
  for (const error of result.consoleErrors) console.log(`         console error: ${error}`);

  for (const a of result.assertions.filter((x) => !x.passed)) {
    console.log(`         ${describeAssertion(a.assertion)}`);
    console.log(`           found: ${a.detail}`);
    console.log(`           why it matters: ${a.assertion.why}`);
  }
  if (!ok && result.screenshotPath) console.log(`         screenshot: ${result.screenshotPath}`);
}

const summary = summariseResults(results);
console.log(`\n${summary.total - summary.failed}/${summary.total} passed.\n`);

// Report to the same trail as everything else, then exit non-zero on failure
// so this can gate a commit.
const observability = attachObservability(config);
await observability.emitter.emit(
  event("uitest.finished", {
    mode: empty ? "empty" : "populated",
    total: summary.total,
    failed: summary.failed,
    baseUrl,
  }),
);

process.exit(summary.failed > 0 ? 1 : 0);
