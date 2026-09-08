import type { ObservabilityEvent } from "./Event";

/** What an observer does with an event. Async so one can call out to a model. */
export interface Observer {
  readonly id: string;
  observe(e: ObservabilityEvent, history: readonly ObservabilityEvent[]): Promise<void>;
}

/**
 * The seam between the app and observability.
 *
 * `Emitter` is all the main app ever sees - one method. That is why the whole
 * observability folder can be deleted, or swapped for a different backend,
 * without touching ingest, analysis or the UI.
 */
export interface Emitter {
  emit(e: ObservabilityEvent): Promise<void>;
}

/**
 * The default. Observability that has not been attached costs nothing and
 * cannot fail, so emitting code never needs a null check or a try/catch.
 */
export const NULL_EMITTER: Emitter = {
  async emit() {
    /* observability not attached */
  },
};

export class EventBus implements Emitter {
  private readonly observers: Observer[] = [];
  private readonly history: ObservabilityEvent[] = [];

  /** Kept so an observer can reason about a whole run, not just one event. */
  private static readonly HISTORY_LIMIT = 200;

  subscribe(observer: Observer): this {
    this.observers.push(observer);
    return this;
  }

  async emit(e: ObservabilityEvent): Promise<void> {
    this.history.push(e);
    if (this.history.length > EventBus.HISTORY_LIMIT) this.history.shift();

    // An observer that throws must not break the thing it is observing.
    // Telemetry is never worth failing the run it is measuring.
    await Promise.all(
      this.observers.map(async (observer) => {
        try {
          await observer.observe(e, this.history);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.warn(`[observability] ${observer.id} failed on ${e.name}: ${reason}`);
        }
      }),
    );
  }

  observerIds(): string[] {
    return this.observers.map((o) => o.id);
  }
}
