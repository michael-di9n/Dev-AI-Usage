import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/db/Database";
import { ArchiveQueries } from "../src/db/ArchiveQueries";
import { ArchiveRepository } from "../src/db/ArchiveRepository";
import { TranscriptScanner } from "../src/ingest/claude-code/TranscriptScanner";
import { TranscriptArchiveSource } from "../src/ingest/archive/TranscriptArchiveSource";
import { restoreFile } from "../src/ingest/archive/TranscriptRestore";
import { readConfig } from "../src/config";

/**
 * The transcript archive.
 *
 * The only test that really matters here is the round trip, because every
 * other property is worthless without it: an archive that stores something
 * other than the file is not a backup, it is a slow way to lose data. The rest
 * of these cases exist because each one is a way the round trip could quietly
 * stop holding - a file that grew, a file that was rotated, a file that went
 * away entirely.
 */

let workDir: string;
let projectsDir: string;
let db: Db;
let repo: ArchiveRepository;
let queries: ArchiveQueries;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "dev-ai-archive-"));
  projectsDir = join(workDir, "projects", "-repo");
  mkdirSync(projectsDir, { recursive: true });
  db = Db.openMigrated(":memory:", "archive");
  repo = new ArchiveRepository(db);
  queries = new ArchiveQueries(db);
});

afterEach(() => {
  db.close();
  rmSync(workDir, { recursive: true, force: true });
});

const source = (clock?: () => Date) =>
  new TranscriptArchiveSource(repo, TranscriptScanner.everyFile(projectsDir), projectsDir, clock);

const transcript = (name: string) => join(projectsDir, name);

/** Realistic shape: long, repetitive JSON lines, which is what compresses. */
const lines = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) =>
    JSON.stringify({ uuid: `u${from + i}`, role: "assistant", text: "the same sort of sentence over and over" }),
  ).join("\n") + "\n";

const restored = (path: string) =>
  restoreFile(queries, path, queries.paths().find((p) => p.path === path)!.generation);

describe("TranscriptArchiveSource", () => {
  it("explains itself rather than failing when archiving is off", async () => {
    const off = new TranscriptArchiveSource(null, new TranscriptScanner(projectsDir), projectsDir);

    const result = await off.ingest();

    expect(result.status).toBe("not-configured");
    expect(result.detail).toContain("DEV_AI_USAGE_ARCHIVE");
    expect(await off.unavailableReason()).toContain("Archiving is off");
  });

  /** The whole point. Anything less than byte-identical is not a restore. */
  it("restores a transcript byte for byte", async () => {
    const path = transcript("a.jsonl");
    writeFileSync(path, lines(0, 500));

    await source().ingest();

    expect(Buffer.from(restored(path))).toEqual(readFileSync(path));
  });

  /**
   * Transcripts are append-only and reach tens of megabytes in a day, so a
   * pass has to cost the appended bytes rather than the file.
   */
  it("appends only the new bytes when a transcript grows", async () => {
    const path = transcript("b.jsonl");
    writeFileSync(path, lines(0, 200));
    await source().ingest();

    appendFileSync(path, lines(200, 200));
    await source().ingest();

    expect(Buffer.from(restored(path))).toEqual(readFileSync(path));
    // One open chunk, rewritten in place - not two rows and not a seam.
    expect(queries.chunksOf(path, 0)).toHaveLength(1);
    expect(queries.chunksOf(path, 0)[0]!.byteTo).toBe(readFileSync(path).length);
  });

  it("writes nothing when nothing changed", async () => {
    const path = transcript("c.jsonl");
    writeFileSync(path, lines(0, 100));
    await source().ingest();
    const before = queries.coverage();

    const second = await source().ingest();

    expect(second.recordsWritten).toBe(0);
    expect(queries.coverage()).toEqual(before);
  });

  /**
   * The reason the feature exists. Claude Code expires transcripts on its own
   * schedule; the rows must outlive the file and say so.
   */
  it("keeps a transcript after Claude Code deletes it, and says it is gone", async () => {
    const path = transcript("d.jsonl");
    const original = lines(0, 300);
    writeFileSync(path, original);
    await source().ingest();

    unlinkSync(path);
    // A second transcript, so the pass is not the "found nothing" case.
    writeFileSync(transcript("e.jsonl"), lines(0, 10));
    const result = await source().ingest();

    expect(result.detail).toContain("1 no longer on disk");
    expect(queries.coverage().missing).toBe(1);
    expect(Buffer.from(restored(path)).toString()).toBe(original);
  });

  /**
   * An empty scan is far more often a moved path or a permissions problem than
   * a deleted corpus. Declaring every transcript missing on one bad pass would
   * make the dashboard lie about the one thing it is here to be sure of.
   */
  it("does not declare the corpus missing when it cannot see the directory", async () => {
    writeFileSync(transcript("f.jsonl"), lines(0, 50));
    await source().ingest();

    rmSync(projectsDir, { recursive: true, force: true });
    mkdirSync(projectsDir, { recursive: true });
    await source().ingest();

    expect(queries.coverage().missing).toBe(0);
  });

  /**
   * A shrunk file was rotated or rewritten, so its offsets now point into
   * something else. The parser starts over; the archive must not, because
   * starting over here means deleting the only copy of the old bytes.
   */
  it("keeps the old bytes when a transcript is rewritten shorter", async () => {
    const path = transcript("g.jsonl");
    writeFileSync(path, lines(0, 400));
    await source().ingest();
    const firstGeneration = queries.chunksOf(path, 0);

    writeFileSync(path, lines(900, 5));
    await source().ingest();

    // The new content restores, and the old generation is still on disk.
    expect(Buffer.from(restored(path))).toEqual(readFileSync(path));
    expect(queries.paths().find((p) => p.path === path)!.generation).toBe(1);
    expect(queries.chunksOf(path, 0)).toEqual(firstGeneration);
  });

  /** A partial trailing line is part of the file. The parser skips it; a
   *  restore that skipped it would return a different file. */
  it("archives a half-written trailing line", async () => {
    const path = transcript("h.jsonl");
    writeFileSync(path, `${lines(0, 3)}{"uuid":"partial"`);

    await source().ingest();

    expect(Buffer.from(restored(path))).toEqual(readFileSync(path));
  });

  /**
   * Claude Code expires the session directory, not the transcript inside it.
   * The memory notes, subagent metadata and persisted tool output beside the
   * .jsonl go at the same moment and are session data too - the parser has no
   * use for them, which is exactly why nothing else here would keep them.
   */
  it("keeps the memory notes and subagent metadata beside the transcript", async () => {
    mkdirSync(join(projectsDir, "session", "subagents"), { recursive: true });
    mkdirSync(join(projectsDir, "memory"), { recursive: true });
    writeFileSync(join(projectsDir, "session", "subagents", "agent-a1.meta.json"), '{"agent":"explore"}');
    writeFileSync(join(projectsDir, "memory", "notes.md"), "# what we learned\n");
    writeFileSync(transcript("m.jsonl"), lines(0, 10));

    await source().ingest();

    expect(queries.paths()).toHaveLength(3);
    expect(Buffer.from(restored(join(projectsDir, "memory", "notes.md"))).toString())
      .toBe("# what we learned\n");
  });

  it("reports how much it actually saved", async () => {
    writeFileSync(transcript("i.jsonl"), lines(0, 2000));

    await source().ingest();
    const c = queries.coverage();

    expect(c.files).toBe(1);
    expect(c.bytes).toBeGreaterThan(0);
    expect(c.storedBytes).toBeGreaterThan(0);
    // Repetitive JSON compresses hard; anything near 1x means it is not
    // compressing at all and the storage estimate in the docs is wrong.
    expect(c.bytes / c.storedBytes).toBeGreaterThan(3);
  });
});

describe("restore", () => {
  it("refuses to return a file it does not hold in full", () => {
    const path = transcript("j.jsonl");
    writeFileSync(path, lines(0, 20));

    // A hole: a chunk that does not start where the previous one ended.
    repo.saveChunk(
      { path, generation: 0, seq: 0, byteFrom: 40, byteTo: 60, sealed: true,
        encoding: "br", sha256: "x", content: new Uint8Array([1, 2, 3]) },
      0, 1, "2026-01-01T00:00:00.000Z",
    );

    expect(() => restoreFile(queries, path, 0)).toThrow(/hole in it/);
  });

  it("refuses to return bytes that do not match what was stored", async () => {
    const path = transcript("k.jsonl");
    writeFileSync(path, lines(0, 20));
    await source().ingest();

    db.run("UPDATE archived_chunk SET sha256 = ? WHERE path = ?", ["deadbeef".repeat(8), path]);

    expect(() => restoreFile(queries, path, 0)).toThrow(/corrupted/);
  });

  it("says so plainly when the archive holds nothing for a path", () => {
    expect(() => restoreFile(queries, "/nowhere.jsonl", 0)).toThrow(/Nothing archived/);
  });
});

describe("archive configuration", () => {
  it("keeps the archive in its own file, never in the derived database", () => {
    const config = readConfig({});

    expect(config.archivePath).not.toBe(config.databasePath);
    expect(config.archivePath).toMatch(/archive\.db$/);
  });

  it("is on unless it is explicitly turned off", () => {
    expect(readConfig({}).archiveMode).toBe("on");
    expect(readConfig({ DEV_AI_USAGE_ARCHIVE: "off" }).archiveMode).toBe("off");
    expect(readConfig({ DEV_AI_USAGE_ARCHIVE: "yes please" }).archiveMode).toBe("on");
  });
});
