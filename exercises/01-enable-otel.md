# Exercise 01 — Enable OpenTelemetry

**Time:** ~3 minutes. **Unlocks:** active time, per-request latency, live events.

Claude Code can export metrics, events and spans over OTLP. This app hosts its
own receiver, so there is no collector to install — you only point Claude Code
at it.

Every variable below is Claude Code's or OpenTelemetry's, not this app's:

- [Claude Code monitoring](https://code.claude.com/docs/en/monitoring-usage) — the
  full list, the metric and event names, and which ones are beta.
- [OTLP exporter configuration](https://opentelemetry.io/docs/specs/otel/protocol/exporter/) —
  what `OTEL_EXPORTER_OTLP_*` means outside Claude Code.

Where this page and those disagree, they are right and this one is stale.

## Step 1: find the settings file

```bash
echo $CLAUDE_CONFIG_DIR
```

- **Prints a path** → your settings file is `$CLAUDE_CONFIG_DIR/settings.json`.
- **Prints nothing** → your settings file is `~/.claude/settings.json`.

Optionally, this can be set to project scope `.claude/settings.json` or local scope `.claude/settings.local.json`
but they will need to be set again when gong to another project.

## Step 2: merge these into the `env` block

Merge — do not replace. That block often already holds other variables.

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_TRACES_EXPORTER": "otlp",
    "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA": "1",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:3000/api/otlp"
  }
}
```

That is the whole required set. Each line earns its place:

| Variable | What it does | Why this value |
|---|---|---|
| `CLAUDE_CODE_ENABLE_TELEMETRY` | The master switch. Off, Claude Code collects nothing and every variable below is ignored. | `1` is the only value that turns it on. |
| `OTEL_METRICS_EXPORTER` | Eight counters: `session.count`, `lines_of_code.count`, `commit.count`, `pull_request.count`, `cost.usage` (USD), `token.usage`, `code_edit_tool.decision`, `active_time.total` (s). | `otlp` posts to `/api/otlp/v1/metrics`. |
| `OTEL_LOGS_EXPORTER` | One event per thing that happened: `user_prompt`, `assistant_response`, `api_request`, `api_error`, `api_refusal`, `tool_result`, `tool_decision`, `permission_mode_changed`, `auth`, `mcp_server_connection`. `api_request` carries per-request duration; `tool_result` carries `duration_ms` per tool call. | `otlp` posts to `/api/otlp/v1/logs`. |
| `OTEL_TRACES_EXPORTER` | Spans and the shape between them: `interaction` over a whole prompt, `llm_request` per API call, and `tool`, `tool.blocked_on_user` and `tool.execution` under it — which separates how long a tool ran from how long it waited for your approval. | `otlp` posts to `/api/otlp/v1/traces`, which is what the Trace page reads. |
| `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA` | Makes Claude Code emit spans at all. Without it the traces exporter has nothing to send. | Beta, so expect the shape to move. `ENABLE_ENHANCED_TELEMETRY_BETA` is an alias for it. |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | Wire format for all three signals. | `http/json` only. The receiver decodes JSON, so there is no protobuf dependency and no build step. `grpc` and `http/protobuf` will not be understood. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base URL. Each signal appends its own `/v1/...` path. | Port 3000 is `npm run dev`. Change it only if you serve the dashboard elsewhere. |

## Step 3: verify

Start the dashboard, then start a **new** Claude Code session (env vars are read
at launch) and run any tool in it.

```bash
npm run dev                                  # terminal 1
curl -s localhost:3000/api/otlp/health       # terminal 2 — expect lastSeen to fill in
```

Give it a minute. Events batch every 5 seconds, metrics every 60, so an empty
`lastSeen` one second after your first tool call is normal rather than broken.

`/setup` in the dashboard shows the same thing with a timestamp.

## What you get

| Metric | Why it is not derivable otherwise |
|---|---|
| `claude_code.active_time.total` | Turn duration counts the time you spent reading the reply. Active time does not, and the gap between them is the single most useful time figure available. |
| `claude_code.api_request` (event) | Carries per-request duration. The transcript's `durationMs` is `null` on every record. |
| `claude_code.tool_decision` | Accept/reject as a first-class event rather than inferred from result text. |
| `claude_code.cost.usage` | Claude Code's own cost figure, for the three-way check against derived cost and the Analytics API. |
| `claude_code.tool` / `claude_code.llm_request` (spans) | Real per-call wall-clock, on the Trace page. The transcript's `durationMs` is null on every record, and only the PostToolUse hook otherwise measures a tool. |

## Optional, if you want them

None of these are needed. They are the ones worth knowing about.

| Variable | Default | What it changes here |
|---|---|---|
| `OTEL_METRIC_EXPORT_INTERVAL` | `60000` ms | How long after a turn the Arrived line on the Observability page moves. `10000` while you are checking the setup, then put it back. |
| `OTEL_LOGS_EXPORT_INTERVAL` | `5000` ms | The same, for events. |
| `OTEL_TRACES_EXPORT_INTERVAL` | `5000` ms | The same, for spans. |
| `OTEL_RESOURCE_ATTRIBUTES` | none | Attributes stamped on every record, e.g. `team.id=platform`. They are stored with the point. |
| `OTEL_METRICS_INCLUDE_VERSION` | `false` | Adds `app.version`, which is how you tell a behaviour change from a Claude Code upgrade. |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` (and the `LOGS`/`TRACES` pair) | none | Per-signal endpoints, overriding the base URL. Only useful if one signal should go somewhere else. |
| `OTEL_EXPORTER_OTLP_HEADERS` | none | Auth for a real collector. Nothing reads it here — this receiver is localhost and unauthenticated. |

## Leave these alone

These are supported by Claude Code and break something on this end.

| Variable | Default | Why not |
|---|---|---|
| `OTEL_METRICS_INCLUDE_SESSION_ID` | `true` | `session.id` is the join key between metrics, events, spans and the transcript. Set it `false` and nothing lines up with anything. |
| `OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE` | `delta` | The rollup sums the points it stored. Under `cumulative` each point already contains the ones before it, so the total counts them again. |
| `OTEL_LOG_RAW_API_BODIES` | off | Entire API requests and responses — system prompt and full message history — as `api_request_body` / `api_response_body` events. `file:<dir>` writes them to disk untruncated instead. It implies consent to every content setting below. Nothing here reads them. |

## The content settings — optional, and it depends where the agent runs

These four put the actual words into telemetry. They are drawn as a branch off
the run on the Observability page: never counted, never banded, and off by
default.

| Variable | Default | What it gives you |
|---|---|---|
| `OTEL_LOG_USER_PROMPTS` | off | The `prompt` attribute on `user_prompt` events. Without it the event still arrives with `prompt_length`, so you see that something was asked and never what. Also turns on assistant responses unless that is set on its own. |
| `OTEL_LOG_ASSISTANT_RESPONSES` | follows the above | The `response` attribute on `assistant_response` events, capped at 60 KB. |
| `OTEL_LOG_TOOL_DETAILS` | off | Tool parameters — whole Bash command strings, MCP server and tool names, skill names, tool input. |
| `OTEL_LOG_TOOL_CONTENT` | off | Whole tool inputs and outputs, capped at 60 KB, **carried on span events** — so it delivers nothing until the two trace variables above are working. |

`CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH` (default `61440`) is the 60 KB ceiling
those truncate at.

**On this machine, leave them off.** The transcript already holds every prompt,
reply, tool argument and tool result in full and untruncated — these copy a
capped subset of it into a second store that nothing here reads.

**Pointed at an agent on another machine, they are the only source there is.**
This app's receiver takes OTLP from any host that can reach the port, and a
session whose transcript is not on this disk arrives with `prompt` and
`response` set to the literal string `<REDACTED>`. Then these four are the
whole of what was said.

## Notes

- Nothing leaves your machine. The endpoint is localhost.
- OTel does not backfill. Trends start the day you finish this.
- The two trace variables are what put real durations on the Trace page. Without
  them that page still works - it is drawn from the transcript - but every
  duration on it is an em dash, because nothing else on the machine times a tool
  call.
- This app's own variables — where the database lives, how often it imports —
  are listed under [Configuration](../README.md#configuration). None of them
  affect this exercise.
- How the receiver decodes and stores all this is in
  [`src/ingest/otlp/CLAUDE.md`](../src/ingest/otlp/CLAUDE.md).
- To turn it off, delete the keys and restart your sessions.
