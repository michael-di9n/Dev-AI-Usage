import { Application } from "../src/Application";

const app = Application.create();
const started = Date.now();
const results = await app.ingest.runAll();

for (const r of results) {
  const mark = r.status === "ok" ? "ok  " : r.status === "error" ? "ERR " : "skip";
  console.log(`[${mark}] ${r.sourceId.padEnd(14)} ${r.detail}`);
}
console.log(`\nCounts: ${JSON.stringify(app.queries.counts())}`);
console.log(`Ingest finished in ${((Date.now() - started) / 1000).toFixed(2)}s`);
app.close();
