# Dev AI Usage

Find out where your AI coding spend and time actually go, and what you keep doing
by hand that a script or a CI job should be doing.

It reads files Claude Code already writes on your machine. **No API key needed,
nothing leaves your computer, and the first import takes about two seconds.**

```bash
npm install
npm run run      # import, analyse, and tell you what happened
npm run dev      # open http://localhost:3000
```

That is the whole setup. If something goes wrong, `npm run doctor` tells you what
and how to fix it.

---

## What you get

Trends carries a usage band under the cost figure — power on gold, medium on
silver, low on bronze, from output tokens per active day over a fixed 30-day
window, with the figure and the thresholds in its tooltip. A local heuristic,
not an Anthropic tier, and an em dash only when there is no active day to
divide by. Beside it sit the two other readings of the same setup — how much of
Claude Code the selected repository configures, and whether this machine can
record an in-depth trace — each with the count its word was read off and a line
saying what it measures. Three questions of the same shape, in one place, so a
reader who never opens the other tabs still knows they have an answer.

**Trends** — what you spent, on which projects, using which models. Pick today,
this week, this month or the last three months; today buckets by hour, the
longer windows by day, week or month. Every boundary is your local one, so
"today" is your today rather than UTC's. Cost is worked out from published
prices, so it is an estimate, not a bill — shown as a figure and, beside it, as
a stack of $100 coins, because a pile you can count has a size that $2,463.11
does not.

**Observability** — whether Claude Code is configured to tell this
machine enough for an in-depth trace, in one screen. The requirements are drawn
as a pipe, each one a vessel that fills as it is set — part-full in the fault
colour for a setting that is present but breaks something — with its name and
state written underneath, and a wrong one naming the value that broke it. The
water stops at the first one that is not set. Where it stops is the answer to
"what do I do next" without reading a single fix. The terminus is the trace
itself, and it lights once the two gating tiers — events and metrics, then
spans — are unbroken. Tool wall-clock hangs off the line as a branch rather than
sitting in it, because the PostToolUse hook times tools whether or not
OpenTelemetry is on. Works on a fresh clone.

Click a vessel and a scroll unrolls at the foot of the diagram carrying what
that setting is for, what it was found set to and in which file, the exact line
to add and where, what the tier buys, and how much has arrived because of it.
One opens at a time and the open one is in the address bar, so a node can be
linked to. This is where the Telemetry and Hooks tabs went: they held the same
advice a page away from the diagram that found the gap. Every value is read from
the settings files actually in force — `$CLAUDE_CONFIG_DIR/settings.json` or
`~/.claude/settings.json`, then the project's `.claude/settings.json` and
`.claude/settings.local.json` — and reported as set, not set, or set to a value
that breaks something.

Four content settings — prompt text, reply text, tool arguments, tool output —
hang off the run as a second branch, never counted and off by default. On this
machine the transcript already carries all of it; pointed at an agent on another
machine they are the only record of what was said, because the receiver accepts
OTLP from any host and a session with no local transcript arrives redacted.

The last line of each panel is what has actually arrived because of that one
setting. Settings and arrivals are two questions and the page keeps them apart:
OpenTelemetry reads its variables at launch and never backfills, so a machine
configured correctly a minute ago is right and silent until the next session
starts.

**Trace** — one project's runs, and any one of them step by step. A project
picker scopes the page, sharing the same stored choice as AI maturity and
Observability. Recorded runs list down the left under four sortable columns — trace
id, ended, cost and tools — with the Ended heading carrying a date filter
(presets, or an exact range) and the count above the rows naming it whenever it
is on — the last two banded into one, two or
three countable marks against thresholds you can change from the heading, with
an em dash for a run nothing could price and no marks at all for one that
genuinely cost nothing. The run itself draws as a nested tree on a terminal
surface — the prompt, each model turn, every tool call with the arguments it was
really given, and what came back — under a bar showing where its money went and,
beneath it, the chips that read the bar: the total, then input, cache read,
cache write and output, each priced on its own so the parts add up to the total,
each with its own glyph tinted to match its segment. **Export JSON** writes the
whole run as one structured document, under a format name and a version, with
unmeasured durations left null rather than rounded to zero. Why durations are
dashed, why thinking rows carry no text and why long bodies are cut are in
[reading the dashboard](./docs/02-reading-the-dashboard.md).

**Telemetry** — everything Claude Code exports over OpenTelemetry, as it
arrives, in a live feed. The receiver runs inside this app, so there is no
collector to install.

**Hooks** — per-tool wall-clock, which exists nowhere else on the machine, plus
every hook event Claude Code fires. Says plainly which of its numbers need the
hooks registered and which come from the transcript anyway.

**AI maturity** — how much of Claude Code a repository actually configures,
read from its files. Works on a fresh clone, before anything is imported. Pick
the project at the top and it scans as you change it; the choice is remembered
between visits. Each of the eight capabilities gets three chevrons under one
rule printed beside them — one instance is bronze, two or three silver, four or
more gold — and the cell states the count it was banded on. Hooks is the one
exception, and its cell says so: a handler there is one matcher under one
event rather than a file, one of them is nearly free, so it counts to 3, 6 and
8. Memory and rules are looked for in subdirectories as well as at the root,
because that is where a monorepo keeps the instructions that govern a
package.

**Setup** — the back of the machine, drawn as one panel. Dials for what the
archive is holding, with the bands they were read off printed beside them and
the exact figure in the window under each. A lamp per source, and under any
dark one the reason and the file that turns it on: an unconfigured source reads
as off, never as broken. A dial with no pointer has not been measured, which is
a different thing from a dial pointing at none.

**It keeps itself current.** While `npm run dev` is running the dashboard
re-imports every 15 minutes, and the Trends page says how old its figures are
next to them — `imported 4 minutes ago`. A figure nobody can tell is stale is
worse than an obviously empty page, because the stale one gets acted on.
`DEV_AI_USAGE_SYNC_SECONDS` changes the interval; `off` stops it importing at
all, startup included.

**The archive** — Claude Code expires its own transcripts on a schedule this
tool does not control. Everything else here stores a parse of them; the archive
stores the bytes, compressed, in a separate database, so a question nobody has
thought to ask yet can still be asked next year. It runs when the dashboard
starts and on every import. Measured on a 151MB corpus it stores 38.6MB, about
3.9x smaller, and grows by roughly a megabyte a day of heavy use. Turn it off
with `DEV_AI_USAGE_ARCHIVE=off` if you would rather not spend the disk.

The tool observes and trends. It does not grade you, and it has no opinion about
what you should have done differently.

---

## Learning path

Read these in order. Each one takes a few minutes and stands on its own.

| | Guide | You will be able to |
|---|---|---|
| 1 | [Your first run](docs/01-first-run.md) | Get numbers on screen and know they are right |
| 2 | [Reading the dashboard](docs/02-reading-the-dashboard.md) | Say what every number means, and which ones to ignore |
| 3 | [Acting on a trend](docs/03-acting-on-trends.md) | Turn a number that moved into a change you actually make |
| 4 | [When something is wrong](docs/04-troubleshooting.md) | Fix it yourself instead of guessing |
| 5 | [How it works](docs/05-how-it-works.md) | Change the code, or trust it more |
| 6 | [Optional extras](exercises/README.md) | Add per-tool timing, live telemetry, and a reviewer in CI |

---

## Commands

| Command | What it does |
|---|---|
| `npm run run` | Import and summarise. **The one to use day to day.** |
| `npm run dev` | Start the dashboard on port 3000 |
| `npm run doctor` | Check every part and say what to fix |
| `npm run report` | The same totals, printed in the terminal (`npm run report week`) |
| `npm run ingest` | Import only |
| `npm run archive` | Snapshot every transcript, and say what is held. `-- --verify` reads it all back; `-- --restore <dir>` writes the files out again |
| `npm test` | The full suite: unit, integration, docs, and API wiring |
| `npm run ui-test` | Check the dashboard in a real browser, light and dark (needs `npm run dev` running) |

---

## Configuration

**Nothing here is required.** Every variable has a default that works on a fresh
clone, and the app states which source answered a figure rather than guessing.
Set them in your shell, or in `.env.local`.

This app's own, all optional:

| Variable | Default | What it does |
|---|---|---|
| `DEV_AI_USAGE_DB` | `data/usage.db` | The derived database. Delete it and re-run at any time. |
| `DEV_AI_USAGE_ARCHIVE` | `on` | `off` stops archiving transcripts. The archive is the one file here that is not derived. |
| `DEV_AI_USAGE_ARCHIVE_DB` | `data/archive.db` | Where that archive lives. |
| `DEV_AI_USAGE_SYNC_SECONDS` | `900` | How often a running dashboard re-imports. `off` disables importing entirely, the startup pass included. Capped at a day. |
| `DEV_AI_USAGE_TRACE_CHARS` | `2000` | Characters kept per content block for the Trace page. `off` keeps none, and the page then says so. Capped at 20000. |
| `DEV_AI_USAGE_DEVELOPER_ID` | `$USER` | The name imported rows are attributed to. |
| `DEV_AI_USAGE_PRICES` | `prices/models.json` | The price table derived cost is computed from. |
| `DEV_AI_USAGE_SPOOL` | `data/spool.jsonl` | Where the hooks from [exercise 02](exercises/02-register-hooks.md) write before they are imported. |
| `DEV_AI_USAGE_OBSERVABILITY` | `on` | `off` stops the run-history module writing anything. |
| `DEV_AI_USAGE_OBSERVABILITY_DIR` | `data/observability` | Where that history goes. |
| `DEV_AI_USAGE_UI_SCREENSHOTS` | `data/ui-tests` | Where a failed UI check writes its screenshot. |

Other people's, read but never written:

| Variable | Default | What it does |
|---|---|---|
| `CLAUDE_CONFIG_DIR` | unset | Claude Code's own. If it is set, transcripts are read from `$CLAUDE_CONFIG_DIR/projects` and `~/.claude` is ignored — see the trap in [AGENTS.md](AGENTS.md). |
| `CLAUDE_CODE_PROJECTS_DIR` | unset | Points straight at a projects directory, overriding both. |
| `CURSOR_TRACKING_DB` | `~/.cursor/ai-tracking/ai-code-tracking.db` | Cursor's edit history. |
| `CURSOR_STATE_DB` | `~/.config/Cursor/User/globalStorage/state.vscdb` | Cursor's chat state. |
| `ANTHROPIC_ADMIN_KEY` | unset | Read-only Admin API key. Absent, the Analytics panels read "not configured" rather than zero. |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Where that one read-only request goes. |

The telemetry variables are Claude Code's, not this app's, and they are
documented per variable in [exercise 01](exercises/01-enable-otel.md).

---

## Two modules you can take or leave

Both are self-contained folders. Each has one entry point, works without an API
key, and can be deleted without touching the rest of the app.

**Observability** (`src/observability/`) records every run to
`data/observability/events.jsonl` — what ran, how long it took, how many rows
landed. It needs no credential and reaches no model: it writes down what
happened and stops there, because reading anything into those numbers is a job
for a person.

Hooking it in is one call:

```ts
const observability = attachObservability(config);
await observability.emitter.emit(event("run.finished", { costUsd: 42 }));
```

Everything that reports talks to an `Emitter` interface whose default is a no-op,
so removing the module costs one import and one line.

**UI testing** (`src/ui-testing/`) drives the real dashboard in the Chrome you
already have installed — no browser download. It checks contrast, text size,
sideways scrolling, headings, link labels, and that the empty state never shows a
made-up zero. Every check is measured in the browser — no key, no model, no
network call.

```bash
npm run dev                                    # in one terminal
npm run ui-test                                # in another
npm run ui-test -- --url http://localhost:3005 # a different port

# The fresh-clone checks need a server with nothing to read, and nothing that
# would go and fetch some:
DEV_AI_USAGE_DB=/tmp/empty.db DEV_AI_USAGE_ARCHIVE=off \
  DEV_AI_USAGE_SYNC_SECONDS=off npm run dev
npm run ui-test -- --empty
```

Every check explains the harm when it fails, not just that it failed:

```
 FAIL  Trends (light) [desktop]
         text contrast is at least 4.5:1
           found: worst contrast 3.63:1 on "warn"
           why it matters: Below 4.5:1 body text fails WCAG AA and is hard to read in daylight.
```
---

## What it will not tell you

Being straight about this matters more than filling every cell.

**Cursor spend is unknowable from your machine.** Every message Cursor saves
locally records `tokenCount: {0, 0}`; the real numbers only exist behind its team
API. So Cursor contributes how often you accepted its suggestions and how many
lines of each commit were AI-written — and nothing about cost. Those cells show
`—`, never `$0.00`.

**Cost is an estimate.** Tokens times published prices. The price table is pinned
by tests against a real recorded session whose arithmetic works out exactly, but
it is list price, not an invoice.

**Claude Code's own cost figure is not a check on ours.** It resets when you
resume a session and covers only the main thread. Its input-token count is
provably not the sum of the per-message counts sitting next to it. The dashboard
shows both figures and says they count different things.

**Some things only start counting once you set them up.** Per-tool timing and
live telemetry cannot look backwards. Their trends begin the day you finish
[exercise 01](exercises/01-enable-otel.md) or [02](exercises/02-register-hooks.md).

**A number is not a judgement.** A day that cost more than the last one might
have shipped more. There is no score and no leaderboard here — just what
happened, with enough context to tell whether it matters.

---

## Keeping it current

The dashboard imports on its own **while it is running** — once at startup and
then every `DEV_AI_USAGE_SYNC_SECONDS` (900 by default; `off` disables both).
Nothing to install, and nothing left behind when you stop it. The Trends page states the age of its
own figures, and Setup shows the interval and what the last pass found.

That covers the time the dashboard is up, which is the common case. It does not
cover a machine you work on for weeks without opening it — and the archive can
only copy a transcript that still exists, so if Claude Code expires one first it
is gone. If that is your pattern, a real scheduler is the answer, and it is one
line:

```bash
# crontab -e  — import and archive every 15 minutes
*/15 * * * * cd /path/to/Dev-AI-Usage && /usr/bin/npm run run >> data/cron.log 2>&1
```

Nothing in this repository writes to your crontab. Adding that line is a change
to your machine, not to this project, so it stays your decision.

---

## Where things live

| Path | What |
|---|---|
| `docs/` | The learning path |
| `exercises/` | The optional extras |
| `mcp/` | Planned MCP server exercises. The README there is the plan; none are written yet. |
| `data/usage.db` | Derived data. Never leaves the machine, not in git, and safe to delete — it rebuilds in seconds. |
| `data/archive.db` | The transcript archive. **Not derived**: once Claude Code has expired a transcript this is the only copy. Never leaves the machine, not in git. |
| `data/observability/` | Run history, and notes if you enabled them |
| `data/ui-tests/` | Screenshots from failed UI checks |
| `prices/models.json` | The price table, with a date on it |

## Licence

MIT. See [LICENSE](LICENSE).
