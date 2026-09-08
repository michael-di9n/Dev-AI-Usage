import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/db/Database";
import { QueryRepository } from "../src/db/QueryRepository";
import { BADGE_BANDS, habitBadges, type HabitInput } from "../src/domain/habitBadges";
import { PERIODS, periodOf } from "../src/domain/period";

/**
 * The habit badges.
 *
 * A badge is a judgement, so the cases that matter are the ones where it could
 * invent one: too few days to say anything, a habit that has two shapes rather
 * than a rank, and a synthetic model that never belonged to anybody.
 */

const input = (over: Partial<HabitInput> = {}): HabitInput => ({
  toolDays: 10,
  skillCalls: 0,
  subagentCalls: 0,
  distinctToolsPerDaySum: 0,
  modelDays: 10,
  multiModelDays: 0,
  ...over,
});

const badge = (badges: ReturnType<typeof habitBadges>, id: string) =>
  badges!.find((b) => b.id === id)!;

describe("habitBadges", () => {
  /**
   * The floor is gone, and this is the case it used to get wrong.
   *
   * A one-day window has one active day in its denominator, so the rate is
   * the count and the bands apply exactly. Refusing to band it told a reader
   * who had deliberately asked about one day that they had not worked enough.
   */
  it("bands a single active day", () => {
    const one = input({ toolDays: 1, modelDays: 1, skillCalls: 20, subagentCalls: 22, distinctToolsPerDaySum: 33 });

    expect(habitBadges(one)).toHaveLength(4);
    expect(badge(habitBadges(one), "skills").tone).toBe("gold");
  });

  /**
   * The row keeps its shape on an empty window, and this is the case that
   * used to take four measurements off the page.
   *
   * Picking Today before you had started work replaced the badges with a
   * sentence. You used no skills that day - that is a measurement, and it is
   * zero. The absence branch was right only while "nothing here" and "nothing
   * imported" were the same state, and the getting-started guide handles the
   * second one on its own.
   */
  it("returns all four badges for a window that recorded nothing", () => {
    const empty = habitBadges(input({ toolDays: 0, modelDays: 0 }));

    expect(empty).toHaveLength(4);
    expect(empty.map((b) => b.id)).toEqual(["skills", "subagents", "toolkit", "models"]);
    for (const b of empty) {
      // Nothing happening is not the bronze version of something happening.
      expect(["gold", "silver", "bronze"], b.id).not.toContain(b.tone);
      expect(b.measure, b.id).toBeTruthy();
    }
  });

  /**
   * The one thing a zero window must not do: divide by no days.
   *
   * "0 skills a day" over zero active days is 0/0 printed as a measurement.
   * The count is the honest figure, and the sentence says why there is no
   * rate beside it.
   */
  it("reports a count and not a rate when there were no active days", () => {
    const skills = badge(habitBadges(input({ toolDays: 0 })), "skills");

    expect(skills.measure).not.toContain("a day");
    expect(skills.why).toContain("no active day to divide by");
    expect(skills.label).toBe("No skills");
  });

  /**
   * A band on one day is only honest while it says what it divided by. The
   * figure is the same as the ranked one; the sentence beside it is what
   * stops "gold" reading as "this is how you work".
   */
  it("says a one-day band is that day's rate, not a habit", () => {
    const oneDay = badge(habitBadges(input({ toolDays: 1, skillCalls: 20 })), "skills");
    const aMonth = badge(habitBadges(input({ toolDays: 20, skillCalls: 400 })), "skills");

    expect(oneDay.why).toContain("1 active day");
    expect(oneDay.why).toContain("rather than a habit");
    // The same rate over twenty days is a habit, and must not carry the caveat.
    expect(aMonth.tone).toBe(oneDay.tone);
    expect(aMonth.why).not.toContain("rather than a habit");
  });

  it("still names every threshold, so a band can be argued with", () => {
    const skills = badge(habitBadges(input({ toolDays: 1, skillCalls: 20 })), "skills");

    for (const n of [BADGE_BANDS.skills.bronze, BADGE_BANDS.skills.silver, BADGE_BANDS.skills.gold]) {
      expect(skills.why, String(n)).toContain(String(n));
    }
  });

  /**
   * Half a window: models ran, tools did not. Each badge answers for its own
   * denominator, so the model shape is still a shape and the three tool
   * badges are still zeroes.
   */
  it("zeroes only the badges whose denominator is empty", () => {
    const badges = habitBadges(input({ toolDays: 0, modelDays: 4, multiModelDays: 3 }));

    expect(badges.map((b) => b.id)).toEqual(["skills", "subagents", "toolkit", "models"]);
    expect(badge(badges, "models").label).toBe("Adaptive");
    expect(badge(badges, "skills").label).toBe("No skills");
  });
});

describe("period spans", () => {
  it("marks today as the one window that cannot hold several days", () => {
    expect(periodOf("today").spansOneDay).toBe(true);
    for (const p of PERIODS.filter((x) => x.id !== "today")) {
      expect(p.spansOneDay, p.id).toBe(false);
    }
  });

  it("bands skills per active day, not per window", () => {
    const bands = BADGE_BANDS.skills;
    const at = (perDay: number) =>
      badge(habitBadges(input({ toolDays: 10, skillCalls: perDay * 10 })), "skills");

    expect(at(bands.gold).tone).toBe("gold");
    expect(at(bands.silver).tone).toBe("silver");
    expect(at(bands.bronze).tone).toBe("bronze");
    expect(at(0).tone).toBe("plain");
    expect(at(0).label).toBe("No skills");
    expect(at(bands.gold).label).toBe("Skill power user");
  });

  /**
   * The same twenty calls mean different things over two days and over twenty.
   * If this ever compares totals, a fortnight off quietly demotes everybody.
   */
  it("reads the same total differently over more days", () => {
    const busy = badge(habitBadges(input({ toolDays: 3, skillCalls: 60 })), "skills");
    const spread = badge(habitBadges(input({ toolDays: 60, skillCalls: 60 })), "skills");

    expect(busy.tone).toBe("gold");
    expect(spread.tone).toBe("bronze");
  });

  /** Every badge carries the arithmetic that produced it. */
  it("shows the figure and the bands it was judged against", () => {
    const skills = badge(habitBadges(input({ toolDays: 10, skillCalls: 35 })), "skills");

    expect(skills.measure).toBe("3.5 skills a day");
    expect(skills.why).toContain("35 skill calls over 10 active days");
    expect(skills.why).toContain(`${BADGE_BANDS.skills.gold}+ gold`);
  });

  /**
   * Adaptive and consistent are two shapes, not two ranks. Painting one of
   * them bronze would be this tool saying which it prefers, and it has no view.
   */
  it("keeps the model badge off the medal scale", () => {
    const adaptive = badge(habitBadges(input({ modelDays: 10, multiModelDays: 8 })), "models");
    const consistent = badge(habitBadges(input({ modelDays: 10, multiModelDays: 1 })), "models");

    expect(adaptive.label).toBe("Adaptive");
    expect(consistent.label).toBe("Consistent");
    for (const b of [adaptive, consistent]) {
      expect(["gold", "silver", "bronze"]).not.toContain(b.tone);
    }
    expect(consistent.why).toContain("Neither is better");
  });

  it("counts days that mixed models, not an average number of models", () => {
    const b = badge(habitBadges(input({ modelDays: 29, multiModelDays: 14 })), "models");

    expect(b.why).toContain("More than one model on 14 of 29 active days");
    expect(b.label).toBe("Consistent");
  });

  /**
   * A badge whose denominator is empty reports a count, not a rate. It is
   * present either way: a row of four that sometimes renders three would move
   * the other badges under the reader's eye.
   */
  it("keeps the tool badges as counts when nothing recorded a tool call", () => {
    const badges = habitBadges(input({ toolDays: 0, modelDays: 10 }));

    expect(badges.map((b) => b.id)).toEqual(["skills", "subagents", "toolkit", "models"]);
    expect(badge(badges, "toolkit").measure).toBe("no distinct tools");
  });
});

describe("QueryRepository.habits", () => {
  let db: Db;
  let queries: QueryRepository;

  beforeEach(() => {
    db = Db.openMigrated(":memory:");
    queries = new QueryRepository(db);
  });
  afterEach(() => { db.close(); });

  /** A UTC timestamp for a wall-clock hour on a local day, offset back. */
  const localAt = (offsetDays: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };

  const tool = (id: string, name: string, ts: string) =>
    db.run(
      `INSERT INTO tool_call (id, session_id, message_uuid, tool_name, ts, input_hash, input_norm)
       VALUES (?,?,?,?,?,'h','{}')`,
      [id, "s1", "m1", name, ts],
    );

  const message = (uuid: string, model: string, ts: string) =>
    db.run(
      "INSERT INTO message (uuid, session_id, role, model, ts) VALUES (?,?,?,?,?)",
      [uuid, "s1", "assistant", model, ts],
    );

  it("counts distinct tools per day, then sums - not across the window", () => {
    // Three tools every day is a broader habit than three different ones once
    // each, and a window-wide DISTINCT cannot tell those apart.
    for (const day of [0, 1, 2]) {
      for (const name of ["Bash", "Read", "Edit"]) tool(`${day}-${name}`, name, localAt(-day, 10));
    }

    expect(queries.habits("month")).toMatchObject({ toolDays: 3, distinctToolsPerDaySum: 9 });
  });

  it("separates skill calls from subagent launches", () => {
    tool("s1", "Skill", localAt(0, 9));
    tool("s2", "Skill", localAt(-1, 9));
    tool("a1", "Agent", localAt(0, 9));

    expect(queries.habits("month")).toMatchObject({ skillCalls: 2, subagentCalls: 1 });
  });

  /**
   * `<synthetic>` is Claude Code's placeholder for a message it wrote itself.
   * Counting it as a model would make a single-model day look adaptive.
   */
  it("does not let the synthetic placeholder pass for a second model", () => {
    message("a", "claude-opus-5", localAt(0, 9));
    message("b", "<synthetic>", localAt(0, 10));

    expect(queries.habits("month")).toMatchObject({ modelDays: 1, multiModelDays: 0 });
  });

  it("counts a day as mixed only when two real models ran on it", () => {
    message("a", "claude-opus-5", localAt(0, 9));
    message("b", "claude-haiku-4-5", localAt(0, 10));
    message("c", "claude-opus-5", localAt(-1, 9));

    expect(queries.habits("month")).toMatchObject({ modelDays: 2, multiModelDays: 1 });
  });

  it("reports zeros as zeros and no days as no days", () => {
    expect(queries.habits("today")).toEqual({
      toolDays: 0, skillCalls: 0, subagentCalls: 0,
      distinctToolsPerDaySum: 0, modelDays: 0, multiModelDays: 0,
    });
    // And the badges made from it are four zeroes, not an absent row.
    expect(habitBadges(queries.habits("today"))).toHaveLength(4);
  });

  /**
   * The distinction the whole Trends page turns on, and the one `SUM()`
   * cannot make on its own: it returns null both for a window with no rows
   * and for a window whose rows carry no price.
   *
   * A window with no messages is a window in which you spent nothing - a
   * measured zero, and the honest figure for a day you have not started. A
   * window whose messages are all unpriced is a gap, and has to stay null so
   * the UI draws a dash. Collapsing the two is what used to replace the whole
   * page with a "nothing recorded" panel every time the period was empty.
   */
  it("costs an empty window at zero and an unpriced one at nothing", () => {
    expect(queries.totals("today")).toMatchObject({ costUsd: 0, messages: 0 });

    // A real message with no derived cost against it: the cost is unknown,
    // which is not the same claim as zero.
    message("unpriced", "some-model-we-have-no-price-for", localAt(0, 10));
    expect(queries.totals("today")).toMatchObject({ costUsd: null, messages: 1 });
  });
});
