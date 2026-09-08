import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readConfig } from "../src/config";
import { JsonlObserver } from "../src/observability/observers/JsonlObserver";
import { EventBus, NULL_EMITTER, type Observer } from "../src/observability/EventBus";
import { attachObservability, event } from "../src/observability";

let dir: string;

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "obs-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

class Recording implements Observer {
  readonly id = "recording";
  seen: string[] = [];
  historyLengths: number[] = [];
  async observe(e: Parameters<Observer["observe"]>[0], history: Parameters<Observer["observe"]>[1]) {
    this.seen.push(e.name);
    this.historyLengths.push(history.length);
  }
}

class Exploding implements Observer {
  readonly id = "exploding";
  async observe(): Promise<void> { throw new Error("observer is broken"); }
}

describe("NULL_EMITTER", () => {
  it("accepts events and does nothing, so emit sites need no null check", async () => {
    await expect(NULL_EMITTER.emit(event("run.finished", { a: 1 }))).resolves.toBeUndefined();
  });
});

describe("EventBus", () => {
  it("delivers to every subscriber", async () => {
    const a = new Recording();
    const b = new Recording();
    const bus = new EventBus().subscribe(a).subscribe(b);

    await bus.emit(event("ingest.finished", { rows: 3 }));

    expect(a.seen).toEqual(["ingest.finished"]);
    expect(b.seen).toEqual(["ingest.finished"]);
    expect(bus.observerIds()).toEqual(["recording", "recording"]);
  });

  it("hands each observer the run so far, not just the latest event", async () => {
    const recording = new Recording();
    const bus = new EventBus().subscribe(recording);

    await bus.emit(event("ingest.finished", {}));
    await bus.emit(event("uitest.finished", {}));

    expect(recording.historyLengths).toEqual([1, 2]);
  });

  it("survives a broken observer without failing the run it is measuring", async () => {
    const healthy = new Recording();
    const bus = new EventBus().subscribe(new Exploding()).subscribe(healthy);

    await expect(bus.emit(event("run.finished", {}))).resolves.toBeUndefined();
    expect(healthy.seen).toEqual(["run.finished"]);
  });
});

describe("JsonlObserver", () => {
  it("appends one line per event and creates its directory", async () => {
    const path = join(dir, "nested", "events.jsonl");
    const observer = new JsonlObserver(path);

    await observer.observe(event("ingest.finished", { rows: 1 }));
    await observer.observe(event("run.finished", { rows: 2 }));

    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!).name).toBe("run.finished");
  });
});

describe("attachObservability", () => {
  const config = (env: Record<string, string | undefined>) =>
    readConfig({ ...env, DEV_AI_USAGE_OBSERVABILITY_DIR: dir });

  /**
   * This module reaches no model at all: it records what happened to a local
   * trail and stops. So there is nothing here that an absent API key can
   * degrade, and the only switch is the one env var.
   */
  it("records locally, needing no credential of any kind", () => {
    const handle = attachObservability(config({ ANTHROPIC_API_KEY: undefined }));

    expect(handle.active).toEqual(["jsonl"]);
    expect(handle.skipped).toEqual({});
  });

  it("attaches nothing when switched off, and still returns a usable emitter", async () => {
    const handle = attachObservability(config({ DEV_AI_USAGE_OBSERVABILITY: "off" }));

    expect(handle.active).toEqual([]);
    await expect(handle.emitter.emit(event("run.finished", {}))).resolves.toBeUndefined();
    expect(existsSync(join(dir, "events.jsonl"))).toBe(false);
  });

  it("writes every event of a run to the trail, in order", async () => {
    const handle = attachObservability(config({}));

    await handle.emitter.emit(event("ingest.finished", { rows: 5 }));
    await handle.emitter.emit(event("run.finished", { derivedCostUsd30d: 1 }));

    const lines = readFileSync(join(dir, "events.jsonl"), "utf8").trim().split("\n");
    expect(lines.map((l) => (JSON.parse(l) as { name: string }).name)).toEqual([
      "ingest.finished",
      "run.finished",
    ]);
  });
});
