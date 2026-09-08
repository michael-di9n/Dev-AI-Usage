# src/ingest/otlp — OpenTelemetry receiver

Unlike every other source, this one is **pushed to**. Claude Code exports to the
routes under `src/app/api/otlp/`, which decode and store in one step. There is
no `IngestSource` here — nothing to poll.

Inert until `exercises/01-enable-otel.md` is done.

| File | Role |
|---|---|
| `OtlpDecoder.ts` | Wire format → plain records. Pure. |
| `OtelWriter.ts` | Records → `otel_metric` / `otel_event` / `otel_span`. |

The split lets the route decode and persist in one pass while tests exercise the
decoding with no database, and lets the storage shape change without touching
the wire-format reader.

## JSON, not protobuf

The exercise pins `OTEL_EXPORTER_OTLP_PROTOCOL=http/json` so this stays a pure
function over plain objects — no protobuf dependency, no codegen, no build step.
Do not add one.

## Spans are the exception to the content hash

`otel_span` is keyed on `(trace_id, span_id)`, not on a hash of its contents.
A metric point has no identity of its own so one has to be made for it; a span
arrives with one, and a retried export re-sends the same one. `span_id` is only
unique within a trace, which is why both halves are in the key.

Spans need the traces half of exercise 01 - `OTEL_TRACES_EXPORTER=otlp` plus
`CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` - and nothing breaks without them: the
Trace page is drawn from the transcript and spans only add durations to it.

`durationMsBetween` is deliberately not `nanosToIso` twice and a subtraction.
That helper answers the epoch for input it cannot read, and epoch minus epoch is
a very convincing zero. A duration nobody measured has to reach the page as an
em dash, so the null is made at the decoder rather than guessed at later.

## Ids are content hashes

OTLP retries on any network hiccup, and a retried export must land on the same
row rather than double-counting. So the id is a hash of the record's own content
(name, timestamp, attributes, value) and the writer uses `INSERT OR IGNORE`.
There is no cursor here and nothing to resume — idempotency is the whole
delivery guarantee.

## Shape notes

- Counters arrive as `sum`, gauges as `gauge`; both carry `dataPoints`, so both
  are read.
- OTLP encodes every attribute value as a one-key union (`stringValue`,
  `intValue`, `doubleValue`, `boolValue`). `readAttributes` flattens all of them
  to strings so callers never care which variant a field arrived as.
- Resource-level attributes are merged under point-level ones, so a point can
  override.
- An event's name comes from the `event.name` attribute, with the log body as
  fallback. A record with neither is dropped, not stored nameless.
- `nanosToIso` returns the epoch for a missing or unparseable timestamp rather
  than throwing.

`OtelWriter.lastSeenAt()` is what the setup page renders: has anything ever
arrived, and how recently. A null there means "not configured", never "zero".
