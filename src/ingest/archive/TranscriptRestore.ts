import type { ArchiveQueries, StoredChunk } from "../../db/ArchiveQueries";
import { decompress, sha256 } from "./TranscriptArchive";

/**
 * Reassembles an archived transcript.
 *
 * Every check here fails loudly. An archive is only worth keeping if it can be
 * shown to have returned what went in, and the day it is needed is the worst
 * possible day to discover it quietly returned something shorter: by then the
 * source file is gone and there is nothing left to compare against. So a gap
 * in the byte ranges, a hash that does not match, or a codec this build does
 * not know all throw rather than degrade.
 */
export function restoreBytes(path: string, chunks: StoredChunk[]): Uint8Array {
  if (chunks.length === 0) throw new Error(`Nothing archived for ${path}.`);

  const parts: Uint8Array[] = [];
  let offset = 0;

  for (const chunk of chunks) {
    if (chunk.byteFrom !== offset) {
      throw new Error(
        `${path}: chunk ${chunk.seq} starts at byte ${chunk.byteFrom}, but ${offset} bytes have been read. ` +
        "The archive has a hole in it and this file cannot be restored intact.",
      );
    }

    const raw = decompress(chunk.content, chunk.encoding);
    const actual = sha256(raw);
    if (actual !== chunk.sha256) {
      throw new Error(
        `${path}: chunk ${chunk.seq} hashes to ${actual.slice(0, 12)} but was stored as ${chunk.sha256.slice(0, 12)}. ` +
        "The stored bytes have been corrupted.",
      );
    }

    parts.push(raw);
    offset = chunk.byteTo;
  }

  return Buffer.concat(parts);
}

/** The same, straight from the database. */
export function restoreFile(queries: ArchiveQueries, path: string, generation: number): Uint8Array {
  return restoreBytes(path, queries.chunksOf(path, generation));
}
