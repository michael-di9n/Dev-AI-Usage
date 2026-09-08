import { failed, type IngestResult, type IngestSource } from "./Source";

/**
 * Runs every source, in order, isolating failures.
 *
 * One source being unconfigured or broken must not cost the others their data:
 * the Analytics API needs an admin key most developers do not have, and Cursor
 * may not be installed at all. Both are normal states, so the runner reports
 * them and carries on.
 */
export class IngestRunner {
  constructor(private readonly sources: IngestSource[]) {}

  async runAll(): Promise<IngestResult[]> {
    const results: IngestResult[] = [];
    for (const source of this.sources) {
      try {
        results.push(await source.ingest());
      } catch (error) {
        results.push(failed(source.id, error));
      }
    }
    return results;
  }

  /** Readiness without collecting - what the setup page renders. */
  async describe(): Promise<{ id: string; label: string; reason: string | null }[]> {
    return Promise.all(
      this.sources.map(async (source) => ({
        id: source.id,
        label: source.label,
        reason: await source.unavailableReason(),
      })),
    );
  }
}
