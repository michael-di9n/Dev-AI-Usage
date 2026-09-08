# src/ingest — getting data in

One class per source, all implementing `IngestSource`. Everything here writes
through `IngestRepository`; nothing here answers questions.

| File / dir | Role |
|---|---|
| `Source.ts` | The contract, plus the `ok` / `skipped` / `failed` result helpers. |
| `IngestRunner.ts` | Runs every source in order, isolating failures. |
| `claude-code/` | Transcripts. The primary source. |
| `cursor/` | Cursor's local accept/suggest and per-commit attribution. |
| `hooks/` | Drains the hook spool into per-tool wall-clock duration. |
| `otlp/` | Receives OpenTelemetry from Claude Code. |
| `analytics/` | Claude Code Analytics API. Needs an org admin key. |

## unavailableReason() returns a sentence, not a boolean

This is the rule the whole directory turns on. A source that cannot answer a
metric must never look like a source that answered "none". So an unconfigured
source returns *why*, phrased for a human and naming the fix:

> `No hook spool yet. Complete exercises/02-register-hooks.md to record per-tool duration.`

That string is what the setup page renders and what stops a missing source from
becoming a zero. `IngestRunner.describe()` collects them without collecting any
data, so readiness can be shown before anything runs.

## Failure is per-source and expected

`runAll()` try/catches each source separately. Most developers cannot get an
admin key, and Cursor may not be installed at all — both are normal states, not
errors, and neither may cost the other sources their data. A source that throws
becomes a `failed` result and the run continues.

## Adding a source

Implement `IngestSource`, add it to the list in `src/Application.ts`. Nothing
else changes. Return `skipped()` when unconfigured, `ok(detail, rows)` with a
line a human can act on, and let `IngestRunner` catch what throws.

Two things to get right:

- **Emit no metric you cannot actually measure.** `CursorSource` deliberately
  produces no tokens and no cost, because Cursor stores `tokenCount` as `{0, 0}`
  on disk and the real figures live behind a team API. A zero there would read as
  "Cursor was free". Leave the column absent and let the UI render an em dash.
- **Make re-ingest cheap and idempotent.** Natural keys plus a cursor in
  `ingest_cursor`; see `claude-code/CLAUDE.md` for the byte-offset pattern and
  `otlp/CLAUDE.md` for the content-hash one.

## Two sources are pushed to, not pulled from

`otlp/` and `hooks/` receive data that arrives on someone else's schedule — an
OTLP export over HTTP, a hook firing mid-session. Both are enabled by the
exercises in `exercises/` and both are inert until then, which is why their
`unavailableReason` points at the exercise by filename.
