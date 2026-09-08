#!/usr/bin/env node
/**
 * Claude Code hook: append one line, exit 0, get out of the way.
 *
 * This runs inside every tool call, so it does no parsing, no database work and
 * no network. It also exits 0 on any failure - a telemetry hook that blocks a
 * tool call is worse than a hook that loses a measurement.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const spoolPath = process.env.DEV_AI_USAGE_SPOOL ?? join(repoRoot, "data", "spool.jsonl");

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  try {
    const payload = JSON.parse(raw);
    payload.hook_event_name ??= process.argv[2] ?? "unknown";
    // A hook payload carries no timestamp. Stamping it here is the only chance:
    // ingest runs later and cannot know when the hook actually fired.
    payload.spooled_at ??= new Date().toISOString();
    mkdirSync(dirname(spoolPath), { recursive: true });
    appendFileSync(spoolPath, `${JSON.stringify(payload)}\n`);
  } catch {
    // Intentionally silent.
  }
  process.exit(0);
});
