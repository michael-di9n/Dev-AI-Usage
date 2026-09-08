-- This database is NOT derived data. It is the one file here that is not.
--
-- `data/usage.db` can be deleted and rebuilt in two seconds, because every row
-- in it restates something a transcript on disk still says. This file is the
-- opposite: Claude Code expires transcripts on its own schedule, and once it
-- has, the bytes in here are the only copy left. So the advice that applies to
-- usage.db - delete it and re-run rather than hunting a schema problem - must
-- never be applied to this one. It lives in a separate file precisely so that
-- advice cannot be followed by accident.
--
-- What is stored is the raw bytes, compressed, and nothing else. Not a parse,
-- not a summary: a metric nobody has thought of yet can only be derived later
-- if the original line is still here in full.

-- One row per transcript file ever seen.
--
-- `missing_since` is the point of the table. A file that has gone from disk is
-- not deleted here; it is marked, so the dashboard can say "43 transcripts
-- exist only in the archive now" instead of quietly showing fewer of them.
CREATE TABLE IF NOT EXISTS archived_file (
  path              TEXT PRIMARY KEY,
  -- Bumped when a file shrinks, which means it was rotated or rewritten and
  -- the byte offsets no longer describe it. The old generation's chunks stay:
  -- discarding archived bytes is the one thing this table exists to prevent.
  generation        INTEGER NOT NULL DEFAULT 0,
  bytes             INTEGER NOT NULL DEFAULT 0,
  stored_bytes      INTEGER NOT NULL DEFAULT 0,
  mtime_ms          REAL    NOT NULL DEFAULT 0,
  first_archived_at TEXT NOT NULL,
  last_archived_at  TEXT NOT NULL,
  last_seen_at      TEXT NOT NULL,
  -- Which pass last found this file on disk. A counter rather than the
  -- timestamp beside it, because "gone" is decided by comparing against the
  -- current pass and two passes can share a millisecond - which would quietly
  -- stop marking anything missing at all, in the one place a false negative
  -- costs a transcript.
  seen_pass         INTEGER NOT NULL DEFAULT 0,
  -- Null while the file is still on disk. A timestamp once it is not.
  missing_since     TEXT
);

-- The bytes, in append-ordered pieces.
--
-- Chunked rather than one blob per file so a re-archive costs the appended
-- bytes and not the whole file: the active session transcript here reached
-- 30MB in a day, and rewriting that on every pass would be both slow and a
-- write amplification problem in WAL. A chunk under the seal size is still
-- open and gets rewritten in place as the file grows; once it passes the seal
-- it is never touched again, which is what bounds the work per pass.
--
-- `sha256` is over the raw bytes of the chunk, so a restore can prove it
-- returned what was archived rather than merely returning something.
CREATE TABLE IF NOT EXISTS archived_chunk (
  path       TEXT NOT NULL,
  generation INTEGER NOT NULL,
  seq        INTEGER NOT NULL,
  byte_from  INTEGER NOT NULL,
  byte_to    INTEGER NOT NULL,
  sealed     INTEGER NOT NULL DEFAULT 0,
  encoding   TEXT NOT NULL,
  sha256     TEXT NOT NULL,
  content    BLOB NOT NULL,
  PRIMARY KEY (path, generation, seq)
);

-- The pass counter, and anywhere else the archive needs to remember a scalar.
-- Same shape as `app_state` in the derived schema, for the same reason: a
-- table is cheaper to reason about than a file beside the database.
CREATE TABLE IF NOT EXISTS archive_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
