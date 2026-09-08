import { createHash } from "node:crypto";

export interface OtelMetricPoint {
  id: string;
  name: string;
  ts: string;
  value: number;
  sessionId: string | null;
  attrs: Record<string, string>;
}

export interface OtelEventRecord {
  id: string;
  name: string;
  ts: string;
  sessionId: string | null;
  requestId: string | null;
  attrs: Record<string, string>;
}

/**
 * One span: a unit of work, with a parent, so a session reads as a tree.
 *
 * Unlike a metric point or an event, a span arrives with an identity of its
 * own, so this is the one record here whose id is not a content hash - see the
 * note on `otel_span` in schema.sql.
 */
export interface OtelSpanRecord {
  traceId: string;
  spanId: string;
  /** Null at a root. OTLP writes an empty string, which is not the same thing. */
  parentSpanId: string | null;
  name: string;
  sessionId: string | null;
  /** The join to `tool_call.id` and `message_block.tool_use_id`. */
  toolUseId: string | null;
  requestId: string | null;
  startedAt: string;
  endedAt: string;
  /** Null when either timestamp was unusable. Never 0 to mean "unknown". */
  durationMs: number | null;
  status: string | null;
  attrs: Record<string, string>;
}

/**
 * Decodes OTLP/JSON payloads from Claude Code.
 *
 * JSON rather than protobuf on purpose: the exercise pins
 * OTEL_EXPORTER_OTLP_PROTOCOL=http/json so this stays a pure function over
 * plain objects, with no protobuf dependency and no build step.
 *
 * Ids are content hashes, so a retried export - which OTLP does on any network
 * hiccup - lands on the same row instead of double-counting.
 */
export class OtlpDecoder {
  decodeMetrics(payload: unknown): OtelMetricPoint[] {
    const points: OtelMetricPoint[] = [];

    for (const resource of arr(rec(payload)?.resourceMetrics)) {
      const resourceAttrs = readAttributes(rec(rec(resource)?.resource)?.attributes);
      for (const scope of arr(rec(resource)?.scopeMetrics)) {
        for (const metric of arr(rec(scope)?.metrics)) {
          const m = rec(metric);
          const name = str(m?.name);
          if (!name) continue;
          // Counters arrive as `sum`, gauges as `gauge`; both carry dataPoints.
          const dataPoints = [...arr(rec(m?.sum)?.dataPoints), ...arr(rec(m?.gauge)?.dataPoints)];
          for (const point of dataPoints) {
            points.push(this.toMetricPoint(name, point, resourceAttrs));
          }
        }
      }
    }
    return points;
  }

  decodeLogs(payload: unknown): OtelEventRecord[] {
    const events: OtelEventRecord[] = [];

    for (const resource of arr(rec(payload)?.resourceLogs)) {
      const resourceAttrs = readAttributes(rec(rec(resource)?.resource)?.attributes);
      for (const scope of arr(rec(resource)?.scopeLogs)) {
        for (const log of arr(rec(scope)?.logRecords)) {
          const event = this.toEvent(log, resourceAttrs);
          if (event) events.push(event);
        }
      }
    }
    return events;
  }

  decodeSpans(payload: unknown): OtelSpanRecord[] {
    const spans: OtelSpanRecord[] = [];

    for (const resource of arr(rec(payload)?.resourceSpans)) {
      const resourceAttrs = readAttributes(rec(rec(resource)?.resource)?.attributes);
      for (const scope of arr(rec(resource)?.scopeSpans)) {
        for (const span of arr(rec(scope)?.spans)) {
          const decoded = this.toSpan(span, resourceAttrs);
          if (decoded) spans.push(decoded);
        }
      }
    }
    return spans;
  }

  private toSpan(span: unknown, resourceAttrs: Record<string, string>): OtelSpanRecord | null {
    const s = rec(span);
    const traceId = str(s?.traceId);
    const spanId = str(s?.spanId);
    // A span with no identity cannot be keyed, deduped or joined. Dropped
    // rather than stored keyless, the same rule as a nameless event.
    if (!traceId || !spanId) return null;

    const attrs = { ...resourceAttrs, ...readAttributes(s?.attributes) };
    return {
      traceId, spanId,
      parentSpanId: str(s?.parentSpanId),
      name: str(s?.name) ?? "",
      sessionId: attrs["session.id"] ?? null,
      toolUseId: attrs["tool_use_id"] ?? null,
      requestId: attrs["request_id"] ?? attrs["request.id"] ?? null,
      startedAt: nanosToIso(s?.startTimeUnixNano),
      endedAt: nanosToIso(s?.endTimeUnixNano),
      durationMs: durationMsBetween(s?.startTimeUnixNano, s?.endTimeUnixNano),
      status: str(rec(s?.status)?.code) ?? null,
      attrs,
    };
  }

  private toMetricPoint(
    name: string,
    point: unknown,
    resourceAttrs: Record<string, string>,
  ): OtelMetricPoint {
    const p = rec(point);
    const attrs = { ...resourceAttrs, ...readAttributes(p?.attributes) };
    const ts = nanosToIso(p?.timeUnixNano);
    const value = num(p?.asDouble) ?? num(p?.asInt) ?? Number(str(p?.asInt) ?? 0);
    const sessionId = attrs["session.id"] ?? null;
    return {
      id: hashOf([name, ts, sessionId ?? "", String(value), JSON.stringify(attrs)]),
      name, ts, value, sessionId, attrs,
    };
  }

  private toEvent(log: unknown, resourceAttrs: Record<string, string>): OtelEventRecord | null {
    const l = rec(log);
    const attrs = { ...resourceAttrs, ...readAttributes(l?.attributes) };
    // Claude Code names the event in an attribute; the body is the fallback.
    const name = attrs["event.name"] ?? str(rec(l?.body)?.stringValue);
    if (!name) return null;
    const ts = nanosToIso(l?.timeUnixNano ?? l?.observedTimeUnixNano);
    return {
      id: hashOf([name, ts, JSON.stringify(attrs)]),
      name, ts,
      sessionId: attrs["session.id"] ?? null,
      requestId: attrs["request.id"] ?? attrs["request_id"] ?? null,
      attrs,
    };
  }
}

type Rec = Record<string, unknown>;

const rec = (v: unknown): Rec | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** OTLP encodes every attribute value as a one-key union; flatten to strings so
 *  callers do not have to care which variant a field arrived as. */
function readAttributes(attributes: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of arr(attributes)) {
    const e = rec(entry);
    const key = str(e?.key);
    const value = rec(e?.value);
    if (!key || !value) continue;
    const raw = value.stringValue ?? value.intValue ?? value.doubleValue ?? value.boolValue;
    if (raw !== undefined && raw !== null) out[key] = String(raw);
  }
  return out;
}

/**
 * Milliseconds between two OTLP nano timestamps, or null.
 *
 * Deliberately not `nanosToIso` twice and subtract: that helper returns the
 * epoch for input it cannot read, and epoch minus epoch is a very convincing
 * zero. A duration nobody measured has to reach the page as an em dash, so the
 * null is made here, at the boundary, rather than guessed at later.
 */
function durationMsBetween(start: unknown, end: unknown): number | null {
  const from = asNanos(start);
  const to = asNanos(end);
  if (from === null || to === null || to < from) return null;
  return Math.round((to - from) / 1_000_000);
}

function asNanos(nanos: unknown): number | null {
  const asNumber = typeof nanos === "string" ? Number(nanos) : num(nanos);
  return asNumber && Number.isFinite(asNumber) ? asNumber : null;
}

function nanosToIso(nanos: unknown): string {
  const asNumber = typeof nanos === "string" ? Number(nanos) : num(nanos);
  if (!asNumber || !Number.isFinite(asNumber)) return new Date(0).toISOString();
  return new Date(asNumber / 1_000_000).toISOString();
}

function hashOf(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}
