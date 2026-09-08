import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/** Line feed. Transcripts are JSONL, so this is the only separator. */
const NEWLINE = 0x0a;
const EMPTY = Buffer.alloc(0);

export interface TranscriptFile {
  path: string;
  size: number;
  mtimeMs: number;
}

/**
 * Finds transcript files and reads them a line at a time from a byte offset.
 *
 * Transcripts are append-only and the corpus runs to hundreds of megabytes, so
 * "what changed" is a byte range, not a diff. Reading from an offset is the
 * difference between a re-ingest costing milliseconds and costing minutes.
 */
export class TranscriptScanner {
  /** Transcripts only, which is all the parser can read. */
  constructor(
    private readonly projectsDir: string,
    private readonly include: (fileName: string) => boolean = isTranscript,
  ) {}

  /**
   * Every file in the tree, not only the transcripts.
   *
   * For the archive. A session directory also holds subagent metadata, memory
   * notes and persisted tool output, and Claude Code expires the directory
   * rather than the `.jsonl` inside it - so an archive that took only the
   * transcripts would let the rest go with it. Measured here that is 162 files
   * and 2.5MB against 148MB of transcripts, which is a rounding error against
   * losing them.
   */
  static everyFile(projectsDir: string): TranscriptScanner {
    return new TranscriptScanner(projectsDir, () => true);
  }

  async findAll(): Promise<TranscriptFile[]> {
    return this.walk(this.projectsDir);
  }

  /**
   * Lines in `[fromByte, toByte)`, each with the offset the reader may safely
   * resume from once it has been handled.
   *
   * `consumedTo` is the whole point, and it is why this splits on newlines by
   * hand rather than handing the stream to `readline`. A transcript is being
   * appended to while we read it, so the last line in the range is routinely
   * half-written. That torn line still gets yielded - the caller parses it,
   * `JSON.parse` fails, and it is dropped - but `consumedTo` does NOT advance
   * past it. It stays pointing at the line's first byte, so the next pass
   * re-reads the record from the start once the writer has finished it.
   *
   * Advancing to the end of the range instead is what this used to do, and it
   * lost the record permanently: the following pass began mid-JSON, so the
   * remainder was garbage too and no pass ever saw the whole thing. Nothing
   * surfaced it either, because a dropped line is indistinguishable from the
   * partial tail that is genuinely normal here.
   *
   * A file whose final line has no terminator at all is therefore still
   * ingested - the line is yielded and parses fine - and simply does not move
   * the cursor. Re-reading it next pass costs one `INSERT OR IGNORE`.
   *
   * Bytes, not characters: `consumedTo` is a file offset, so the split happens
   * on the raw buffer and only complete lines are decoded. Slicing UTF-8 text
   * by string index would put the cursor mid-codepoint on any transcript
   * containing a non-ASCII character, which is all of them.
   */
  async *readLinesFrom(
    path: string,
    fromByte: number,
    toByte: number,
  ): AsyncGenerator<{ text: string; consumedTo: number }> {
    if (toByte <= fromByte) return;

    const stream = createReadStream(path, { start: fromByte, end: toByte - 1 });
    let consumedTo = fromByte;
    let held: Buffer = EMPTY;
    try {
      for await (const chunk of stream) {
        held = held.length === 0 ? (chunk as Buffer) : Buffer.concat([held, chunk as Buffer]);
        let newline = held.indexOf(NEWLINE);
        while (newline !== -1) {
          const line = held.subarray(0, newline);
          consumedTo += newline + 1;
          held = held.subarray(newline + 1);
          yield { text: line.toString("utf8"), consumedTo };
          newline = held.indexOf(NEWLINE);
        }
      }
      // Unterminated tail: offered, but it does not move the cursor.
      if (held.length > 0) yield { text: held.toString("utf8"), consumedTo };
    } finally {
      stream.destroy();
    }
  }

  private async walk(dir: string): Promise<TranscriptFile[]> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return []; // An unreadable subtree is skipped, never fatal.
    }

    const found: TranscriptFile[] = [];
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        found.push(...(await this.walk(path)));
      } else if (entry.isFile() && this.include(entry.name)) {
        const info = await stat(path).catch(() => null);
        if (info) found.push({ path, size: info.size, mtimeMs: info.mtimeMs });
      }
    }
    return found;
  }
}

const isTranscript = (fileName: string) => fileName.endsWith(".jsonl");
