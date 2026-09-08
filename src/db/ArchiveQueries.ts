import type { Db } from "./Database";

export interface ArchiveCoverage {
  files: number;
  /** Files whose source has gone from disk. These are the reason it exists. */
  missing: number;
  chunks: number;
  /** Raw bytes archived, before compression. */
  bytes: number;
  /** Bytes actually occupied, after compression. */
  storedBytes: number;
  /** Null when nothing has ever been archived. Never an empty string. */
  lastArchivedAt: string | null;
  oldestSeenAt: string | null;
}

export interface ArchivedFile {
  path: string;
  generation: number;
  bytes: number;
  storedBytes: number;
  lastArchivedAt: string;
  /** Null while the file is still on disk. */
  missingSince: string | null;
}

/** One chunk's stored bytes, with what is needed to prove them on the way out. */
export interface StoredChunk {
  seq: number;
  byteFrom: number;
  byteTo: number;
  encoding: string;
  sha256: string;
  content: Uint8Array;
}

/**
 * Every read of the archive database.
 *
 * Split from the writer for the same reason the usage database is: the
 * dashboard and the restore path ask questions far more often than the ingest
 * grows a table, and neither should be able to break the other.
 */
export class ArchiveQueries {
  constructor(private readonly db: Db) {}

  coverage(): ArchiveCoverage {
    const row = this.db.one<Record<string, unknown>>(
      `SELECT (SELECT COUNT(*) FROM archived_file)  AS files,
              (SELECT COUNT(*) FROM archived_file WHERE missing_since IS NOT NULL) AS missing,
              (SELECT COUNT(*) FROM archived_chunk) AS chunks,
              (SELECT COALESCE(SUM(bytes), 0)        FROM archived_file) AS bytes,
              (SELECT COALESCE(SUM(stored_bytes), 0) FROM archived_file) AS stored_bytes,
              (SELECT MAX(last_archived_at) FROM archived_file) AS last_archived_at,
              (SELECT MIN(first_archived_at) FROM archived_file) AS oldest_seen_at`,
    );
    return {
      files: Number(row?.files ?? 0),
      missing: Number(row?.missing ?? 0),
      chunks: Number(row?.chunks ?? 0),
      bytes: Number(row?.bytes ?? 0),
      storedBytes: Number(row?.stored_bytes ?? 0),
      lastArchivedAt: row?.last_archived_at == null ? null : String(row.last_archived_at),
      oldestSeenAt: row?.oldest_seen_at == null ? null : String(row.oldest_seen_at),
    };
  }

  /** Archive-only files first: those are the ones nothing else can still show. */
  files(limit = 200): ArchivedFile[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT path, generation, bytes, stored_bytes, last_archived_at, missing_since
           FROM archived_file
          ORDER BY missing_since IS NULL, bytes DESC
          LIMIT ?`,
        [limit],
      )
      .map((r) => ({
        path: String(r.path),
        generation: Number(r.generation),
        bytes: Number(r.bytes ?? 0),
        storedBytes: Number(r.stored_bytes ?? 0),
        lastArchivedAt: String(r.last_archived_at),
        missingSince: r.missing_since == null ? null : String(r.missing_since),
      }));
  }

  /** Every path held, newest generation only - what a full restore walks. */
  paths(): { path: string; generation: number }[] {
    return this.db
      .all<Record<string, unknown>>("SELECT path, generation FROM archived_file ORDER BY path")
      .map((r) => ({ path: String(r.path), generation: Number(r.generation) }));
  }

  /** In append order, which is the only order they reassemble in. */
  chunksOf(path: string, generation: number): StoredChunk[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT seq, byte_from, byte_to, encoding, sha256, content
           FROM archived_chunk WHERE path = ? AND generation = ? ORDER BY seq`,
        [path, generation],
      )
      .map((r) => ({
        seq: Number(r.seq),
        byteFrom: Number(r.byte_from),
        byteTo: Number(r.byte_to),
        encoding: String(r.encoding),
        sha256: String(r.sha256),
        content: r.content as Uint8Array,
      }));
  }
}
