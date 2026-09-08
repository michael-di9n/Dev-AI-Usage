import { brotliCompressSync, brotliDecompressSync, constants } from "node:zlib";
import { createHash } from "node:crypto";

/**
 * How the archive turns bytes into stored bytes, and back.
 *
 * Brotli rather than gzip: measured over this project's own 155MB corpus it is
 * 3.9x against gzip's 3.6x and no slower at quality 5, which on a store that
 * grows by roughly 40MB a month is worth having. Quality 5 rather than 9
 * because the last two points of ratio cost four times the CPU, and this runs
 * on every app start.
 *
 * The encoding is recorded per chunk rather than assumed, so a future change of
 * codec can be made without rewriting - or worse, invalidating - what is
 * already stored.
 */
export const ENCODING = "br";

const QUALITY = 5;

export function compress(raw: Uint8Array): Uint8Array {
  return brotliCompressSync(raw, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: QUALITY,
      [constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  });
}

export function decompress(stored: Uint8Array, encoding: string): Uint8Array {
  if (encoding !== ENCODING) {
    // Loudly, not as an empty buffer. A restore that silently returns nothing
    // for an unreadable chunk is how a corrupt archive passes for a working
    // one until the day it is actually needed.
    throw new Error(`Unknown chunk encoding "${encoding}". This archive was written by a newer build.`);
  }
  return brotliDecompressSync(stored);
}

export function sha256(raw: Uint8Array): string {
  return createHash("sha256").update(raw).digest("hex");
}
