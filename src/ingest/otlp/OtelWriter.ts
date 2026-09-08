import type { Db } from "../../db/Database";
import type { OtelEventRecord, OtelMetricPoint, OtelSpanRecord } from "./OtlpDecoder";

/**
 * Persists decoded OpenTelemetry records.
 *
 * Split from the decoder so the route can decode and store in one step while
 * tests exercise the decoding without a database, and so the storage shape can
 * change without touching the wire-format reader.
 */
export class OtelWriter {
  constructor(private readonly db: Db) {}

  writeMetrics(points: OtelMetricPoint[]): number {
    return this.db.transaction(() => {
      for (const p of points) {
        this.db.run(
          `INSERT OR IGNORE INTO otel_metric (id, name, ts, value, session_id, attrs_json)
           VALUES (?,?,?,?,?,?)`,
          [p.id, p.name, p.ts, p.value, p.sessionId, JSON.stringify(p.attrs)],
        );
      }
      return points.length;
    });
  }

  writeEvents(events: OtelEventRecord[]): number {
    return this.db.transaction(() => {
      for (const e of events) {
        this.db.run(
          `INSERT OR IGNORE INTO otel_event (id, name, ts, session_id, request_id, attrs_json)
           VALUES (?,?,?,?,?,?)`,
          [e.id, e.name, e.ts, e.sessionId, e.requestId, JSON.stringify(e.attrs)],
        );
      }
      return events.length;
    });
  }

  writeSpans(spans: OtelSpanRecord[]): number {
    return this.db.transaction(() => {
      for (const s of spans) {
        this.db.run(
          `INSERT OR IGNORE INTO otel_span
             (trace_id, span_id, parent_span_id, name, session_id, tool_use_id,
              request_id, started_at, ended_at, duration_ms, status, attrs_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [s.traceId, s.spanId, s.parentSpanId, s.name, s.sessionId, s.toolUseId,
           s.requestId, s.startedAt, s.endedAt, s.durationMs, s.status,
           JSON.stringify(s.attrs)],
        );
      }
      return spans.length;
    });
  }

  /** Drives the setup page: has anything ever arrived, and how recently. */
  lastSeenAt(): string | null {
    const row = this.db.one<{ ts: string | null }>(
      `SELECT MAX(ts) AS ts FROM (
         SELECT ts FROM otel_metric UNION ALL SELECT ts FROM otel_event
         -- Traces can be the only signal switched on, so they count here too.
         UNION ALL SELECT started_at FROM otel_span
       )`,
    );
    return row?.ts ?? null;
  }
}
