import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * When an import is allowed to run, which is a latency question rather than a
 * correctness one - until it isn't.
 *
 * `sync()` has two kinds of caller and only one is a timer. The Observability
 * and Trace pages fire a pass on render, so that opening either is what links
 * a brand-new session to its project; a pass that wrote a row then calls
 * `notifyLiveChange`, the open trace-tap terminal refreshes on it, and the
 * refresh is another render. That is a closed loop, and it ran as fast as the
 * machine allowed for as long as any session was writing a transcript - which
 * is exactly while someone is watching the page.
 *
 * Nothing here touches a database or a real Application: the floor is a
 * decision about whether to start a pass, and testing it against a counter is
 * what keeps it a test of that decision.
 */

const runAll = vi.fn(async () => [] as unknown[]);
const setState = vi.fn();
let syncSeconds = 900;

vi.mock("../src/app/dashboard", () => ({
  app: () => ({
    config: { get syncSeconds() { return syncSeconds; } },
    ingest: { runAll },
    writes: { setState },
  }),
}));

import { stopBackgroundSync, sync } from "../src/app/background-sync";

beforeEach(() => {
  vi.useFakeTimers();
  runAll.mockClear();
  setState.mockClear();
  syncSeconds = 900;
  stopBackgroundSync();
});

afterEach(() => {
  stopBackgroundSync();
  vi.useRealTimers();
});

describe("sync", () => {
  /**
   * The loop, in one assertion. A render asking for an import must not be
   * able to trigger the import that triggers the next render.
   */
  it("runs one pass when asked twice in a row", async () => {
    await sync();
    await sync();

    expect(runAll).toHaveBeenCalledTimes(1);
  });

  /**
   * The floor must not become "once per process". The gap it exists to close
   * is real: a session's OTLP rows are already in the table and invisible only
   * because no `session` row links them to a project yet, and only an import
   * writes that row.
   */
  it("runs again once the floor has passed", async () => {
    await sync();
    vi.advanceTimersByTime(11_000);
    await sync();

    expect(runAll).toHaveBeenCalledTimes(2);
  });

  it("does not run again just before the floor has passed", async () => {
    await sync();
    vi.advanceTimersByTime(9_000);
    await sync();

    expect(runAll).toHaveBeenCalledTimes(1);
  });

  /**
   * Off means off for this caller too. `ui-test --empty` points a server at a
   * scratch database precisely so it can render the fresh-clone state, and
   * the direct callers bypassed `startBackgroundSync`'s own gate entirely - so
   * every page render filled that database before the first check ran. A
   * switch that cannot stop the thing it names is worse than no switch.
   */
  it("runs nothing at all when importing is switched off", async () => {
    syncSeconds = 0;

    await sync();

    expect(runAll).not.toHaveBeenCalled();
    expect(setState).not.toHaveBeenCalled();
  });

  /** A caller arriving mid-pass waits on the one running, rather than
   *  starting a second that would race it for the same byte offsets. */
  it("joins a pass already in flight instead of starting another", async () => {
    let release: () => void = () => {};
    runAll.mockImplementationOnce(() => new Promise((resolve) => {
      release = () => resolve([]);
    }) as Promise<unknown[]>);

    const first = sync();
    const second = sync();
    release();
    await Promise.all([first, second]);

    expect(runAll).toHaveBeenCalledTimes(1);
  });
});
