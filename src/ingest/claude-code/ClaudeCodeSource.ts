import { access } from "node:fs/promises";
import type { IngestRepository } from "../../db/IngestRepository";
import type { Db } from "../../db/Database";
import { failed, ok, skipped, type IngestResult, type IngestSource } from "../Source";
import type { TranscriptParser } from "./TranscriptParser";
import type { TranscriptScanner, TranscriptFile } from "./TranscriptScanner";

/**
 * Reads Claude Code transcripts into the database, incrementally.
 *
 * Two-level skip: unchanged size and mtime means the file is not opened at all;
 * a grown file is opened at the byte offset already consumed. Together those
 * make a re-ingest over the whole corpus effectively free, which is what lets
 * this run on a timer rather than on demand.
 */
export class ClaudeCodeSource implements IngestSource {
  readonly id = "claude-code";
  readonly label = "Claude Code transcripts";

  constructor(
    private readonly db: Db,
    private readonly repo: IngestRepository,
    private readonly scanner: TranscriptScanner,
    private readonly parser: TranscriptParser,
    private readonly projectsDir: string,
  ) {}

  async unavailableReason(): Promise<string | null> {
    try {
      await access(this.projectsDir);
      return null;
    } catch {
      return `No transcripts at ${this.projectsDir}. Set CLAUDE_CONFIG_DIR or CLAUDE_CODE_PROJECTS_DIR.`;
    }
  }

  async ingest(): Promise<IngestResult> {
    const reason = await this.unavailableReason();
    if (reason) return skipped(this.id, reason);

    try {
      const files = await this.scanner.findAll();
      let read = 0;
      let rows = 0;
      for (const file of files) {
        const written = await this.ingestFile(file);
        if (written !== null) { read += 1; rows += written; }
      }
      return ok(this.id, `${read} of ${files.length} transcripts changed`, rows);
    } catch (error) {
      return failed(this.id, error);
    }
  }

  /** Returns rows written, or null when the file was skipped untouched. */
  private async ingestFile(file: TranscriptFile): Promise<number | null> {
    const cursor = this.repo.readCursor(file.path);
    if (cursor && cursor.size === file.size && cursor.mtimeMs === file.mtimeMs) return null;

    // A shrunk file was rotated or rewritten - start over rather than read
    // from an offset that now points into the middle of a different record.
    const from = cursor && cursor.bytesConsumed <= file.size ? cursor.bytesConsumed : 0;

    // Read the range we stat'd, not "to EOF": the writer is appending as we
    // go, so EOF moves. Bounding the read to `file.size` keeps the offset we
    // are about to store describing the same bytes the size and mtime beside
    // it describe.
    const lines: string[] = [];
    let consumed = from;
    for await (const line of this.scanner.readLinesFrom(file.path, from, file.size)) {
      lines.push(line.text);
      consumed = line.consumedTo;
    }

    const parsed = this.parser.parse(lines);

    // `consumed`, not `file.size`. They differ by exactly one half-written
    // record - the case where the pass landed while Claude Code was mid-line -
    // and storing the larger of the two loses that record for good: the next
    // pass would start inside the JSON and read the remainder as garbage.
    // Stopping short leaves the cursor at the record's first byte, so the next
    // pass reads it whole. Everything before it is already committed and
    // re-reading is free, because every insert is keyed and idempotent.
    //
    // The file's own size and mtime are still stored as observed, so an
    // unchanged file is still skipped without being opened: a torn tail that
    // the writer never finishes costs one short read, once.
    //
    // One transaction per file: a crash mid-write cannot leave a byte offset
    // committed ahead of the rows it claims to cover.
    return this.db.transaction(() => {
      this.repo.saveTranscript(parsed);
      this.repo.writeCursor(file.path, {
        size: file.size,
        mtimeMs: file.mtimeMs,
        bytesConsumed: consumed,
      });
      return parsed.messages.length + parsed.toolCalls.length;
    });
  }
}
