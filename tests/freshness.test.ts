import { describe, expect, it } from "vitest";
import { freshnessOf, staleAfterMinutes } from "../src/domain/freshness";
import { readConfig } from "../src/config";

/**
 * How old the numbers are.
 *
 * The cases that matter are the ones where this could reassure falsely: a
 * database that has never imported, a stamp from a clock that disagrees, and
 * the boundary where "recent" becomes "do not act on this".
 */

const now = new Date("2026-09-03T12:00:00.000Z");
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000).toISOString();

describe("freshnessOf", () => {
  /**
   * Never imported is not the same as imported long ago, and neither may
   * render as a comfortable elapsed time.
   */
  it("says never rather than inventing an age", () => {
    const f = freshnessOf(null, now, 900);

    expect(f.phrase).toBe("never");
    expect(f.minutes).toBeNull();
    expect(f.stale).toBe(true);
  });

  it("reads an unparseable stamp as unknown, not as now", () => {
    const f = freshnessOf("not a date", now, 900);

    expect(f.phrase).toBe("unknown");
    expect(f.stale).toBe(true);
  });

  it("scales the words with the age", () => {
    expect(freshnessOf(minutesAgo(0), now, 900).phrase).toBe("just now");
    expect(freshnessOf(minutesAgo(1), now, 900).phrase).toBe("1 minute ago");
    expect(freshnessOf(minutesAgo(4), now, 900).phrase).toBe("4 minutes ago");
    expect(freshnessOf(minutesAgo(90), now, 900).phrase).toBe("1 hour ago");
    expect(freshnessOf(minutesAgo(60 * 30), now, 900).phrase).toBe("yesterday");
    expect(freshnessOf(minutesAgo(60 * 24 * 5), now, 900).phrase).toBe("5 days ago");
  });

  /**
   * A database copied from another machine, or a clock that stepped back, puts
   * the stamp in the future. "in -3 minutes" reads as a bug in this code
   * rather than as the clock problem it is.
   */
  it("never reports a negative age", () => {
    const future = new Date(now.getTime() + 60 * 60_000).toISOString();

    expect(freshnessOf(future, now, 900).minutes).toBe(0);
    expect(freshnessOf(future, now, 900).phrase).toBe("just now");
  });

  /**
   * Stale is relative to what this install intends, and forgiving of one
   * missed pass - three of them, so a single slow import does not cry wolf.
   */
  it("calls figures stale only after several missed passes", () => {
    expect(staleAfterMinutes(900)).toBe(45);
    expect(freshnessOf(minutesAgo(44), now, 900).stale).toBe(false);
    expect(freshnessOf(minutesAgo(45), now, 900).stale).toBe(true);
  });

  /** A fast interval must not make a two-minute-old figure look alarming. */
  it("keeps a floor under the staleness threshold", () => {
    expect(staleAfterMinutes(60)).toBe(15);
    expect(freshnessOf(minutesAgo(5), now, 60).stale).toBe(false);
  });

  /** With the timer off there is no intended interval, so the floor is it. */
  it("still ages figures when the importer is switched off", () => {
    expect(staleAfterMinutes(0)).toBe(15);
    expect(freshnessOf(minutesAgo(200), now, 0).stale).toBe(true);
  });
});

describe("the sync interval", () => {
  it("defaults to a quarter of an hour", () => {
    expect(readConfig({}).syncSeconds).toBe(900);
  });

  it("can be switched off, which is a choice and not a zero", () => {
    expect(readConfig({ DEV_AI_USAGE_SYNC_SECONDS: "off" }).syncSeconds).toBe(0);
    expect(readConfig({ DEV_AI_USAGE_SYNC_SECONDS: "0" }).syncSeconds).toBe(0);
    expect(readConfig({ DEV_AI_USAGE_SYNC_SECONDS: "-5" }).syncSeconds).toBe(0);
  });

  it("takes a real interval, and refuses a nonsense one", () => {
    expect(readConfig({ DEV_AI_USAGE_SYNC_SECONDS: "120" }).syncSeconds).toBe(120);
    // Milliseconds pasted into a seconds field is far likelier than a genuine
    // intent to import once a decade.
    expect(readConfig({ DEV_AI_USAGE_SYNC_SECONDS: "900000" }).syncSeconds).toBe(86_400);
    expect(readConfig({ DEV_AI_USAGE_SYNC_SECONDS: "banana" }).syncSeconds).toBe(0);
  });
});
