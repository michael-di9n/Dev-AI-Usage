# src/domain — the shared vocabulary

Pure. No I/O, no clock, no database, no framework types. Parsers, detectors and
the UI all depend on this directory so they do not have to depend on each other.
If something here needs to read a file or know the time, it belongs elsewhere.

| File | Role |
|---|---|
| `types.ts` | The row and value shapes every layer passes around. |
| `Normalizer.ts` | The single definition of "the same work". |
| `PriceTable.ts` | Model id → rates, and tokens → dollars. |

## types.ts

Field names deliberately mirror the wire format (`cacheCreate5mTokens`,
`stop_reason`) so a reader can diff a row against a raw transcript without a
translation table. Resist tidying them into house style.

Two shapes encode a constraint rather than data:

- **`costUsdDerived: number | null`** — null means the model was absent from the
  price table. Callers must surface that. Nothing downstream may treat it as 0.
- **`ToolResultPatch`** — a tool result travels as a patch keyed by
  `toolUseId`, not merged into the call, because incremental ingest may read the
  two halves in different passes. See `src/ingest/claude-code/CLAUDE.md`.

`ParsedTranscript` is the one value object a transcript file yields; it exists so
the parser can stay pure and hand back everything at once.

## Normalizer.ts

Repetition is invisible in raw text — the same typecheck run appears under a
dozen spellings because the cwd, a `tail` count and a port all vary. Anything
that has to compare work across sessions routes through here, so "the same work"
has exactly one definition and changing it changes every comparison at once.

The rules and why each is drawn where it is:

- Strip a leading `cd … &&` — the directory is not part of the command.
- Absolute paths → `<path>`.
- **Runs of two or more digits** → `<n>`. Two, not one, so `python3` survives
  while `tail -20`, `--port 4319` and `since=1785723357261` collapse together.
  Losing the exact number is free; clustering only needs shapes to match.
- `hash()` returns 16 chars. These are index keys, not signatures.

`languageFromPath` is a plain extension lookup, defaulting to `OTHER_LANGUAGE`
rather than guessing.

## PriceTable.ts

`canonicalise()` exists because Claude Code decorates model ids in its own
records — `claude-opus-5[1m]` for a context variant, `claude-haiku-4-5-20251001`
for a dated snapshot. Those are presentation, not distinct price points, so
strip them before lookup instead of duplicating rows in `prices/models.json`.

`ratesFor()` returns **null** for an unknown model, and `CostCalculator.costOf()`
propagates that null all the way to the UI. Adding a `?? 0` anywhere on that path
is how `$0.00` gets shipped for a model nobody has priced yet. If a new model id
shows up unpriced, the fix is a row in `prices/models.json`, not a default.

`CostCalculator` is split from `PriceTable` so the arithmetic can be tested
against real `cost-state` rows without constructing a price file.
