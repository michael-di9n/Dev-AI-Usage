import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Application } from "../src/Application";
import { restoreFile } from "../src/ingest/archive/TranscriptRestore";

/**
 * The archive, from the command line.
 *
 * `--restore` is the reason this file exists. A backup nobody has ever read
 * back is a guess, so the restore path ships with the write path rather than
 * being written for the first time on the day it is needed - by which point
 * the transcripts it was protecting are already gone.
 */

const args = process.argv.slice(2);
const restoreTo = flag("--restore");
const verifyOnly = args.includes("--verify");

const app = Application.create();

if (app.archive === null) {
  console.log("\nArchiving is off (DEV_AI_USAGE_ARCHIVE=off). Nothing to report.\n");
  app.close();
  process.exit(0);
}

if (restoreTo !== null || verifyOnly) {
  restore(restoreTo);
} else {
  const result = await app.archiveSource.ingest();
  const mark = result.status === "ok" ? "ok  " : result.status === "error" ? "ERR " : "skip";
  console.log(`[${mark}] ${result.detail}`);
  status();
}

app.close();

function status(): void {
  const c = app.archive!.coverage();

  if (c.files === 0) {
    console.log("\nNothing archived yet. Run `npm run archive` or open the dashboard.\n");
    return;
  }

  const ratio = c.storedBytes === 0 ? null : c.bytes / c.storedBytes;
  console.log("\n=== Transcript archive ===");
  console.log(`Files             ${c.files.toLocaleString()}`);
  // The number this whole feature is for. Named plainly, because it is the
  // count of transcripts that now exist nowhere else.
  console.log(`Gone from disk    ${c.missing.toLocaleString()}${c.missing > 0 ? "  (archive is the only copy)" : ""}`);
  console.log(`Original          ${mb(c.bytes)}`);
  console.log(`Stored            ${mb(c.storedBytes)}${ratio === null ? "" : `  (${ratio.toFixed(1)}x smaller)`}`);
  console.log(`Chunks            ${c.chunks.toLocaleString()}`);
  console.log(`Last archived     ${c.lastArchivedAt ?? "-"}`);
  console.log(`\nRestore with: npm run archive -- --restore <dir>`);
  console.log(`Verify with:  npm run archive -- --verify\n`);
}

/**
 * Rebuild every archived file, and check it against what was stored.
 *
 * With no directory this is a verify: every chunk is still decompressed and
 * hashed, so the archive is proved readable without writing 150MB to disk to
 * find out.
 */
function restore(into: string | null): void {
  const queries = app.archive!;
  const paths = queries.paths();
  let bytes = 0;
  const failures: string[] = [];

  for (const { path, generation } of paths) {
    try {
      const raw = restoreFile(queries, path, generation);
      bytes += raw.length;

      if (into !== null) {
        // Rebuilt under the target directory, never over the original: a
        // restore that overwrote a live transcript could destroy bytes newer
        // than the ones being written back.
        const target = join(resolve(into), safeRelative(path));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, raw);
      }
    } catch (error) {
      failures.push(`  ${path}\n    ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const verb = into === null ? "verified" : `restored to ${resolve(into)}`;
  console.log(`\n${paths.length - failures.length} of ${paths.length} files ${verb} (${mb(bytes)}).`);

  if (failures.length > 0) {
    console.log(`\n${failures.length} could NOT be rebuilt:`);
    for (const line of failures) console.log(line);
    console.log("");
    process.exitCode = 1;
    return;
  }
  console.log("Every chunk decompressed and matched its stored hash.\n");
}

/** An absolute source path, made relative so a restore lands inside the
 *  target directory rather than back at the root of the filesystem. */
function safeRelative(path: string): string {
  const rel = relative("/", path);
  return rel.startsWith("..") ? path.replace(/^[/\\]+/, "") : rel;
}

function flag(name: string): string | null {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] ?? ".";
}

function mb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
