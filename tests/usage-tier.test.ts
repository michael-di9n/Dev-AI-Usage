import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Delta } from "../src/components/primitives";
import { Db } from "../src/db/Database";
import { QueryRepository } from "../src/db/QueryRepository";
import {
  TIER_BANDS, explainNoTier, explainTier, usageTier,
} from "../src/domain/usageTier";
import { PERIODS, granularityFor, isPeriodId, periodOf } from "../src/domain/period";

/**
 * The usage band.
 *
 * A ranking shown to the person being ranked, so the cases that matter are the
 * ones where it could invent a verdict: an empty database, a single busy
 * afternoon, and a value sitting exactly on a boundary.
 */

const { POWER_FLOOR, MEDIUM_FLOOR, MIN_ACTIVE_DAYS } = TIER_BANDS;

describe("usageTier", () => {
  /**
   * The one that matters. "Low user" before anything is imported is a
   * judgement invented out of nothing, and it is the exact class of bug this
   * project exists to avoid.
   */
  it("gives no band at all on an empty database", () => {
    expect(usageTier({ outputTokens: 0, activeDays: 0 })).toBeNull();
  });

  /**
   * The three-day floor is gone. One active day divides by one, so the rate
   * is the figure that day actually ran at - and refusing to show it told
   * someone on their first day that they had not worked enough. Zero days is
   * the only case with no denominator, and it is covered above.
   */
  it("bands a single active day", () => {
    expect(usageTier({ outputTokens: 5_000_000, activeDays: 1 })?.tier).toBe("power");
    expect(MIN_ACTIVE_DAYS).toBe(1);
  });

  it("gives no band when days exist but nothing was generated", () => {
    // Sessions that only read - no output means nothing to rank.
    expect(usageTier({ outputTokens: 0, activeDays: 30 })).toBeNull();
  });

  it("bands on output per active day, not on the total", () => {
    // Same total, different spread: 300k over 3 days is medium, over 30 is low.
    expect(usageTier({ outputTokens: 300_000, activeDays: 3 })?.tier).toBe("medium");
    expect(usageTier({ outputTokens: 300_000, activeDays: 30 })?.tier).toBe("low");
  });

  it("includes the floor in the band above it", () => {
    expect(usageTier({ outputTokens: POWER_FLOOR * 3, activeDays: 3 })?.tier).toBe("power");
    expect(usageTier({ outputTokens: (POWER_FLOOR - 1) * 3, activeDays: 3 })?.tier).toBe("medium");
    expect(usageTier({ outputTokens: MEDIUM_FLOOR * 3, activeDays: 3 })?.tier).toBe("medium");
    expect(usageTier({ outputTokens: (MEDIUM_FLOOR - 1) * 3, activeDays: 3 })?.tier).toBe("low");
  });

  it("carries the figure it judged on, so the band can be argued with", () => {
    const verdict = usageTier({ outputTokens: 1_500_000, activeDays: 3 })!;
    expect(verdict).toMatchObject({ tier: "power", outputPerDay: 500_000, activeDays: 3 });
    expect(verdict.label).toBe("Power user");
  });
});

describe("the badge explains itself", () => {
  it("names the figure, the window, the bands, and what it is not", () => {
    const text = explainTier(usageTier({ outputTokens: 1_500_000, activeDays: 3 })!, 30);

    expect(text).toContain("500,000 output tokens per active day");
    expect(text).toContain("3 active days in the last 30");
    // Nobody should mistake a local heuristic for a quota or an account tier.
    expect(text).toContain("not an Anthropic tier");
  });

  it("says why there is no band rather than showing nothing", () => {
    expect(explainNoTier(0, 30)).toContain("nothing to rank");
    // No floor left to quote at anyone: days with no output is the other case.
    expect(explainNoTier(2, 30)).toContain("no rate to rank");
  });
});

describe("QueryRepository.usageWindow", () => {
  let db: Db;

  beforeEach(() => { db = Db.openMigrated(":memory:"); });
  afterEach(() => { db.close(); });

  const message = (uuid: string, ts: string, output: number) =>
    db.run(
      `INSERT INTO message (uuid, session_id, role, ts, output_tokens) VALUES (?,?,?,?,?)`,
      [uuid, "s1", "assistant", ts, output],
    );

  /**
   * A UTC timestamp for a given hour of the reader's LOCAL today.
   *
   * Built through the local calendar rather than by pasting an hour onto a UTC
   * date. Two UTC times on the same UTC day can fall on different local days -
   * on UTC+10, 09:00Z and 17:00Z are Thursday evening and Friday morning - so
   * a fixture written in UTC would assert a different thing depending on where
   * the test runs.
   */
  const localHour = (hour: number) => {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  it("reports nothing on a fresh database", () => {
    expect(new QueryRepository(db).usageWindow(30)).toEqual({ outputTokens: 0, activeDays: 0 });
  });

  /** Two messages on one day is one active day, not two. */
  it("counts distinct days, not messages", () => {
    message("a", localHour(9), 100);
    message("b", localHour(17), 200);

    expect(new QueryRepository(db).usageWindow(30)).toEqual({
      outputTokens: 300,
      activeDays: 1,
    });
  });

  /** A quiet day is absent from the table, so it must not be averaged in. */
  it("ignores days outside the window", () => {
    message("recent", localHour(9), 500);
    message("ancient", "2020-01-01T09:00:00.000Z", 9_999);

    expect(new QueryRepository(db).usageWindow(30)).toEqual({
      outputTokens: 500,
      activeDays: 1,
    });
  });
});

describe("periods", () => {
  it("offers today, this week, this month and three months, in that order", () => {
    expect(PERIODS.map((p) => p.id)).toEqual(["today", "week", "month", "quarter"]);
  });

  /**
   * A single day cannot be bucketed into weeks: offering it would render a
   * one-point chart and call it a trend. Today goes the other way - a day
   * bucketed by day IS that one point, so hours are the only bucket that shows
   * it any shape, and the only one offered.
   */
  it("only offers a bucket size where it changes the answer", () => {
    expect(periodOf("today").granularities).toEqual(["hour"]);
    expect(periodOf("week").granularities).toEqual(["day"]);
    expect(periodOf("month").granularities).toEqual(["day", "week"]);
    expect(periodOf("quarter").granularities).toEqual(["day", "week", "month"]);
  });

  it("falls back to the period's own default for a bucket it cannot support", () => {
    // Someone on "last 3 months by month" who narrows to today must not get
    // an error or a single dot.
    expect(granularityFor(periodOf("today"), "month")).toBe("hour");
    expect(granularityFor(periodOf("quarter"), "month")).toBe("month");
    expect(granularityFor(periodOf("quarter"), undefined)).toBe("week");
    expect(granularityFor(periodOf("month"), "nonsense")).toBe("day");
  });

  it("recognises only real period ids", () => {
    expect(isPeriodId("week")).toBe(true);
    expect(isPeriodId("fortnight")).toBe(false);
    expect(isPeriodId(7)).toBe(false);
  });
});

describe("period windows in SQL", () => {
  let db: Db;
  let queries: QueryRepository;

  beforeEach(() => {
    db = Db.openMigrated(":memory:");
    queries = new QueryRepository(db);
  });
  afterEach(() => { db.close(); });

  const message = (uuid: string, ts: string, output: number, cost: number) =>
    db.run(
      `INSERT INTO message (uuid, session_id, role, ts, output_tokens, cost_usd_derived)
       VALUES (?,?,?,?,?,?)`,
      [uuid, `s-${uuid}`, "assistant", ts, output, cost],
    );

  /**
   * A timestamp `offsetDays` back, nudged `backOffSeconds` earlier.
   *
   * The nudge matters for the previous-window case. That window's upper bound
   * is exclusive and sits exactly one period back, so a row written at
   * precisely "one day ago" can land on the boundary to the millisecond and be
   * excluded - which is correct behaviour and a racy assertion. Placing the
   * row a second inside the window tests the window rather than the tie.
   */
  /**
   * A UTC timestamp for a wall-clock moment on the reader's LOCAL calendar.
   *
   * The whole point of these cases is which local day a UTC instant lands on,
   * so the fixture has to be written the way a person reads a clock and
   * converted on the way in - never the other way round.
   */
  const localAt = (offsetDays: number, hour: number, minute = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  const iso = (offsetDays: number, backOffSeconds = 0) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - offsetDays);
    d.setUTCSeconds(d.getUTCSeconds() - backOffSeconds);
    return d.toISOString();
  };

  /**
   * The pair of rules this project exists to protect, at the exact spot they
   * are easiest to confuse.
   *
   * `SUM()` over nothing is NULL in SQLite and `Number(null)` is 0, so this is
   * where a fabricated $0.00 would come from - and also where a real zero
   * would get thrown away as if it were a gap. The two windows below are
   * different answers and must not render the same:
   *
   *   no messages at all -> you spent nothing. $0.00, and the page keeps
   *     every figure it can compute, all of them zero.
   *   messages with no price -> we do not know what they cost. Null, and the
   *     UI draws a dash.
   *
   * This test used to assert null for both. That is what took the whole Trends
   * page down to a "nothing recorded" panel whenever the selected period was
   * empty, which is the bug the second half now guards.
   */
  it("costs a period with no messages at zero", () => {
    const totals = queries.totals("today");
    expect(totals.costUsd).toBe(0);
    expect(totals.messages).toBe(0);
  });

  it("costs a period whose messages carry no price at nothing at all", () => {
    db.run(
      `INSERT INTO message (uuid, session_id, role, ts, output_tokens) VALUES (?,?,?,?,?)`,
      ["unpriced", "s-unpriced", "assistant", iso(0), 100],
    );

    const totals = queries.totals("today");
    expect(totals.costUsd).toBeNull();
    expect(totals.messages).toBe(1);
  });

  it("scopes today to today alone", () => {
    message("now", iso(0), 100, 1);
    message("yesterday", iso(1), 999, 9);

    expect(queries.totals("today")).toMatchObject({ outputTokens: 100, messages: 1 });
  });

  /**
   * The comparison must be like-for-like. Yesterday's rows belong to the
   * previous window, today's do not - otherwise a delta on the 1st of the
   * month invents a collapse.
   */
  it("compares against the same span one period earlier", () => {
    message("now", iso(0), 100, 1);
    message("yesterday", iso(1, 1), 40, 2);

    expect(queries.previousTotals("today")).toMatchObject({ outputTokens: 40 });
    expect(queries.totals("today")).toMatchObject({ outputTokens: 100 });
  });

  it("buckets a quarter by day, week and month without losing a message", () => {
    for (const offset of [0, 1, 8, 20, 40]) message(`m${offset}`, iso(offset), 10, 1);

    const byDay = queries.series("quarter", "day");
    const byWeek = queries.series("quarter", "week");
    const byMonth = queries.series("quarter", "month");

    const sum = (rows: { outputTokens: number }[]) => rows.reduce((n, r) => n + r.outputTokens, 0);
    // Regrouping must never change the total, only how it is split.
    expect(sum(byDay)).toBe(50);
    expect(sum(byWeek)).toBe(50);
    expect(sum(byMonth)).toBe(50);
    expect(byWeek.length).toBeLessThanOrEqual(byDay.length);
    expect(byMonth.length).toBeLessThanOrEqual(byWeek.length);
  });

  /** Every bucket key is a sortable ISO date, whatever the granularity, so the
   *  chart never has to know which bucket it was handed. */
  it("keys every bucket with an ISO date", () => {
    message("a", iso(0), 10, 1);
    for (const g of ["day", "week", "month"] as const) {
      for (const row of queries.series("quarter", g)) {
        expect(row.date, `${g} bucket`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it("lands every week bucket on a Monday", () => {
    for (const offset of [0, 3, 9, 15]) message(`w${offset}`, iso(offset), 10, 1);

    for (const row of queries.series("quarter", "week")) {
      const day = new Date(`${row.date}T00:00:00Z`).getUTCDay();
      expect(day, `${row.date} should be a Monday`).toBe(1);
    }
  });

  /**
   * The hour bucket is the one key that is not a bare date, because an hour is
   * not a day and an axis that labelled it as one would be lying. It stays
   * sortable as a string, which is all the chart needs of it.
   */
  it("keys an hour bucket with a sortable hour, not a date", () => {
    message("h", localAt(0, 14), 10, 1);

    const rows = queries.series("today", "hour");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:00$/);
    expect(rows[0]!.date.slice(11)).toBe("14:00");
  });

  /**
   * A period with one bucket in it is padded backwards to seven.
   *
   * Two or three points is a chart with no shape, and the periods that
   * produce them - today before the day has got going, this week on a Monday
   * - are the commonest ones to look at. The padding is bounded: seven
   * buckets before the window start, so an hourly chart cannot reach back
   * three weeks for its seventh point.
   *
   * The added buckets carry `beforePeriod`, because they are real
   * measurements from outside the slice the rest of the page is scoped to. A
   * reader adding up the chart's own table would otherwise disagree with the
   * total above it.
   */
  it("pads a one-bucket period back to seven, and says which are not in it", () => {
    message("today", localAt(0, 14), 10, 1);
    // Inside the seven-hour lookback from local midnight.
    for (const hour of [18, 19, 20, 21, 22, 23]) message(`y${hour}`, localAt(-1, hour), 10, 1);
    // Outside it, and must not be reached for.
    message("far", localAt(-1, 3), 10, 1);

    const rows = queries.series("today", "hour");

    expect(rows).toHaveLength(7);
    expect(rows.filter((r) => r.beforePeriod)).toHaveLength(6);
    expect(rows.at(-1)).toMatchObject({ beforePeriod: false });
    expect(rows.at(-1)!.date.slice(11)).toBe("14:00");
    // The totals stay the period's own. Only the chart looks further back.
    expect(queries.totals("today").outputTokens).toBe(10);
  });

  /** Regrouping splits a total differently. It must never change it. */
  it("splits today into hours without losing a message", () => {
    for (const hour of [1, 9, 9, 23]) message(`h${hour}-${Math.random()}`, localAt(0, hour), 10, 1);

    const byHour = queries.series("today", "hour");
    const sum = byHour.reduce((n, r) => n + r.outputTokens, 0);

    expect(sum).toBe(40);
    // 01:00, 09:00 (twice) and 23:00 - three buckets, four messages.
    expect(byHour).toHaveLength(3);
    expect(queries.totals("today").outputTokens).toBe(40);
  });

  /**
   * The bug the local boundary exists to prevent.
   *
   * Late-evening work on UTC+10 is already tomorrow in UTC. Bounded in UTC it
   * vanishes from "today" while the developer is still doing it, which is the
   * single most visible way this dashboard could be wrong.
   */
  it("counts work done late this evening as today", () => {
    message("late", localAt(0, 23, 30), 10, 1);
    message("early", localAt(0, 0, 30), 20, 2);
    message("lastNight", localAt(-1, 23, 30), 999, 9);

    expect(queries.totals("today")).toMatchObject({ outputTokens: 30, messages: 2 });
  });

  /**
   * 31 March minus one month is 31 February, which both JavaScript and SQLite
   * normalise forward to 3 March - a date inside the month being compared
   * against. Clamped, the two windows stay disjoint.
   */
  it("keeps the previous month disjoint from this one on a 31st", () => {
    const onThe31st = new Date(2026, 2, 31, 12, 0, 0);
    const clocked = new QueryRepository(db, () => onThe31st);

    message("marchLate", "2026-03-30T02:00:00.000Z", 500, 5);
    message("febLate", "2026-02-26T02:00:00.000Z", 40, 4);

    // The comparison window must not reach into March.
    expect(clocked.previousTotals("month")).toMatchObject({ outputTokens: 40, messages: 1 });
    expect(clocked.totals("month")).toMatchObject({ outputTokens: 500, messages: 1 });
  });
});

describe("Delta formatting", () => {
  const render = (from: number | null, to: number | null, format: "usd" | "count" = "count") =>
    renderToStaticMarkup(createElement(Delta, { from, to, against: "last month", format }));

  /**
   * A four-digit percentage is arithmetically true and useless. Off a small
   * base - a quiet first week, a new machine - large ratios are the normal
   * case here, so the shape has to stay readable at 80x.
   */
  it("switches to a multiplier past ten-fold", () => {
    expect(render(29, 2324)).toContain("×80");
    expect(render(29, 2324)).not.toContain("%");
  });

  it("keeps a percentage inside the readable range", () => {
    expect(render(100, 150)).toContain("50%");
    expect(render(100, 90)).toContain("10%");
  });

  it("shows a dash rather than dividing by a period with nothing in it", () => {
    expect(render(0, 500)).toContain("—");
    expect(render(null, 500)).toContain("—");
    expect(render(100, null)).toContain("—");
  });

  /**
   * A percentage with no base is the shape of a claim, not of evidence. The
   * figure being compared against is on screen, not only in a title, because a
   * title needs a pointer and half the readers of this page have not got one.
   */
  it("shows the figure it is comparing against, and names the window", () => {
    expect(render(1983.44, 2463.11, "usd")).toContain("vs $1,983.44 last month");
    // Compact, because this sits on a tile's sub-line.
    expect(render(3_405_221, 4_000_000)).toContain("vs 3.4M last month");
  });

  /** Even with nothing to compare against, the reader is told what was meant. */
  it("names the window when there is no figure for it", () => {
    expect(render(null, 500)).toContain("vs last month");
    expect(render(null, 500)).toContain("Nothing recorded last month");
  });

  /**
   * Direction is stated, and now coloured - but with metals, which carry no
   * verdict. Red and green would; spending less is not winning.
   */
  it("states direction with an arrow, and colours it without judging it", () => {
    expect(render(100, 150)).toContain("↑");
    expect(render(150, 100)).toContain("↓");
    expect(render(100, 100)).toContain("→");

    expect(render(100, 150)).toContain('class="delta rise"');
    expect(render(150, 100)).toContain('class="delta fall"');
    // No sentiment vocabulary, in either the class names or the palette.
    expect(render(100, 150)).not.toMatch(/good|bad|success|danger|positive|negative/);
  });

  /**
   * The colour is the second channel, never the only one. Gold and bronze sit
   * at nearly the same luminance, so a greyscale reader has to be able to get
   * the direction from the glyph alone.
   */
  it("never leaves direction to colour alone", () => {
    for (const [from, to] of [[100, 150], [150, 100], [100, 100]] as const) {
      expect(render(from, to)).toMatch(/[↑↓→]/);
    }
  });

  /** The exact figures stay reachable without hovering anything. */
  it("carries both raw figures in its title", () => {
    expect(render(29, 2324)).toContain("29 last month, 2,324 now");
  });
});
