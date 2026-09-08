# Exercise 02 — Register the hooks

**Time:** ~5 minutes. **Unlocks:** per-tool duration, friction counts, auto-ingest.

Per-tool wall-clock exists in exactly one place: the `duration` field on the
`PostToolUse` hook payload. The transcript records no tool timing, and OTel times
the API request rather than the tool. Without this, "which tools are slow *and*
frequent" — the question that decides what is worth automating — has no answer.

## Step 1: same settings file as exercise 01

```bash
echo $CLAUDE_CONFIG_DIR    # path printed → use $CLAUDE_CONFIG_DIR/settings.json
                           # nothing      → use ~/.claude/settings.json
```

## Step 2: merge into the `hooks` block

Replace `<REPO>` with the absolute path to this checkout:

```bash
pwd    # copy this
```

```json
{
  "hooks": {
    "PostToolUse": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/bin/hook-spool.mjs PostToolUse" }] }
    ],
    "PermissionDenied": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/bin/hook-spool.mjs PermissionDenied" }] }
    ],
    "PreCompact": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/bin/hook-spool.mjs PreCompact" }] }
    ],
    "SubagentStop": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/bin/hook-spool.mjs SubagentStop" }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/bin/hook-spool.mjs SessionEnd" }] }
    ]
  }
}
```

## Step 3: verify

The hook is safe to test directly — it only reads stdin and appends a line:

```bash
echo '{"tool_use_id":"toolu_test","tool_name":"Bash","duration":1.5}' \
  | node bin/hook-spool.mjs PostToolUse
tail -1 data/spool.jsonl        # expect the line back, with hook_event_name added
```

Then run one real Bash call in a new Claude Code session and:

```bash
npm run ingest    # the hooks line should report durations applied
```

## What the hook does, and does not do

It appends one JSON line and exits 0. No parsing, no database, no network — it
runs inside every tool call, so it has to be invisible. It exits 0 even when the
spool directory is unwritable, because a telemetry hook that blocks a tool call
is worse than one that loses a measurement.

Durations arriving before their transcript rows are kept in the spool and retried
on the next ingest rather than dropped.

## What you get

| Field | Feeds |
|---|---|
| `duration` | Tool duration ranking — slow and frequent tools are the automation shortlist |
| `tool_use_id` | The join back to the transcript's tool call |
| `PermissionDenied` events | Recurring stalls, each one a permission entry you have not added yet |
| `PreCompact` events | Context blowouts, and the cost of the turns leading into one |
| `SessionEnd` | Ingest without a cron job or a manual command |

## Notes

- Hooks do not backfill either. Only sessions started after this get durations.
- To remove: delete the `hooks` block entries. Nothing else depends on them.
