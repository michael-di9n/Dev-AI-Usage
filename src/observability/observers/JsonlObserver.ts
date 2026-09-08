import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ObservabilityEvent } from "../Event";
import type { Observer } from "../EventBus";

/**
 * Appends every event to a local file.
 *
 * The floor of the module: no key, no network, no cost. Without this there is
 * no record of what a run did, which is the first thing anyone wants when a
 * number looks wrong three days later.
 */
export class JsonlObserver implements Observer {
  readonly id = "jsonl";

  constructor(private readonly path: string) {}

  async observe(e: ObservabilityEvent): Promise<void> {
    mkdirSync(dirname(this.path), { recursive: true });
    appendFileSync(this.path, `${JSON.stringify(e)}\n`);
  }
}
