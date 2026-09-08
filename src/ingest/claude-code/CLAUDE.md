# src/ingest/claude-code — transcripts

The primary source: append-only `.jsonl` files under
`CLAUDE_CONFIG_DIR/projects`, running to hundreds of megabytes in practice. The
skip logic below is what lets the whole corpus be re-checked on every run
instead of on demand (`npm run run` twice — the second is near-instant).

| File | Role |
|---|---|
| `TranscriptScanner.ts` | Finds `.jsonl` files; reads lines from a byte offset. |
| `TranscriptParser.ts` | Lines → rows. Pure. |
| `ClaudeCodeSource.ts` | Wires the two together and drives the skip logic. |

## The two-level skip is why this is fast

1. Unchanged `size` **and** `mtimeMs` versus `ingest_cursor` → the file is never
   opened.
2. A grown file is read over `[bytesConsumed, size)` → only the appended range
   is parsed, and only the range that was stat'd, because the writer is still
   appending and EOF moves while we read.

A **shrunk** file was rotated or rewritten, so the offset would now point into
the middle of a different record; that case restarts from 0.

## The cursor stops at the last complete line, not at the file's size

`bytesConsumed` is the offset just past the last **newline** consumed, which
`readLinesFrom` reports alongside each line. That is the difference between a
half-written record being re-read and being lost.

The corpus is appended to while we read it, so a pass routinely lands mid-line.
That torn line is still yielded and still fails `JSON.parse` — it increments
`malformedLines` and is dropped, which is normal — but the cursor stays at its
first byte, so the next pass reads the record whole once the writer has
finished it.

Storing `file.size` instead is what this used to do, and it lost the record
permanently: the next pass began inside the JSON and read the remainder as
garbage, so no pass ever saw it. Nothing surfaced it either, because a dropped
line is indistinguishable from the partial tail that is genuinely expected
here. `tests/ingest.test.ts` pins all three edges — the torn line, a final line
that never gets a newline, and not mistaking a short cursor for a shrunk file.

Each file is written inside one `db.transaction()`, so a crash cannot commit a
byte offset ahead of the rows it covers.

## The parser is pure, and that is the point

No filesystem, no clock, no database. The transcript format is the one input
this project does not control, so every field-mapping decision is pinned by
fixture tests rather than discovered against a live corpus. Keep it that way:
if you need a path or a timestamp, pass it in.

Everything read out of a record goes through the defensive `str` / `num` /
`obj` / `arr` helpers at the bottom. An unexpected field never throws.

## Record types and the judgement calls in each

**`assistant`** — one `MessageRow` plus a `ToolCallRow` per `tool_use` block.
Cost is derived here via `CostCalculator` and stays null for an unpriced model.

`readUsage()` splits cache creation by TTL. Older records carry only the total,
so the remainder after subtracting the 1h figure is attributed to the **5m**
rate — the cheaper of the two, so an unknown split never overstates cost.

**Tool input normalisation is asymmetric on purpose.** `Bash` is compared by
command *shape*, so paths and numbers collapse through the `Normalizer`. For a
file path or a search pattern the exact value *is* the identity — collapsing it
would make two different files look like one file read twice — so targets pass
through untouched.

Edit-shaped tools (`Edit`, `Write`, `MultiEdit`, `NotebookEdit`) also emit an
`EditRow` **sharing the tool_use id**, so a single result patch reaches both
rows and sets `decision` to accepted or rejected.

**`user`** — either tool results or a prompt, never both. A record with a
`toolUseResult`, or with `isMeta`, is not something a person typed.

`isRejection()` matches only the **start** of a result, after dropping a leading
`[`, because the same words appearing inside a file that was read must not count
as a rejection. It is also applied to prompt text: Claude Code writes its
interrupt notice into a user record, and counting it clusters "you interrupted
the model" as an instruction you keep repeating.

**`system`** — only `subtype: "turn_duration"` is kept, as a `TurnRow`. It is
the one row here with no uuid to dedupe on, which matters because **resuming a
session replays it**: Claude Code writes a new transcript under a new session
id and copies the earlier records into it, rewriting `sessionId` on every copy
while keeping the original `uuid`. Nothing is spent twice, so nothing may be
counted twice — `message`, `tool_call`, `edit` and `prompt` get that free from
their uuid keys, and `turn` gets it from `PRIMARY KEY (ts, duration_ms)`. See
the comment on the table in `schema.sql`.

**`cost-state`** — Claude Code's own tally, stored in `session_cost_report`.
Read the warnings in `AGENTS.md` and on `QueryRepository.costSecondOpinion`
before building anything on it: it resets on resume, skips subagents, and its
`inputTokens` is measurably not the sum of the per-message counts beside it.
It is a second opinion, never a validation target.

## Block capture is the one place text is kept

Everything else here counts things. `captureBlock` keeps the text of each
content block in `message_block`, because `input_norm` beside it is
deliberately lossy - it collapses paths and numbers so two calls can be
compared - and the Trace page has to show what was really sent.

Three things to know before changing it:

- **`seq` counts every block**, including kinds nothing is captured for. It is
  half of the primary key, so a row's identity must not move if the capture
  rules change later.
- **`charLen` is always the true length**, before the cap. `charLen >
  content.length` means truncated; `charLen === 0` with empty content means
  measured-empty. Two facts, no ambiguous third state.
- **Thinking is always empty.** Claude Code writes `{"thinking": "",
  "signature": "..."}` - 4,858 blocks measured across versions 2.1.126 to
  2.1.261, not one with a character in it. The row is kept anyway so the page
  can show `thinking_tokens` beside an honest "not recorded"; a skipped row
  could not say that. If a future version starts writing the text, this is
  where it will start arriving, and nothing needs to change to receive it.

`blockChars` is `null` when `DEV_AI_USAGE_TRACE_CHARS=off`, and then no block
rows are produced at all - a switch, not a filter over text already on disk.

## Results arrive later than calls

`ToolResultPatch` exists because a `tool_result` lands many lines after its
`tool_use`, and incremental ingest may read the two halves in different passes —
possibly minutes apart. So the parser never merges them; it emits a patch keyed
by `toolUseId` and `IngestRepository.applyToolResult` UPDATEs by id. Tool
*duration* arrives later still, from the hook spool, and patches the same row.
