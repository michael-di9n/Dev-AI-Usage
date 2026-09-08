# src/db — storage

SQLite, derived. `data/usage.db` can be deleted at any time and rebuilt from the
sources in two seconds; nothing in here is authoritative for anything.

| File | Role |
|---|---|
| `Database.ts` | The only file that touches the driver. |
| `schema.sql` | Every table, applied as one idempotent script. |
| `IngestRepository.ts` | Every write. |
| `QueryRepository.ts` | Every read. |

## The driver is confined to one file

`Db` wraps `node:sqlite`, chosen over `better-sqlite3` so the project has no
native build step. That API is still flagged experimental, which is exactly why
nothing else imports it: swapping drivers means rewriting `Database.ts` and
touching no other file. Keep it that way — no `DatabaseSync` import outside this
directory except `ingest/cursor/CursorSource.ts`, which opens Cursor's *own*
databases read-only and has nothing to do with ours.

`Db.transaction()` is all-or-nothing. Ingest wraps one source file per
transaction so a crash mid-file cannot commit a byte offset that runs ahead of
the rows it claims to cover.

## Writes are idempotent by construction, not by convention

Every table that can be re-derived uses a **natural primary key taken from the
source** — the transcript's own uuid, the tool_use id, a content hash for OTLP.
So re-ingesting the same bytes is `INSERT OR IGNORE` doing nothing, and no
caller ever has to ask "have I seen this already". A new table follows the same
rule: if you find yourself wanting a dedupe pass, the key is wrong.

**The key must identify the fact, not the session that reported it.** Resuming
a session writes a new transcript under a new session id and copies the earlier
records into it, rewriting `sessionId` on every copy while keeping the original
`uuid`. Anything keyed on the session id is therefore keyed on something the
source rewrites, and the replay inserts again — which `turn` did, for 54
surplus rows and 4.77 hours of wall-clock time, until it was keyed on
`(ts, duration_ms)` instead. A resume costs nothing, so it must count nothing.

Three deliberate exceptions, each with a reason in the code:

- `session` upserts, because a session spans many appends and later reads carry
  the fuller picture (widen `started_at`/`ended_at`, fill nulls).
- `session_cost_report` replaces, because Claude Code rewrites the record as a
  session progresses — keep the latest.
- `applyToolResult` and `setToolDuration` **UPDATE**, because the two halves of
  one fact arrive in different passes. A tool result lands many lines after its
  `tool_use`; a hook duration lands after the transcript row exists at all. Both
  patch by id rather than inserting.

`signal` is rule output and is fully re-derived each run — `clearSignals(kinds)`
truncates a family's rows before its pass, scoped by kind so one family cannot
wipe another's findings. It carries no measure column of its own on purpose:
what is worth counting differs per family, so it goes in `evidence_json` rather
than as a column most rows would leave at zero.

## Reads and writes are separate on purpose

The UI adds questions far more often than ingest adds tables, so the two
repositories change independently. `QueryRepository` returns camelCase view
models, not rows; the snake_case column names stop at this boundary.

**Never coalesce a null to zero on the way out.** `costUsd: r.cost_usd === null ?
null : Number(...)` is load-bearing — `Number(null)` is `0`, and a `$0.00` where
there is no data is the bug this project exists to avoid. `Number(r.x ?? 0)` is
correct for a `COUNT`, which genuinely is zero when nothing matched, and wrong
for anything derived from a price.

## costSecondOpinion is not a reconciliation

Read the comment on it before touching it. Derived cost and Claude Code's
`cost-state` count different messages on purpose, and a large gap between them
is expected, not a pricing error. Do not turn it into a check, do not let one
overwrite the other, and do not render the difference as a discrepancy. The
price table is validated elsewhere — `tests/cost.test.ts`, against a recorded
session whose arithmetic closes exactly.
