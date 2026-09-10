import type { Db } from "./Database";

/** What the archive already holds for one path, and where to append next. */
export interface ArchiveHead {
  generation: number;
  /** Bytes of the current generation already archived. */
  bytes: number;
  mtimeMs: number;
  /** The newest chunk of the current generation, or null for a new file. */
  last: { seq: number; byteFrom: number; byteTo: number; sealed: boolean } | null;
}

export interface ChunkWrite {
  path: string;
  generation: number;
  seq: number;
  byteFrom: number;
  byteTo: number;
  sealed: boolean;
  encoding: string;
  sha256: string;
  content: Uint8Array;
}

/**
 * Every write to the archive database.
 *
 * Deliberately has no delete of its own beyond a rotation's bookkeeping. This
 * store is the last copy of source data once Claude Code has expired a
 * transcript, so "tidy up the rows that look stale" is not an operation it
 * offers - a caller that wants one has to write it and justify it.
 */
export class ArchiveRepository {
  constructor(private readonly db: Db) {}

  /**
   * Open a pass and get its number.
   *
   * Every file found during the pass is stamped with it, and anything left
   * carrying an older number was not on disk. A counter rather than the pass's
   * timestamp: two passes can land in the same millisecond, and a comparison
   * that silently matches nothing would make the archive stop noticing
   * deletions - the single thing it is watching for.
   */
  beginPass(): number {
    const current = Number(
      this.db.one<{ value: string }>(
        "SELECT value FROM archive_state WHERE key = 'pass'",
      )?.value ?? 0,
    );
    const next = current + 1;
    this.db.run(
      `INSERT INTO archive_state (key, value) VALUES ('pass', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(next)],
    );
    return next;
  }

  /** Where the next bytes for this path go. Null when it has never been seen. */
  head(path: string): ArchiveHead | null {
    const file = this.db.one<Record<string, unknown>>(
      "SELECT generation, bytes, mtime_ms FROM archived_file WHERE path = ?", [path],
    );
    if (!file) return null;

    const generation = Number(file.generation);
    const last = this.db.one<Record<string, unknown>>(
      `SELECT seq, byte_from, byte_to, sealed FROM archived_chunk
        WHERE path = ? AND generation = ? ORDER BY seq DESC LIMIT 1`,
      [path, generation],
    );

    return {
      generation,
      bytes: Number(file.bytes ?? 0),
      mtimeMs: Number(file.mtime_ms ?? 0),
      last: last === null ? null : {
        seq: Number(last.seq),
        byteFrom: Number(last.byte_from),
        byteTo: Number(last.byte_to),
        sealed: Number(last.sealed) === 1,
      },
    };
  }

  /**
   * Write one chunk and move the file's marker with it, in one transaction.
   *
   * The two must land together. A chunk row without the matching `bytes` on
   * the file would be re-read and rewritten forever; a marker without its
   * chunk would skip bytes that were never actually stored, which is a silent
   * hole in the only copy.
   */
  saveChunk(chunk: ChunkWrite, mtimeMs: number, pass: number, at: string): void {
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO archived_chunk
           (path, generation, seq, byte_from, byte_to, sealed, encoding, sha256, content)
         VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(path, generation, seq) DO UPDATE SET
           byte_to = excluded.byte_to,
           sealed  = excluded.sealed,
           sha256  = excluded.sha256,
           content = excluded.content`,
        [chunk.path, chunk.generation, chunk.seq, chunk.byteFrom, chunk.byteTo,
         chunk.sealed ? 1 : 0, chunk.encoding, chunk.sha256, chunk.content],
      );

      this.db.run(
        `INSERT INTO archived_file
           (path, generation, bytes, stored_bytes, mtime_ms,
            first_archived_at, last_archived_at, last_seen_at, seen_pass, missing_since)
         VALUES (?,?,?,?,?,?,?,?,?,NULL)
         ON CONFLICT(path) DO UPDATE SET
           generation       = excluded.generation,
           bytes            = excluded.bytes,
           stored_bytes     = excluded.stored_bytes,
           mtime_ms         = excluded.mtime_ms,
           last_archived_at = excluded.last_archived_at,
           last_seen_at     = excluded.last_seen_at,
           seen_pass        = excluded.seen_pass,
           -- A file that came back is not missing any more.
           missing_since    = NULL`,
        [chunk.path, chunk.generation, chunk.byteTo, this.storedBytes(chunk.path, chunk.generation),
         mtimeMs, at, at, at, pass],
      );
    });
  }

  /**
   * Note that these paths are still on disk, without reading or rewriting them.
   *
   * One statement for the whole pass, not one per path. It was one per path,
   * and on a corpus of four thousand session files that is four thousand bare
   * UPDATEs on a pass where nothing had changed - each its own implicit
   * transaction, so each one an fsync of the WAL, because `Database.ts` leaves
   * `synchronous` at its FULL default and this database is the one that must
   * keep it. The read half of the same loop measures 18ms; the write half was
   * the pass. It is on the thread that also renders the dashboard.
   *
   * Not a transaction around the old loop, which was the other way to spend
   * one commit instead of four thousand: `saveChunk` already opens one and
   * `Db.transaction` issues a bare BEGIN with no savepoint, so nesting throws
   * the first time a file has actually changed. A pass-long transaction would
   * also hold the write lock every dashboard write then waits `busy_timeout`
   * on, which trades a slow import for a stalled page.
   *
   * The list arrives as one JSON parameter rather than N placeholders.
   * SQLITE_MAX_VARIABLE_NUMBER is a real ceiling, and a corpus that grew past
   * it would start failing rather than start being slow.
   */
  markSeen(paths: readonly string[], pass: number, at: string): void {
    if (paths.length === 0) return;
    this.db.run(
      `UPDATE archived_file
          SET last_seen_at = ?, seen_pass = ?, missing_since = NULL
        WHERE path IN (SELECT value FROM json_each(?))`,
      [at, pass, JSON.stringify(paths)],
    );
  }

  /**
   * Mark everything the pass did not see as gone.
   *
   * By "not touched this pass" rather than by a list of paths, so the cost
   * does not grow with an archive that will outlive many years of transcripts.
   * The caller must only run this after a scan that actually found files -
   * an unreadable projects directory would otherwise declare the whole corpus
   * missing on a single bad pass.
   */
  markMissing(pass: number, at: string): number {
    const gone = this.db.one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM archived_file WHERE seen_pass < ? AND missing_since IS NULL",
      [pass],
    );
    this.db.run(
      "UPDATE archived_file SET missing_since = ? WHERE seen_pass < ? AND missing_since IS NULL",
      [at, pass],
    );
    return gone?.n ?? 0;
  }

  private storedBytes(path: string, generation: number): number {
    return this.db.one<{ n: number }>(
      "SELECT COALESCE(SUM(LENGTH(content)), 0) AS n FROM archived_chunk WHERE path = ? AND generation = ?",
      [path, generation],
    )?.n ?? 0;
  }
}
