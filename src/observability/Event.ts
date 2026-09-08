/**
 * The event vocabulary.
 *
 * Deliberately small and past-tense: an event says what happened, never what
 * anyone should do about it. That is what lets observers be added and removed
 * without the emitting code caring how many are listening, or whether any are.
 */

export type EventName =
  | "ingest.finished"
  | "uitest.finished"
  | "run.finished";

export interface ObservabilityEvent {
  name: EventName;
  at: string;
  /** Numbers and short strings only. Never raw prompts, output or file contents. */
  facts: Record<string, string | number | boolean | null>;
}

export function event(
  name: EventName,
  facts: Record<string, string | number | boolean | null>,
): ObservabilityEvent {
  return { name, at: new Date().toISOString(), facts };
}
