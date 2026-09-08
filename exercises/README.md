# Exercises

Three setup steps are left to whoever installs this. Two write to files outside
the repo — your Claude Code settings — and the last writes workflows into
`.github/`. The app is fully usable before you do any of them. Each lights up
something that cannot be derived another way.

The two that used to sit at 03 and 04 turned on a model-backed visual judge.
That whole path is gone — this tool observes, and nothing in it asks a model
anything — and the rest have been renumbered to close the gap.

| # | Exercise | Unlocks | Without it |
|---|---|---|---|
| 01 | [Enable OpenTelemetry](./01-enable-otel.md) | Real active time, per-API-request latency, live in-session events, MCP connection tracking | Timing comes only from turn duration, which includes the time you spent reading |
| 02 | [Register the hooks](./02-register-hooks.md) | Per-tool wall-clock duration, permission friction counts, compaction events, ingest on session end | "Which tools are slow" is unanswerable, and ingest must be run manually or on a timer |
| 03 | [Run Claude in CI](./03-github-actions.md) | The five rules in `AGENTS.md` checked on every pull request, `@claude` on issues, and the CI/CD cell on the AI maturity page. GitHub Actions and GitLab | The house rules are applied from a reviewer's memory, and `ci.yml` checks only what a test can check |

Check progress at any time:

```bash
npm run ingest        # each source prints ok / skip and why
```

A skipped source is a normal state, not a failure. Nothing here is required.

## Why these are exercises and not an installer

Two reasons, and both matter more than the convenience of automating them.

An installer that edits your global Claude Code settings is editing the config
of every project on the machine, including work unrelated to this tool. That is
not a decision a dashboard should make for you.

The second is that `~/.claude` and `$CLAUDE_CONFIG_DIR` frequently disagree, and
writing to the wrong one fails silently — the file is valid, `jq` parses it, and
nothing happens. Doing it by hand once, with `echo $CLAUDE_CONFIG_DIR` in front
of you, is faster than debugging that.

Exercise 03 is the exception that proves the rule. It writes inside the repo, in
git, where you read the diff before it does anything.
