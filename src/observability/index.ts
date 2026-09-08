import { join } from "node:path";
import type { AppConfig } from "../config";
import { EventBus, NULL_EMITTER, type Emitter } from "./EventBus";
import { JsonlObserver } from "./observers/JsonlObserver";

export { event } from "./Event";
export type { EventName, ObservabilityEvent } from "./Event";
export { EventBus, NULL_EMITTER } from "./EventBus";
export type { Emitter, Observer } from "./EventBus";
export { JsonlObserver } from "./observers/JsonlObserver";

export interface ObservabilityHandle {
  emitter: Emitter;
  /** Which observers actually attached, for `doctor` and the Setup page. */
  active: string[];
  /** Why an observer did not attach, keyed by id. */
  skipped: Record<string, string>;
}

/**
 * The whole hook-in surface: one call.
 *
 * ```ts
 * const observability = attachObservability(config);
 * // ...then hand observability.emitter to whatever should report.
 * ```
 *
 * Deleting this folder means deleting one import and one call; every emitting
 * site keeps working against NULL_EMITTER. That is the point of returning an
 * `Emitter` rather than a bus - callers cannot accumulate a dependency on the
 * module's internals.
 */
export function attachObservability(config: AppConfig): ObservabilityHandle {
  if (config.observability === "off") {
    return { emitter: NULL_EMITTER, active: [], skipped: { all: "DEV_AI_USAGE_OBSERVABILITY=off" } };
  }

  const bus = new EventBus();

  // A local trail costs nothing and is what you want at 2am. This module
  // records what happened; reading anything into it is a job for a person.
  bus.subscribe(new JsonlObserver(join(config.observabilityDir, "events.jsonl")));

  return { emitter: bus, active: bus.observerIds(), skipped: {} };
}
