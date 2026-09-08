-- Every table that can be re-derived from a source file uses a natural primary
-- key taken from that file, so re-ingesting the same bytes is a no-op via
-- INSERT OR IGNORE rather than needing a dedupe pass.

CREATE TABLE IF NOT EXISTS session (
  session_id    TEXT PRIMARY KEY,
  developer_id  TEXT NOT NULL,
  tool          TEXT NOT NULL,
  project_path  TEXT,
  git_branch    TEXT,
  started_at    TEXT,
  ended_at      TEXT,
  agent_version TEXT,
  entrypoint    TEXT
);

CREATE TABLE IF NOT EXISTS message (
  uuid              TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL,
  parent_uuid       TEXT,
  role              TEXT NOT NULL,
  model             TEXT,
  ts                TEXT NOT NULL,
  effort            TEXT,
  is_sidechain      INTEGER NOT NULL DEFAULT 0,
  request_id        TEXT,
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  cache_read        INTEGER NOT NULL DEFAULT 0,
  cache_create_5m   INTEGER NOT NULL DEFAULT 0,
  cache_create_1h   INTEGER NOT NULL DEFAULT 0,
  thinking_tokens   INTEGER NOT NULL DEFAULT 0,
  service_tier      TEXT,
  stop_reason       TEXT,
  cost_usd_derived  REAL
);
CREATE INDEX IF NOT EXISTS message_ts     ON message(ts);
CREATE INDEX IF NOT EXISTS message_session ON message(session_id);

CREATE TABLE IF NOT EXISTS tool_call (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  message_uuid  TEXT NOT NULL,
  tool_name     TEXT NOT NULL,
  ts            TEXT NOT NULL,
  input_hash    TEXT NOT NULL,
  input_norm    TEXT NOT NULL,
  result_bytes  INTEGER,
  is_error      INTEGER NOT NULL DEFAULT 0,
  is_rejected   INTEGER NOT NULL DEFAULT 0,
  interrupted   INTEGER NOT NULL DEFAULT 0,
  duration_ms   INTEGER
);
CREATE INDEX IF NOT EXISTS tool_call_hash    ON tool_call(input_hash);
CREATE INDEX IF NOT EXISTS tool_call_session ON tool_call(session_id, ts);

-- Keyed by the turn itself, not by the session that reported it.
--
-- Resuming a session writes a NEW transcript with a NEW session id and copies
-- the earlier records into it - rewriting `sessionId` on every copy while
-- keeping the original `uuid`. Every other table here dedupes on that uuid, so
-- a resume costs nothing twice. This one had no uuid to key on and used
-- (session_id, ts), which the rewrite defeats: the same turn arrived again
-- under a different session and inserted again. Measured on this corpus that
-- was 54 surplus rows and 4.77 hours of wall-clock time counted more than
-- once, one turn appearing three times across a session and two resumes of it.
--
-- A turn's natural identity is when it happened and how long it took, so that
-- is the key. `duration_ms` is in it because a millisecond timestamp alone
-- would drop a genuinely distinct turn from a concurrent session; with the
-- duration beside it, a collision needs two turns to start in the same
-- millisecond AND last the same number of them.
--
-- `session_id` stays a column: first writer wins, which is the same rule the
-- uuid-keyed tables already follow. The session that first recorded the turn
-- owns it, and the resume that replayed it does not.
CREATE TABLE IF NOT EXISTS turn (
  session_id    TEXT NOT NULL,
  ts            TEXT NOT NULL,
  duration_ms   INTEGER NOT NULL,
  message_count INTEGER NOT NULL,
  PRIMARY KEY (ts, duration_ms)
);

CREATE TABLE IF NOT EXISTS prompt (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  ts         TEXT NOT NULL,
  text_hash  TEXT NOT NULL,
  text_norm  TEXT NOT NULL,
  char_len   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS prompt_hash ON prompt(text_hash);

CREATE TABLE IF NOT EXISTS edit (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  ts            TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  language      TEXT NOT NULL,
  lines_added   INTEGER NOT NULL DEFAULT 0,
  lines_removed INTEGER NOT NULL DEFAULT 0,
  decision      TEXT NOT NULL
);

-- Ground truth from Claude Code itself. Kept separate from derived cost so the
-- two can be compared instead of one silently overwriting the other.
CREATE TABLE IF NOT EXISTS session_cost_report (
  session_id      TEXT PRIMARY KEY,
  total_cost_usd  REAL NOT NULL,
  api_duration_ms INTEGER NOT NULL,
  wall_duration_ms INTEGER NOT NULL,
  tool_duration_ms INTEGER NOT NULL,
  lines_added     INTEGER NOT NULL,
  lines_removed   INTEGER NOT NULL,
  per_model_json  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cursor_daily (
  date               TEXT PRIMARY KEY,
  tab_suggested      INTEGER NOT NULL DEFAULT 0,
  tab_accepted       INTEGER NOT NULL DEFAULT 0,
  composer_suggested INTEGER NOT NULL DEFAULT 0,
  composer_accepted  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cursor_commit (
  commit_hash    TEXT NOT NULL,
  branch         TEXT NOT NULL,
  human_lines    INTEGER NOT NULL DEFAULT 0,
  composer_lines INTEGER NOT NULL DEFAULT 0,
  tab_lines      INTEGER NOT NULL DEFAULT 0,
  ai_pct         REAL,
  commit_date    TEXT,
  PRIMARY KEY (commit_hash, branch)
);

-- Optional sources. Absent rows mean "not configured", which the UI renders as
-- an em dash - never as zero.
CREATE TABLE IF NOT EXISTS daily_analytics (
  date                   TEXT NOT NULL,
  developer_id           TEXT NOT NULL,
  model                  TEXT NOT NULL,
  num_sessions           INTEGER NOT NULL DEFAULT 0,
  lines_added            INTEGER NOT NULL DEFAULT 0,
  lines_removed          INTEGER NOT NULL DEFAULT 0,
  commits                INTEGER NOT NULL DEFAULT 0,
  pull_requests          INTEGER NOT NULL DEFAULT 0,
  edit_accepted          INTEGER NOT NULL DEFAULT 0,
  edit_rejected          INTEGER NOT NULL DEFAULT 0,
  tokens_input           INTEGER NOT NULL DEFAULT 0,
  tokens_output          INTEGER NOT NULL DEFAULT 0,
  tokens_cache_read      INTEGER NOT NULL DEFAULT 0,
  tokens_cache_create    INTEGER NOT NULL DEFAULT 0,
  cost_usd_authoritative REAL,
  PRIMARY KEY (date, developer_id, model)
);

CREATE TABLE IF NOT EXISTS otel_event (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  ts         TEXT NOT NULL,
  session_id TEXT,
  request_id TEXT,
  attrs_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS otel_event_name ON otel_event(name, ts);

CREATE TABLE IF NOT EXISTS otel_metric (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  ts         TEXT NOT NULL,
  value      REAL NOT NULL,
  session_id TEXT,
  attrs_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS otel_metric_name ON otel_metric(name, ts);

-- Findings, from any rule family. Deliberately carries no measure column of
-- its own: what is worth counting differs per family, so it goes in
-- evidence_json rather than as a column most rows would leave at zero.
CREATE TABLE IF NOT EXISTS signal (
  id             TEXT PRIMARY KEY,
  kind           TEXT NOT NULL,
  severity       TEXT NOT NULL,
  scope          TEXT NOT NULL,
  scope_id       TEXT NOT NULL,
  date           TEXT,
  evidence_json  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS signal_kind ON signal(kind);

-- Small key/value store for choices the user makes in the UI, such as which
-- repository the readiness page is looking at. Not derived data: deleting the
-- database loses the choice, which is why the page falls back to asking again
-- rather than to a guess.
CREATE TABLE IF NOT EXISTS app_state (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Everything the hooks spool, not just the durations. Four of the five hook
-- events exercise 02 registers carry no tool_use_id, and before this table
-- existed the drain discarded them.
--
-- `ts` is nullable because a hook payload carries no timestamp of its own:
-- bin/hook-spool.mjs stamps `spooled_at` on the way in, and a line spooled
-- before that existed has none. A missing time renders an em dash.
CREATE TABLE IF NOT EXISTS hook_event (
  id          TEXT PRIMARY KEY,
  event       TEXT NOT NULL,
  ts          TEXT,
  session_id  TEXT,
  tool_name   TEXT,
  attrs_json  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS hook_event_kind ON hook_event(event, ts);

-- Byte offsets are what make re-ingest cheap on an append-only 250MB corpus.
CREATE TABLE IF NOT EXISTS ingest_cursor (
  source_key      TEXT PRIMARY KEY,
  size            INTEGER NOT NULL,
  mtime_ms        REAL NOT NULL,
  bytes_consumed  INTEGER NOT NULL,
  updated_at      TEXT NOT NULL
);

-- --- the trace page ---------------------------------------------------------

-- What one content block of one message actually said.
--
-- Every other table here keeps counts. This one keeps text, and it is the only
-- one that does, because `tool_call.input_norm` is deliberately lossy: it
-- collapses paths to `<path>` and runs of digits to `<n>` so two calls can be
-- compared by shape. A trace has to show what was really sent.
--
-- KEY: (message_uuid, seq). The uuid is the transcript's own and survives a
-- resume unchanged - a resume rewrites `session_id` on every copied record
-- while keeping the uuid, which is why `turn` had to be re-keyed and why this
-- table must not be keyed on the session either. `seq` counts EVERY block in
-- the message, including kinds nothing is captured for, so a row's identity
-- does not move if the capture rules change later.
--
-- `content` is capped at DEV_AI_USAGE_TRACE_CHARS; `char_len` is always the
-- true length before capping. So `char_len > length(content)` means truncated
-- and the page says by how much, while `char_len = 0` with empty content means
-- measured-empty. Two facts, no ambiguous third state - which matters most for
-- thinking: Claude Code writes `{"thinking": "", "signature": "..."}` and has
-- done in every version this tool has seen, so the empty string is the real
-- reading. The token count beside it in `message.thinking_tokens` is the fact
-- worth showing there.
CREATE TABLE IF NOT EXISTS message_block (
  message_uuid TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  session_id   TEXT NOT NULL,
  role         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  ts           TEXT NOT NULL,
  tool_use_id  TEXT,
  tool_name    TEXT,
  content      TEXT NOT NULL,
  char_len     INTEGER NOT NULL,
  PRIMARY KEY (message_uuid, seq)
);
-- The trace page's only query: everything for one session, in order.
CREATE INDEX IF NOT EXISTS message_block_session ON message_block(session_id, ts, seq);
-- Partial: most rows carry no tool_use_id and nothing looks for them by one.
CREATE INDEX IF NOT EXISTS message_block_tool
  ON message_block(tool_use_id) WHERE tool_use_id IS NOT NULL;

-- One OTLP span. Inert until the traces half of exercise 01 is done.
--
-- KEY: (trace_id, span_id) - the span's own identity, and the one exception to
-- "ids are content hashes" in src/ingest/otlp/CLAUDE.md. A metric point has no
-- id of its own so one has to be made for it; a span arrives with one, and a
-- retried export re-sends the same one. `span_id` is only unique within a
-- trace, so both halves are in the key.
--
-- `duration_ms` is NULLABLE and is null whenever either timestamp was missing
-- or unusable. `nanosToIso` returns the epoch for input it cannot read, and an
-- epoch minus an epoch is a very convincing zero - so the subtraction happens
-- at the decoder, which returns null, rather than in a query here.
CREATE TABLE IF NOT EXISTS otel_span (
  trace_id       TEXT NOT NULL,
  span_id        TEXT NOT NULL,
  parent_span_id TEXT,
  name           TEXT NOT NULL,
  session_id     TEXT,
  tool_use_id    TEXT,
  request_id     TEXT,
  started_at     TEXT NOT NULL,
  ended_at       TEXT NOT NULL,
  duration_ms    INTEGER,
  status         TEXT,
  attrs_json     TEXT NOT NULL,
  PRIMARY KEY (trace_id, span_id)
);
CREATE INDEX IF NOT EXISTS otel_span_session ON otel_span(session_id, started_at);
CREATE INDEX IF NOT EXISTS otel_span_tool
  ON otel_span(tool_use_id) WHERE tool_use_id IS NOT NULL;
