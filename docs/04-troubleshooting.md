# 4. When something is wrong

## Start here, always

```bash
npm run doctor
```

Every part gets checked, and anything not right comes with the fix:

```
[  ok  ] Claude Code transcripts
          204 sessions imported from /home/you/.claude/projects.

[ todo ] Live telemetry
          Nothing has arrived at the OTLP receiver.
          -> See exercises/01-enable-otel.md. Optional - it adds real active time.

Working. 4 optional extras not set up.
```

`todo` means an optional extra is not set up. `FIX` means something is actually
wrong. The exit code is non-zero only for a `FIX`, so this works in a script.

---

## Common problems

### "Nothing imported yet" and no transcripts found

```bash
echo $CLAUDE_CONFIG_DIR
```

**Printed a path** → transcripts live in `<path>/projects`. That is checked
automatically; `npm run doctor` prints the exact path it tried.

**Printed nothing** → `~/.claude/projects` is checked.

Point it elsewhere in `.env.local`:

```bash
echo 'CLAUDE_CODE_PROJECTS_DIR=/path/to/projects' >> .env.local
```

### A Claude Code setting I added does nothing

Almost certainly the wrong file. If `CLAUDE_CONFIG_DIR` is set, a complete and
plausible `~/.claude/` folder usually also exists and is **never read**. Your
settings are valid, `jq` parses them, the command works by hand — and nothing
happens.

Check the path before debugging anything else:

```bash
echo $CLAUDE_CONFIG_DIR    # a path here means use <path>/settings.json
```

**Observability** does this for you. It names the settings file it
actually read, and when `CLAUDE_CONFIG_DIR` shadows a populated `~/.claude`, it
says so at the top of the page before any of its other verdicts — because every
verdict underneath is wrong if you edited the file nothing loads.

### A variable is set and it still shows as missing

Click the node for it. The panel that unrolls gives the reason the vessel has
no room for, and it tells two cases apart. If it says **wrong value**, the key
is there with
something the receiver does not accept — `grpc` rather than `http/json` is the
usual one. If it says **not set**, the key is genuinely absent from all three
files, which almost always means the shadowed-file problem above.

### The page says tracing is on and Trace still shows em dashes

Expected, for a while. OpenTelemetry reads its variables when a session
launches, so the session you are in was configured before you changed anything.
Start a new Claude Code session; the Arrived line in each node's panel counts
spans as they arrive.

### The numbers look too high

Expected, and not a bug. Derived cost adds up every message in the transcript,
including subagents. Claude Code's own figure resets when you resume a session and
only counts the main conversation. The Second opinion panel shows both.

If you want the authoritative figure, that is the Analytics API — it needs an
organisation admin key, which is optional and covered in
[the extras](../exercises/README.md).

### Cursor columns are all em dashes

Working as intended. Cursor stores `tokenCount: {0, 0}` for every message on
disk; the real numbers only exist behind its team API. It contributes acceptance
rates and AI-vs-human line counts, and nothing about cost. A zero there would be
a lie, so it shows `—`.

### Average tool duration is blank

Nothing can measure it yet. The transcript records no tool timing and telemetry
times the API request, not the tool. Only the hook in
[exercise 02](../exercises/02-register-hooks.md) has it.

### Claude does not answer `@claude` on a pull request

Three things stop it, in order of likelihood. The triggering account needs write
access. A fork pull request on a public repository is handed no secrets, so
nothing can authenticate. And the workflow skips itself when
`CLAUDE_CODE_OAUTH_TOKEN` is unset — check `gh secret list`. See
[exercise 03](../exercises/03-github-actions.md).

### The database is wrong and I want to start over

```bash
rm -rf data/usage.db data/usage.db-wal data/usage.db-shm
npm run run
```

Two seconds. It is derived data — there is nothing to lose.

### `npm run ui-test` says no dashboard

It tests a running site. Start it first:

```bash
npm run dev            # terminal 1
npm run ui-test        # terminal 2
```

Different port: `npm run ui-test -- --url http://localhost:3005`.

### A UI check fails and I want to see it

Every failure saves a full-page screenshot and prints the path:

```
screenshot: data/ui-tests/trends-light-desktop-light.png
```

---

## What can leave the machine

One request, and only if you set `ANTHROPIC_ADMIN_KEY`: the Analytics source
asks the Anthropic Admin API for your own organisation's usage records. It
sends no transcript text, no prompt and no figure from your database — it only
reads. Leave the key unset and the source skips itself, which is the default.

Nothing else here reaches the network. `npm run run`, `npm run ingest`,
`npm run report`, `npm run doctor` and `npm run ui-test` ask no model anything,
because there is no code left that could.

To switch the local run trail off as well:

```bash
echo 'DEV_AI_USAGE_OBSERVABILITY=off' >> .env.local
```

---

## Next

[5. How it works →](05-how-it-works.md)
