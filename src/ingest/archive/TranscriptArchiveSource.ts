import { access, open } from "node:fs/promises";
import type { ArchiveRepository } from "../../db/ArchiveRepository";
import { failed, ok, skipped, type IngestResult, type IngestSource } from "../Source";
import type { TranscriptFile, TranscriptScanner } from "../claude-code/TranscriptScanner";
import { ENCODING, compress, sha256 } from "./TranscriptArchive";

/**
 * Keeps a compressed copy of every transcript, so the numbers outlive the
 * files they came from.
 *
 * Claude Code expires its own transcripts on a schedule this project does not
 * control. Everything else here reads them and stores a parse; when a file
 * goes, the parse stays but the source is gone, and any question nobody had
 * thought to ask yet can never be asked. This source stores the bytes instead.
 *
 * It is a source rather than a step inside ClaudeCodeSource on purpose. That
 * one reads lines and can skip a partial trailing one; this one must copy
 * bytes exactly, including the partial line, or a restore is not a restore.
 * Keeping them apart also means deleting this file removes the feature and
 * nothing else - and that its cursor is its own, so an archive that has fallen
 * behind cannot make the parser re-read anything.
 */
export class TranscriptArchiveSource implements IngestSource {
  readonly id = "transcript-archive";
  readonly label = "Transcript archive";

  /**
   * A chunk stops being rewritten once it passes this.
   *
   * The bound on work per pass. An open chunk is re-read and recompressed
   * every time the file grows, so without a seal the active session
   * transcript - 30MB in a day here - would be recompressed on every app
   * start. 4MB costs about 40ms and gives up roughly 5% of the ratio against
   * compressing each file whole.
   */
  private static readonly SEAL_BYTES = 4 * 1024 * 1024;

  constructor(
    private readonly repo: ArchiveRepository | null,
    private readonly scanner: TranscriptScanner,
    private readonly projectsDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async unavailableReason(): Promise<string | null> {
    if (this.repo === null) {
      return "Archiving is off. Unset DEV_AI_USAGE_ARCHIVE to keep a copy of transcripts before Claude Code expires them.";
    }
    try {
      await access(this.projectsDir);
      return null;
    } catch {
      return `No transcripts at ${this.projectsDir}. Set CLAUDE_CONFIG_DIR or CLAUDE_CODE_PROJECTS_DIR.`;
    }
  }

  async ingest(): Promise<IngestResult> {
    const reason = await this.unavailableReason();
    if (reason || this.repo === null) return skipped(this.id, reason ?? "Archiving is off.");

    const at = this.now().toISOString();
    try {
      const files = await this.scanner.findAll();

      // Nothing found is not evidence that everything was deleted - far more
      // often it is a path that moved or a permission problem - so the pass
      // stops here rather than marking the whole corpus missing.
      if (files.length === 0) {
        return ok(this.id, "No session files on disk to archive; nothing marked missing.", 0);
      }

      const pass = this.repo.beginPass();
      let stored = 0;
      let bytes = 0;
      for (const file of files) {
        const written = await this.archive(file, pass, at);
        if (written > 0) { stored += 1; bytes += written; }
      }

      const gone = this.repo.markMissing(pass, at);
      return ok(
        this.id,
        `${stored} of ${files.length} session files archived (${mb(bytes)} new)` +
          (gone > 0 ? `, ${gone} no longer on disk` : ""),
        stored,
      );
    } catch (error) {
      return failed(this.id, error);
    }
  }

  /** Returns the raw bytes newly stored, or 0 when nothing had changed. */
  private async archive(file: TranscriptFile, pass: number, at: string): Promise<number> {
    const repo = this.repo!;
    const head = repo.head(file.path);

    // Same size and same mtime: not opened at all. This is what makes a pass
    // over an unchanged corpus cost a stat per file rather than a read.
    if (head && head.bytes === file.size && head.mtimeMs === file.mtimeMs) {
      repo.touchSeen(file.path, pass, at);
      return 0;
    }

    const plan = this.next(head, file.size);
    if (plan === null) {
      repo.touchSeen(file.path, pass, at);
      return 0;
    }

    const raw = await readRange(file.path, plan.from, file.size);
    if (raw.length === 0) {
      repo.touchSeen(file.path, pass, at);
      return 0;
    }

    repo.saveChunk(
      {
        path: file.path,
        generation: plan.generation,
        seq: plan.seq,
        byteFrom: plan.from,
        byteTo: plan.from + raw.length,
        sealed: raw.length >= TranscriptArchiveSource.SEAL_BYTES,
        encoding: ENCODING,
        sha256: sha256(raw),
        content: compress(raw),
      },
      file.mtimeMs,
      pass,
      at,
    );
    return raw.length;
  }

  /**
   * Which chunk the next bytes belong to.
   *
   * Three cases, and the third is the one that matters. A file that has shrunk
   * was rotated or rewritten, so its byte offsets now point into the middle of
   * something else. The parser's answer to that is to start over; here that
   * would mean throwing away archived bytes, which is the one outcome this
   * whole source exists to prevent. So the old generation is left untouched
   * and a new one starts beside it.
   */
  private next(
    head: { generation: number; last: { seq: number; byteFrom: number; byteTo: number; sealed: boolean } | null } | null,
    size: number,
  ): { generation: number; seq: number; from: number } | null {
    if (head === null || head.last === null) return { generation: head?.generation ?? 0, seq: 0, from: 0 };

    const { last } = head;
    if (size < last.byteTo) return { generation: head.generation + 1, seq: 0, from: 0 };
    if (size === last.byteTo) return null;

    return last.sealed
      ? { generation: head.generation, seq: last.seq + 1, from: last.byteTo }
      // The open chunk is re-read from its own start and replaced, so a chunk
      // is always one contiguous compressed run rather than a seam.
      : { generation: head.generation, seq: last.seq, from: last.byteFrom };
  }
}

/** Exact bytes, not lines: a restore has to return the file, trailing partial
 *  line and all, or it is a different file. */
async function readRange(path: string, from: number, to: number): Promise<Uint8Array> {
  const length = to - from;
  if (length <= 0) return new Uint8Array(0);

  const handle = await open(path, "r");
  try {
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, from);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function mb(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
