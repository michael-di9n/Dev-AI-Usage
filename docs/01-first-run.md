# 1. Your first run

**Time:** about three minutes. **You need:** Node, and Claude Code used at least
once on this machine.

## Do this

```bash
npm install
npm run run
```

You should see something like:

```
[ok  ] claude-code    341 of 341 transcripts changed
[skip] hooks          No hook spool yet. Complete exercises/02-register-hooks.md...
[ok  ] cursor         29 scored commits, 8 daily rows
[skip] analytics-api  ANTHROPIC_ADMIN_KEY is not set...

Done in 0.4s. Open the dashboard with `npm run dev`.
```

Then:

```bash
npm run dev
```

Open <http://localhost:3000>.

## Reading that output

**`ok`** means the source was read.

**`skip`** means a source is not set up. **This is normal and not a failure.** Two
of the four are optional extras most people never turn on. Each `skip` line says
what stays unavailable because of it, so nothing is silently missing.

**`ERR`** means something actually broke. Run `npm run doctor` — it will name the
problem and the fix.

## What just happened

Claude Code writes a file for every session you have, as you have it. This read
those files, worked out the cost of each message from published prices, and saved
everything to `data/usage.db` on your machine.

Nothing was uploaded. There is no account and no API key involved in any of the
above.

## Re-running it

`npm run run` is safe to run as often as you like. It notices which transcript
files changed and reads only the new bytes:

```
[ok  ] claude-code    0 of 341 transcripts changed
Ingest finished in 0.01s
```

A first import of a 250 MB history takes under two seconds. A re-import with
nothing new takes a hundredth of that. Put it in a shell alias, or on a timer, and
forget about it.

## If nothing was found

The dashboard will say **"Nothing imported yet"** and show you the next command
rather than a page of zeros. If it says no transcript folder was found:

```bash
echo $CLAUDE_CONFIG_DIR
```

- **It printed a path** → your transcripts are in `<that path>/projects`. The
  importer looks there automatically, so if it still found nothing, run
  `npm run doctor` for the exact path it tried.
- **It printed nothing** → the importer looks in `~/.claude/projects`.

To point it somewhere else, create `.env.local`:

```bash
echo 'CLAUDE_CODE_PROJECTS_DIR=/path/to/projects' >> .env.local
```

> One trap worth knowing: if `CLAUDE_CONFIG_DIR` is set on your machine, a
> complete-looking `~/.claude/` folder often exists too and is **never read** by
> Claude Code. Editing things there appears to work and changes nothing. This is
> the single most common reason a Claude Code setting seems to be ignored.

## Next

[2. Reading the dashboard →](02-reading-the-dashboard.md)
