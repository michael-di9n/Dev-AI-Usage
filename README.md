# Dev AI Usage

Where your AI coding spend and time actually went, over time. It reads the
transcripts Claude Code already writes on this machine, plus Cursor's history,
and reports what happened.

**No API key. Nothing leaves your computer. The first import takes about two
seconds.**

```bash
npm install
npm run run      # import, analyse, summarise
npm run dev      # dashboard on http://localhost:3000
```

That is the whole setup. `npm run doctor` says what is wrong and how to fix it.

---

## What you get

| Page | What it answers |
|---|---|
| **Trends** | What you spent, on which projects, using which models. Today by hour; longer windows by day, week or month, on your local calendar rather than UTC's. Carries a usage band and the age of its own figures. |
| **Observability** | Whether Claude Code is configured for an in-depth trace. The requirements draw as a pipe that fills as each one is set, and the water stops at the first that is not. Where it stops is what to do next; click a vessel for the exact line to add and where. |
| **Trace** | One project's runs, and any one of them step by step — the prompt, each model turn, every tool call with the arguments it was really given, and where the money went. **Export JSON** writes a whole run out under a format name and version. |
| **Telemetry** | Everything Claude Code exports over OpenTelemetry, live. The receiver runs inside this app, so there is no collector to install. |
| **Hooks** | Per-tool wall-clock, which exists nowhere else on the machine, plus every hook event Claude Code fires. |
| **AI maturity** | How much of Claude Code a repository configures, read from its files. Eight capabilities under one banding rule, each printing the count it was banded on. Works on a fresh clone. |
| **Setup** | A lamp per source, what the archive is holding, and under any dark lamp the reason and the file that turns it on. |

Three rules hold everywhere. A number nobody measured renders an em dash naming
the source that would answer it, never `$0.00`. A measured zero renders as zero.
Every figure shows the evidence it was read off.

**Cost is derived.** Tokens times published prices — an estimate, not a bill.

**The archive.** Claude Code expires its own transcripts on its own schedule.
Everything else here stores a parse of them; the archive stores the compressed
bytes, in a separate database, so a question nobody has thought to ask yet can
still be asked next year. Measured on a 151MB corpus it holds 38.6MB. Set
`DEV_AI_USAGE_ARCHIVE=off` if you would rather keep the disk.

**It stays current while `npm run dev` is running** — one import at startup,
then every 15 minutes. Nothing is installed and nothing is left behind. For a
machine you go weeks without opening, use a real scheduler:

```bash
# crontab -e
*/15 * * * * cd /path/to/Dev-AI-Usage && /usr/bin/npm run run >> data/cron.log 2>&1
```

Nothing in this repository writes to your crontab.

---

## Commands

| Command | What it does |
|---|---|
| `npm run run` | Import and summarise. **The one to use day to day.** |
| `npm run dev` | Start the dashboard on port 3000 |
| `npm run doctor` | Check every part and say what to fix |
| `npm run report` | The same totals in the terminal (`npm run report week`) |
| `npm run ingest` | Import only |
| `npm run archive` | Snapshot every transcript. `-- --verify` reads it all back; `-- --restore <dir>` writes the files out |
| `npm test` | Unit, integration, docs and API wiring |
| `npm run ui-test` | Check the dashboard in the Chrome you already have, light and dark (needs `npm run dev`) |

---

## Configuration

**Nothing here is required.** Every variable has a default that works on a fresh
clone. Set them in your shell or in `.env.local`.

| This app's | Default | What it does |
|---|---|---|
| `DEV_AI_USAGE_DB` | `data/usage.db` | Derived database. Safe to delete and re-run. |
| `DEV_AI_USAGE_ARCHIVE` | `on` | `off` stops archiving transcripts |
| `DEV_AI_USAGE_ARCHIVE_DB` | `data/archive.db` | Where the archive lives. **Not derived.** |
| `DEV_AI_USAGE_SYNC_SECONDS` | `900` | Re-import interval. `off` disables importing entirely. |
| `DEV_AI_USAGE_TRACE_CHARS` | `2000` | Characters kept per content block for Trace. `off` keeps none. |
| `DEV_AI_USAGE_DEVELOPER_ID` | `$USER` | Who imported rows are attributed to |
| `DEV_AI_USAGE_PRICES` | `prices/models.json` | The price table cost is computed from |
| `DEV_AI_USAGE_SPOOL` | `data/spool.jsonl` | Where [the hooks](exercises/02-register-hooks.md) write |
| `DEV_AI_USAGE_OBSERVABILITY` | `on` | `off` stops the run-history module writing |
| `DEV_AI_USAGE_OBSERVABILITY_DIR` | `data/observability` | Where that history goes |
| `DEV_AI_USAGE_UI_SCREENSHOTS` | `data/ui-tests` | Where a failed UI check writes its screenshot |

| Other people's, read but never written | Default |
|---|---|
| `CLAUDE_CONFIG_DIR` | unset. If set, `~/.claude` is ignored — see the trap in [AGENTS.md](AGENTS.md) |
| `CLAUDE_CODE_PROJECTS_DIR` | unset. Points straight at a projects directory, overriding both |
| `CURSOR_TRACKING_DB` | `~/.cursor/ai-tracking/ai-code-tracking.db` |
| `CURSOR_STATE_DB` | `~/.config/Cursor/User/globalStorage/state.vscdb` |
| `ANTHROPIC_ADMIN_KEY` | unset. Read-only. Absent, the Analytics panels read "not configured" |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` — where that one read-only request goes |

Claude Code's own telemetry variables are documented per variable in
[exercise 01](exercises/01-enable-otel.md).

---

## What it will not tell you

- **Cursor spend.** Every message Cursor saves locally records `tokenCount: {0, 0}`; the real numbers only exist behind its team API. It contributes acceptance counts and AI-written lines, and nothing about cost.
- **A bill.** Cost is list price times tokens. The table is pinned by tests against a recorded session whose arithmetic closes exactly.
- **Whether our figure matches Claude Code's.** It resets on resume and skips subagents. Both are shown, with a note that they count different messages on purpose.
- **Anything before you set it up.** Per-tool timing and live telemetry cannot look backwards.
- **A judgement.** A day that cost more may have shipped more. There is no score here.

---

## Learning path

| | Guide | You will be able to |
|---|---|---|
| 1 | [Your first run](docs/01-first-run.md) | Get numbers on screen and know they are right |
| 2 | [Reading the dashboard](docs/02-reading-the-dashboard.md) | Say what every number means, and which to ignore |
| 3 | [Acting on a trend](docs/03-acting-on-trends.md) | Turn a number that moved into a change you make |
| 4 | [When something is wrong](docs/04-troubleshooting.md) | Fix it yourself instead of guessing |
| 5 | [How it works](docs/05-how-it-works.md) | Change the code, or trust it more |
| 6 | [Optional extras](exercises/README.md) | Per-tool timing, live telemetry, a reviewer in CI |

`src/observability/` and `src/ui-testing/` are self-contained: each has one
entry point, needs no credential, reaches no model, and can be deleted for the
cost of one import and one line.

---

## Where things live

| Path | What |
|---|---|
| `docs/`, `exercises/` | The learning path, and the optional extras |
| `mcp/` | Planned MCP exercises. That README is the plan; none are written yet. |
| `data/usage.db` | Derived. Not in git, safe to delete, rebuilds in seconds. |
| `data/archive.db` | **Not derived.** Once Claude Code expires a transcript this is the only copy. |
| `data/observability/` | Run history |
| `data/ui-tests/` | Screenshots from failed UI checks |
| `prices/models.json` | The price table, with a date on it |

## Licence

MIT. See [LICENSE](LICENSE).
