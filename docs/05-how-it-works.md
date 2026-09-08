# 5. How it works

For when you want to change something, or trust it more.

---

## The shape

```
src/
  domain/         types, prices, cost, text normalisation   (pure, no I/O)
  ingest/         one class per data source, one interface
  analyze/        the finding contract, and the redactor every egress passes
  db/             schema, one driver wrapper, separate read/write repositories
  onboarding/     what should this developer do next
  observability/  optional, removable module
  ui-testing/     optional, removable module
  app/            the dashboard, the telemetry receiver, and the settings scan
```

The rule throughout: anything that makes a decision takes its collaborators as
constructor arguments. That is why the transcript parser and every data source
can be tested without a database, a filesystem, or a network.

---

## Where the data comes from

**Claude Code transcripts** — `$CLAUDE_CONFIG_DIR/projects/**/*.jsonl`, one file
per session, append-only. Everything comes from here: per-message tokens, model,
tool calls, prompts, turn durations.

**Cursor** — two SQLite files, opened read-only so a running Cursor is not a
problem. Gives per-commit AI-vs-human line counts and daily accept rates. Gives
no token counts, because Cursor does not store any.

**The hook** (optional) — the only source of per-tool wall-clock time.

**OpenTelemetry** (optional) — the only source of real active time and
per-API-request latency.

**Analytics API** (optional) — the only authoritative cost, and the only source
of whether AI output survived into a commit.

---

## Four decisions worth knowing

### Imports are incremental by byte offset

Transcripts only ever grow. For each file we store its size, modification time,
and how many bytes we have read. Unchanged files are never opened; grown files are
read from where we stopped.

Every row's primary key comes from the source data itself — a message is keyed by
the transcript's own UUID — so importing the same bytes twice writes nothing. It
is idempotent by construction, not by remembering to check.

That is the difference between a 250 MB history importing in 1.8 seconds cold and
0.01 seconds warm, which is what makes it reasonable to run on a timer.

### A source only contributes what it can answer

Every source implements `unavailableReason()`, which returns a *sentence*, not a
boolean. So a source that is not set up explains itself on the Setup page instead
of rendering a zero that looks like a finding.

This is why Cursor's cost cells are em dashes and not `$0.00`. A zero is a claim.

### Rules are rule tables, not models

Anything this tool concludes is computed locally, from a table a reader can
check. Deliberately:

- Nobody acts on "the model said so".
- The same input must give the same answer every run.
- It has to work with every AI feature switched off.

No model is asked anything by any code path here. There is nothing to switch
off, because there is nothing switched on.

### The palette is one CSS block

There is one theme, Tide, declared once using CSS `light-dark()`:

```css
:root {
  --ground: light-dark(#f5f8fb, #0d151d);
  --text:   light-dark(#16222e, #e6eef6);
}
```

The light value applies when the viewer's system is light, the dark value when
it is dark. So there is no media query, no duplicated dark block, and the
palette cannot end up half-defined. Pinning a mode works by setting
`color-scheme: only light` or `only dark` on the root, which is what makes
`light-dark()` resolve one way regardless of the system setting.

`tests/styles.test.ts` parses those pairs back out and recomputes the contrast
of all fourteen on-screen combinations, in both modes. It also asserts that no
`data-theme` selector exists, because a second palette block is how "one theme"
quietly stops being true.

### `node:sqlite`, not `better-sqlite3`

No native build step, so `npm install` cannot fail on a compiler. Its API is
still marked experimental, so every use of it is inside
`src/db/Database.ts` — changing drivers means rewriting one file.

---

## Adding things

### A new rule

One class, one file, one line in that family's registry:

```ts
export class MyRule implements Detector<MyContext> {
  readonly kind = "my_rule";
  readonly explanation = "One sentence the dashboard shows beside the number.";

  detect(ctx: MyContext): Signal[] { /* ... */ }
}
```

`Detector` is generic in its context because the contexts differ by family, and
always will — a project rule reads a filesystem scan, a usage rule reads
transcript facts. What every rule owes the reader is the same: a `kind`, an
`explanation`, and signals carrying their own evidence. Rules receive a loaded
context and return findings. They never query or write, which is what keeps
them testable from a literal.

### A new data source

Implement `IngestSource` (`id`, `label`, `unavailableReason`, `ingest`) and add it
to the list in `src/Application.ts`. The runner isolates failures, and the Setup
page and `doctor` pick it up for free.

### A new UI check

Add a `UiCheck` to `src/ui-testing/checks.ts`. Every assertion needs a `why` — a
test that fails with "expected true, got false" tells you nothing about what the
user lost.

---

## The two optional modules

Both are folders you can delete.

**`src/observability/`** — everything that reports talks to an `Emitter`
interface with one method, whose default is a no-op. Attaching is one call:

```ts
const observability = attachObservability(config);
await observability.emitter.emit(event("run.finished", { costUsd: 42 }));
```

An observer that throws is caught and logged; telemetry never fails the run it is
measuring.

**`src/ui-testing/`** — drives the pages in the Chrome already installed
(`channel: "chrome"` via `playwright-core`), so there is no browser download and
no CI image change. Every check is measured in the page — contrast, overflow,
font size, a missing heading, a zero where there is no answer — so the suite
needs no credential and makes no network call.

---

## Tests

```bash
npm test
npm run typecheck
```

They pin the things that would otherwise be found the hard way:

- Transcript field mapping, and cache-TTL pricing against a real recorded session.
- The exact rejection phrasings, *and* the guard that stops those words firing
  when they appear inside a file that was read.
- Incremental import, including a file that shrank.
- OpenTelemetry decoding and its de-duplication.
- The redaction contract, asserted against a credential-shaped fixture.
- The contrast maths, checked against colours whose ratios are known.
- The two real API calls, driven through the actual SDK with a stubbed
  transport, so a wrong parameter name cannot reach a user.

---

## Next

[6. Optional extras →](../exercises/README.md)
