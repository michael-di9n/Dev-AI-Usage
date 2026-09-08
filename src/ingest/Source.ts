export type SourceStatus = "ok" | "not-configured" | "error";

export interface IngestResult {
  sourceId: string;
  status: SourceStatus;
  /** One line a human can act on: what happened, or what is missing and why. */
  detail: string;
  recordsWritten: number;
}

/**
 * Every data source looks the same from the outside, so the runner can add one
 * without changing, and the setup page can render readiness without knowing
 * what any of them actually read.
 *
 * `unavailableReason` exists so a missing source produces an explanation rather
 * than a zero. A source that cannot answer a metric must never look like a
 * source that answered "none".
 */
export interface IngestSource {
  readonly id: string;
  readonly label: string;
  /** Null when the source can run. Otherwise the reason, phrased for a human. */
  unavailableReason(): Promise<string | null>;
  ingest(): Promise<IngestResult>;
}

export function skipped(sourceId: string, detail: string): IngestResult {
  return { sourceId, status: "not-configured", detail, recordsWritten: 0 };
}

export function ok(sourceId: string, detail: string, recordsWritten: number): IngestResult {
  return { sourceId, status: "ok", detail, recordsWritten };
}

export function failed(sourceId: string, error: unknown): IngestResult {
  const detail = error instanceof Error ? error.message : String(error);
  return { sourceId, status: "error", detail, recordsWritten: 0 };
}
