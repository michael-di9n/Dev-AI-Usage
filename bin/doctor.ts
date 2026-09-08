import { Application } from "../src/Application";
import { Doctor, summarise } from "../src/onboarding/Doctor";

const app = Application.create();
const results = await new Doctor({
  config: app.config,
  queries: app.queries,
  ingest: app.ingest,
  otelLastSeen: app.otlp.writer.lastSeenAt(),
}).run();

const MARK: Record<string, string> = { ok: "  ok  ", todo: " todo ", problem: " FIX  " };

console.log("\nDev AI Usage - checkup\n");
for (const r of results) {
  console.log(`[${MARK[r.health]}] ${r.name}`);
  console.log(`          ${r.finding}`);
  if (r.fix) console.log(`          -> ${r.fix}`);
  console.log();
}
console.log(`${summarise(results)}\n`);

app.close();
process.exit(results.some((r) => r.health === "problem") ? 1 : 0);
