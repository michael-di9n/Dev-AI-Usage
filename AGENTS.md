# Working in this repo

Read this before changing anything. It is short on purpose.

## What this project is

A local tool that reads Claude Code transcripts and Cursor history and works out
where AI spend and time went, over time. Pure observability and trend analysis:
it reports what happened and never grades it. Everything is derived data —
`data/usage.db` can be deleted and rebuilt in two seconds.

**With one exception.** `data/archive.db` holds compressed copies of the raw
transcripts, because Claude Code expires them on a schedule this tool does not
control. It is the only file here that is not derived, which is why it is a
separate file: "delete it and re-run" must stay safe advice for the other one.

## The rules that matter

**A missing number is never a zero.** If a source cannot answer something, the
UI renders an em dash and says which source would answer it. `$0.00` where there
is no data is the bug this project exists to avoid, and there is a UI check
asserting it.

**And a measured zero is never a missing number.** The rule above has a mirror
image, and it cost the Trends page its whole body once. A window with no
sessions in it is not a window we could not measure: you spent nothing, used no
skills and wrote no tokens, and every one of those is a figure whose value is
zero. Only two things stay dashes inside such a window, because they are still
genuinely unanswerable - a share with nothing in its denominator, and a change
against a period that was itself empty.

The test for which rule applies is whether a source was asked and answered.
Nothing imported at all is the absence: `onboarding().showGuide` catches it and
the getting-started guide replaces the page, which is what the empty-state UI
suite checks. Anything past that gate has a corpus behind it, so an empty
period is an answer. `SUM()` cannot tell the two apart - it returns null for a
window with no rows and for a window whose rows carry no price - so
`totalsWhere` decides on the message count, and `tests/habit-badges.test.ts`
pins both halves.

**Every finding carries its evidence.** A number with no `why` beside it is not
shippable here. Detectors expose an `explanation`; UI assertions expose a `why`.

**Rules are rule tables, not models.** Anything this tool concludes is computed
locally, from a table a reader can check. No model is asked anything, anywhere,
by any code path here — this tool observes, and observation does not need one.

**Cost is derived and labelled as such.** Never present it as a bill, and never
"reconcile" it against Claude Code's own figure — they count different messages
on purpose. See the comment on `costSecondOpinion`.

**Nothing leaves the machine.** The only outbound request in `src/` is the
read-only Anthropic Admin usage fetch in `src/ingest/analytics/`, which asks
your org for its own records and is skipped entirely without
`ANTHROPIC_ADMIN_KEY`. No transcript text, prompt, screenshot or metric is sent
anywhere. `tests/no-egress.test.ts` asserts it is the only one.

`src/analyze/Redactor.ts` is the gate for the next thing that sends text - it
currently has no caller, which is a property of there being no text egress, not
a sign it is unused. Route any new outbound string through it.

**A selection is remembered, on every tab.** Anything the reader chooses -
which project the AI maturity page is scanning, and whatever the next such
control turns out to be - survives leaving the tab and coming back. It is
stored in `app_state` (`src/app/readiness-key.ts` is the pattern: the key in
its own module, so a client component importing the write action does not drag
the database in behind it), and the control renders showing the stored value so
the box and the page can never name different things. Two corollaries: the
control sits above what it scopes, and changing it acts immediately - a
selection that needs a second click on a button called "Go" is a selection the
reader has already made twice. Nothing durable is written by looking at a page,
only by choosing on one.

**KISS, then SOLID, in that order.** The simplest rule a reader can check beats
a more accurate one they cannot. The AI maturity bands are the worked
example: they used to be a ladder per capability, two or three rungs each,
every rung honest arithmetic - and unreadable, because "silver" meant something
different in each of the eight cells and each had to print its own ceiling to
explain why. It is now one rule shape and one table of three numbers, shared
by seven of the eight: 1 instance is bronze, 2-3 silver, 4 or more gold. That
lost something real, and the response was to keep showing it on its own line
rather than to keep it inside the colour.

Hooks is the eighth, and the exception is worth reading as part of the same
rule rather than as a hole in it. Its unit is a matcher under an event, not a
file, and one of those is nearly free - so one of them was buying the band a
maintained CLAUDE.md gets, and it counts to 3, 6 and 8 instead. What had to
survive was the part that made the shared table readable: the shape is
identical everywhere - count instances, compare against three published
numbers - and every cell prints its own three, so checking a band never
requires knowing which table it came from. A second exception should be
argued for on those terms or not added.

SOLID here means the boring parts of it. One reason to change per module -
which is why the `SELECTED_REPO` key, the view that scans, and the action that
writes are three files. Depend on the narrow thing, not the module that
happens to hold it. A new rule is a new class in a registry and nothing else
edited. If a change means touching a switch in four files, the abstraction is
wrong; if it means a new interface for one caller, so is the abstraction.

## Layout

| Path | Rule |
|---|---|
| `src/domain/` | Pure. No I/O, no clock, no database. |
| `src/ingest/` | One class per source, all implementing `IngestSource`. |
| `src/analyze/` | The finding contract, and `Redactor` — the gate every egress passes. Rules take a loaded context, return findings, write nothing. |
| `src/db/` | `Database.ts` is the only file that touches the driver. Reads and writes are separate repositories. Two schemas: `schema.sql` is derived and disposable, `archive-schema.sql` is not. |
| `src/observability/` | Optional module. Deleting it must cost one import and one line. |
| `src/ui-testing/` | Optional module. Same rule. |

## Adding things

**A rule** — new class implementing `Detector<TContext>`, add to that family's
registry. `Detector` is generic in its context on purpose: contexts differ by
family and always will. Nothing else changes.

**A data source** — implement `IngestSource`, add to the list in
`src/Application.ts`. `unavailableReason()` returns a sentence, not a boolean.

**Anything time-bucketed** — period bounds come from `windowOf` in
`src/domain/period.ts`, which is pure and takes the clock as an argument. They
are the reader's LOCAL calendar boundaries, returned as instants so the query
binds them as parameters and the index on `message(ts)` still applies. Do not
put `date('now')` back into the SQL: it is UTC, and on UTC+10 that moves every
"today" by ten hours. Bucket keys are the one thing that must convert in SQL,
because they are per-row.

**A UI check** — add a `UiCheck` to `src/ui-testing/checks.ts`. Every assertion
needs a `why` that names the harm.

**Anything that writes** — the dashboard imports on a timer now, so the server
is a writer and so is anyone running `npm run run`. Two writers are normal
here; `Database.ts` sets `busy_timeout` so the second waits rather than failing.
Keep new write paths inside `db.transaction`, and keep them idempotent.

## Before you say it works

```bash
npm run typecheck
npm test
npm run run                  # against the real corpus, twice - second must be fast
npm run archive -- --verify  # every archived chunk still decompresses and matches
npm run dev                  # then, in another terminal:
npm run ui-test              # every page, light and dark, phone width

# The fresh-clone state needs a server with nothing to read and nothing that
# would go and fetch some: a scratch database, and importing switched off. The
# background import will otherwise fill that database before the first check
# runs, and every empty-state assertion fails for the wrong reason.
DEV_AI_USAGE_DB=/tmp/empty.db DEV_AI_USAGE_ARCHIVE=off \
  DEV_AI_USAGE_SYNC_SECONDS=off npm run dev
npm run ui-test -- --empty
```

Numbers in the docs (test counts, timings, measured percentages) are asserted by
`tests/docs.test.ts` or stated as measurements. If you change behaviour that
moves one, update the doc in the same commit.

## Three traps

**`CLAUDE_CONFIG_DIR`.** If it is set, `~/.claude/` usually also exists and is
never read. Writing there fails silently. `src/config.ts:resolveClaudeProjectsDir`
gets the order right — do not "simplify" it.

**`CREATE TABLE IF NOT EXISTS` keeps a stale shape.** Change a column in
`schema.sql` and an existing `data/usage.db` silently keeps the old table. It
fails later, mid-ingest, as `table X has no column named Y`, which reads like a
code bug. The database is derived — delete it and re-run rather than hunting.

**The archive is not derived.** The advice above — delete the database and
re-run — is correct for `data/usage.db` and destructive for `data/archive.db`.
Prove a change to it with `npm run archive -- --verify`, which decompresses
every chunk and checks it against the hash stored beside it.

**`cost-state` is not ground truth.** It resets on resume, skips subagents, and
its `inputTokens` is not the sum of the per-message counts beside it. Do not
build a validation on it. The price table is validated by `tests/cost.test.ts`
against a session whose arithmetic closes exactly.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
