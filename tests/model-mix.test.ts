import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/db/Database";
import type { ModelUsage } from "../src/db/QueryRepository";
import { QueryRepository } from "../src/db/QueryRepository";
import { ModelMix, shortModel } from "../src/components/ModelMix";
import { DEFAULT_PERIOD, granularityFor, periodOf } from "../src/domain/period";
import { sliceFrom } from "../src/app/dashboard";

/**
 * The model split under the cost hero, and the slice the page comes back to.
 *
 * Both answer the same kind of question - "what am I actually looking at" -
 * and both fail in the same quiet way if they get it wrong: a breakdown that
 * silently drops a model reads as a complete picture, and a remembered
 * preference that overrides a shared link changes what that link means for
 * whoever opens it.
 */
describe("modelMix", () => {
  let db: Db;
  let queries: QueryRepository;

  const now = () => new Date("2026-09-04T12:00:00.000Z");

  /** One assistant message, described by model and what it cost. */
  const msg = (
    uuid: string,
    over: { model?: string | null; cost?: number | null; output?: number; ts?: string } = {},
  ) =>
    db.run(
      `INSERT INTO message (uuid, session_id, role, model, ts, output_tokens, cost_usd_derived)
       VALUES (?,?,?,?,?,?,?)`,
      [uuid, "s1", "assistant", over.model === undefined ? "claude-opus-5" : over.model,
       over.ts ?? "2026-09-04T02:00:00.000Z", over.output ?? 100,
       over.cost === undefined ? 1 : over.cost],
    );

  beforeEach(() => {
    db = Db.openMigrated(":memory:");
    queries = new QueryRepository(db, now);
  });
  afterEach(() => { db.close(); });

  it("splits the period's cost by model, dearest first", () => {
    msg("a1", { model: "claude-sonnet-5", cost: 2, output: 50 });
    msg("a2", { model: "claude-opus-5", cost: 9, output: 300 });
    msg("a3", { model: "claude-opus-5", cost: 4, output: 120 });

    expect(queries.modelMix("today")).toEqual([
      { model: "claude-opus-5", costUsd: 13, messages: 2, outputTokens: 420 },
      { model: "claude-sonnet-5", costUsd: 2, messages: 1, outputTokens: 50 },
    ]);
  });

  /**
   * The shares have to add up to the figure above them. Both of these carry a
   * null cost, so leaving them out removes no money from the total - but
   * leaving them IN would put two rows naming no model into a model
   * breakdown, one of them Claude Code's own local notice.
   */
  it("leaves out the rows that name no model, and no money with them", () => {
    msg("a1", { model: "claude-opus-5", cost: 5 });
    msg("a2", { model: "<synthetic>", cost: null });
    msg("a3", { model: null, cost: null });

    const mix = queries.modelMix("today");
    expect(mix.map((m) => m.model)).toEqual(["claude-opus-5"]);
    expect(mix[0]!.costUsd).toBe(queries.totals("today").costUsd);
  });

  /**
   * The central rule, in the one place a model breakdown could break it. An
   * unpriced model did real work; dropping it would make the remaining shares
   * look like the whole period, and pricing it at zero would say it was free.
   */
  it("keeps an unpriced model, with a null cost rather than a zero", () => {
    msg("a1", { model: "claude-opus-5", cost: 6 });
    msg("a2", { model: "some-future-model", cost: null, output: 700 });

    const mix = queries.modelMix("today");
    const unpriced = mix.find((m) => m.model === "some-future-model");
    expect(unpriced).toBeDefined();
    expect(unpriced!.costUsd).toBeNull();
    expect(unpriced!.outputTokens).toBe(700);
  });

  it("counts only what the models answered, not what you sent", () => {
    msg("a1", { model: "claude-opus-5", cost: 1 });
    db.run(
      "INSERT INTO message (uuid, session_id, role, model, ts) VALUES (?,?,?,?,?)",
      ["u1", "s1", "user", null, "2026-09-04T02:00:00.000Z"],
    );

    expect(queries.modelMix("today")[0]!.messages).toBe(1);
    expect(queries.totals("today").messages).toBe(2);
  });

  it("shortens a dated build to the model a reader would name", () => {
    expect(shortModel("claude-haiku-4-5-20251001")).toBe("haiku-4-5");
    expect(shortModel("claude-opus-5")).toBe("opus-5");
  });
});

/**
 * The strip itself, rendered.
 *
 * The query above decides what the split counts; this decides what a reader
 * can see of it without a pointer. The two failed differently and the second
 * one is quieter: a strip that puts the money behind a hover looks complete,
 * states percentages nobody can check, and reads the same to a reviewer as one
 * that does not.
 */
describe("the model mix strip", () => {
  /** A real corpus shape: one model with nearly all of it, three with slivers. */
  const REAL: ModelUsage[] = [
    { model: "claude-opus-5", costUsd: 8740.89, messages: 54086, outputTokens: 9_000_000 },
    { model: "claude-sonnet-5", costUsd: 74.05, messages: 1882, outputTokens: 400_000 },
    { model: "claude-opus-4-7", costUsd: 4.43, messages: 18, outputTokens: 5000 },
    { model: "claude-haiku-4-5-20251001", costUsd: 0.48, messages: 26, outputTokens: 3000 },
  ];

  const render = (models: ModelUsage[], period = "this month") =>
    renderToStaticMarkup(createElement(ModelMix, { models, period }));

  /** Bar segments, which is what the widths are attached to. */
  const segmentsIn = (html: string) => html.match(/class="mix-seg /g)?.length ?? 0;

  /** Every `width:N%` the bar declared, in order. */
  const widthsIn = (html: string) =>
    [...html.matchAll(/width:([\d.]+)%/g)].map((m) => Number(m[1]));

  /**
   * The redesign, in one assertion. These figures used to live only in each
   * row's `title`, which is unreachable by touch and invisible to anyone
   * reading the page rather than probing it - so the base of every percentage
   * on the card was behind a hover.
   */
  it("prints each model's dollars on the page, not only in a tooltip", () => {
    const html = render(REAL);
    for (const usd of ["$8,740.89", "$74.05", "$4.43", "$0.48"]) {
      expect(html).toContain(`<span class="mix-usd">${usd}</span>`);
    }
  });

  /**
   * A share of 0.005% is not a share of nothing. One decimal renders it
   * "0.0%", which is the same false zero this project refuses everywhere else,
   * arrived at by rounding rather than by a missing source.
   */
  it("says a real share is under a tenth of a percent, never that it is zero", () => {
    const html = render(REAL);
    expect(html).toContain("&lt;0.1%");
    expect(html).not.toContain(">0.0%<");
  });

  it("states the shares it can, to one decimal", () => {
    const html = render(REAL);
    expect(html).toContain(">99.1%<");
    expect(html).toContain(">0.8%<");
  });

  /**
   * The central rule, in the one place a cost breakdown could break it. An
   * unpriced model did real work: dropping it would make the remaining shares
   * look like the whole period, and pricing it at zero would say it was free.
   */
  it("gives an unpriced model an em dash for its money and its share, and no segment", () => {
    const html = render([
      { model: "claude-opus-5", costUsd: 6, messages: 10, outputTokens: 100 },
      { model: "some-future-model", costUsd: null, messages: 4, outputTokens: 700 },
    ]);

    expect(html).toContain("some-future-model");
    // Two dashes: one where the dollars go, one where the share goes.
    expect(html.match(/—/g)?.length).toBe(2);
    expect(segmentsIn(html)).toBe(1);
    expect(html).toContain("1 unpriced, not drawn");
  });

  /**
   * The bar has to end where the track ends. Flooring a sliver by `min-width`
   * in CSS pushes the total past 100% and walks the last segment off the end,
   * so the floor is arithmetic and comes off the largest slice.
   */
  it("floors a sliver wide enough to see without overflowing the bar", () => {
    const widths = widthsIn(render(REAL));

    expect(widths).toHaveLength(4);
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(0.6);
    expect(widths.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    // The largest slice paid for the floor and is still overwhelmingly the bar.
    expect(widths[0]).toBeGreaterThan(97);
  });

  /**
   * Four hues separate cleanly, so the bar draws three and folds the tail. The
   * rows are not a drawing and have no such limit - a model that vanished from
   * them would be money with nothing naming it.
   */
  it("folds the bar's tail into one segment but keeps a row for every model", () => {
    const many: ModelUsage[] = ["a", "b", "c", "d", "e", "f"].map((id, i) => ({
      model: `claude-${id}`,
      costUsd: 100 - i * 10,
      messages: 10,
      outputTokens: 100,
    }));
    const html = render(many);

    expect(segmentsIn(html)).toBe(4);
    expect(html).toContain("3 more");
    for (const id of ["a", "b", "c", "d", "e", "f"]) expect(html).toContain(`>${id}<`);
  });

  /**
   * Reachable, just barely: a window holding only your own messages and Claude
   * Code's local notices has messages but no model. Vanishing would read as a
   * rendering fault rather than as an answer.
   */
  it("says so rather than vanishing when nothing named a model", () => {
    const html = render([], "yesterday");
    expect(html).toContain("no model recorded yesterday");
    expect(segmentsIn(html)).toBe(0);
  });

  /** Colour is the third channel here, so the name has to survive without it. */
  it("writes every model's name beside its mark", () => {
    const html = render(REAL);
    expect(html).toContain('class="mix-name">opus-5<');
    expect(html).toContain('class="mix-name">haiku-4-5<');
  });
});

describe("the remembered slice", () => {
  /**
   * The URL is authoritative and stays that way. A link with `?period=` in it
   * has to mean the same thing to whoever opens it as it did to whoever sent
   * it - that is the entire reason the slice lives in the query string.
   */
  it("prefers an explicit period in the URL over the remembered one", () => {
    expect(sliceFrom({ period: "today" }, "quarter.month").period).toBe("today");
  });

  it("falls back to the remembered slice when the URL says nothing", () => {
    expect(sliceFrom({}, "quarter.month")).toEqual({ period: "quarter", by: "month" });
  });

  it("falls back to the default when nothing was remembered", () => {
    expect(sliceFrom({}, undefined).period).toBe(DEFAULT_PERIOD);
  });

  /** The cookie is client-written and arrives like any other request header,
   *  so it gets the same validators the query string gets. */
  it("ignores a cookie that does not name a period", () => {
    expect(sliceFrom({}, "last-tuesday.hour").period).toBe(DEFAULT_PERIOD);
    expect(sliceFrom({}, "").period).toBe(DEFAULT_PERIOD);
    expect(sliceFrom({}, "../../etc/passwd").period).toBe(DEFAULT_PERIOD);
  });

  /**
   * A remembered bucket the period cannot support must not survive. "Today by
   * month" is a one-point chart, and a dead option is worse than no option.
   */
  it("drops a remembered bucket the period cannot support", () => {
    const slice = sliceFrom({}, "today.month");
    expect(granularityFor(periodOf(slice.period), slice.by)).toBe("hour");
  });

  /**
   * PeriodFilter drops the bucket on purpose when the period changes, so
   * granularityFor can pick the one that suits the new window. Restoring a
   * remembered bucket there would undo that, and "last 3 months by month"
   * would follow the reader into "this week".
   */
  it("does not restore a remembered bucket under a period named in the URL", () => {
    expect(sliceFrom({ period: "week" }, "quarter.month").by).toBeUndefined();
  });
});
