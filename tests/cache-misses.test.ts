import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/db/Database";
import { QueryRepository } from "../src/db/QueryRepository";
import { CostCalculator } from "../src/domain/PriceTable";
import { priceTable } from "./factories";

/**
 * The lapsed-cache detector, which is the red figure on Trends.
 *
 * It is a rule over two stored columns, so the cases that matter are the ones
 * where it could accuse the reader of waste that never happened: a session's
 * unavoidable first write, one session's history leaking into another, and a
 * period boundary cutting a session off from the evidence that it had ever
 * been warm.
 */
describe("cache misses", () => {
  let db: Db;
  let queries: QueryRepository;

  const now = () => new Date("2026-09-04T12:00:00.000Z");
  const priced = (clock = now) =>
    new QueryRepository(db, clock, new CostCalculator(priceTable()));

  beforeEach(() => {
    db = Db.openMigrated(":memory:");
    queries = priced();
  });
  afterEach(() => { db.close(); });

  /** One assistant message, described by what it did with the cache. */
  const msg = (
    uuid: string,
    over: {
      session?: string;
      ts?: string;
      model?: string;
      read?: number;
      write5m?: number;
      write1h?: number;
    } = {},
  ) =>
    db.run(
      `INSERT INTO message (uuid, session_id, role, model, ts, cache_read,
        cache_create_5m, cache_create_1h, cost_usd_derived)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [uuid, over.session ?? "s1", "assistant", over.model ?? "claude-opus-5",
       over.ts ?? "2026-09-04T02:00:00.000Z", over.read ?? 0,
       over.write5m ?? 0, over.write1h ?? 0, 1],
    );

  describe("what counts as a lapse", () => {
    it("does not call a session's first write a miss", () => {
      // Nothing was cached yet, so this write was the only way to send it.
      msg("cold", { ts: "2026-09-04T02:00:00.000Z", write5m: 400_000 });

      expect(queries.cacheMisses("today")).toMatchObject({ events: 0, tokens: 0 });
    });

    it("does not call a write beside a read a miss", () => {
      // The warm case: a big read, and a small write of the new delta.
      msg("cold", { ts: "2026-09-04T02:00:00.000Z", write5m: 400_000 });
      msg("warm", { ts: "2026-09-04T02:01:00.000Z", read: 400_000, write5m: 2_000 });

      expect(queries.cacheMisses("today").events).toBe(0);
    });

    it("counts a write with no read, after the session had been reading", () => {
      msg("cold", { ts: "2026-09-04T02:00:00.000Z", write5m: 400_000 });
      msg("warm", { ts: "2026-09-04T02:01:00.000Z", read: 400_000, write5m: 2_000 });
      // Nine minutes later: the five-minute TTL has gone, and the whole prefix
      // is paid for again.
      msg("lapsed", { ts: "2026-09-04T02:10:00.000Z", write5m: 402_000 });

      expect(queries.cacheMisses("today")).toMatchObject({ events: 1, tokens: 402_000 });
    });

    it("counts each lapse separately when a session goes cold twice", () => {
      msg("cold", { ts: "2026-09-04T02:00:00.000Z", write5m: 100_000 });
      msg("warm", { ts: "2026-09-04T02:01:00.000Z", read: 100_000, write5m: 1_000 });
      msg("lapse1", { ts: "2026-09-04T02:20:00.000Z", write5m: 101_000 });
      msg("warm2", { ts: "2026-09-04T02:21:00.000Z", read: 101_000, write5m: 1_000 });
      msg("lapse2", { ts: "2026-09-04T03:00:00.000Z", write5m: 102_000 });

      expect(queries.cacheMisses("today").events).toBe(2);
    });

    /**
     * The accusation this must never make. Session B's first write is a cold
     * start whatever session A was doing, and partitioning is what stops one
     * developer's busy morning making the next session look wasteful.
     */
    it("never lets one session's warmth make another session's cold start a miss", () => {
      msg("a-cold", { session: "a", ts: "2026-09-04T02:00:00.000Z", write5m: 100_000 });
      msg("a-warm", { session: "a", ts: "2026-09-04T02:01:00.000Z", read: 100_000, write5m: 1_000 });
      msg("b-cold", { session: "b", ts: "2026-09-04T02:02:00.000Z", write5m: 100_000 });

      expect(queries.cacheMisses("today").events).toBe(0);
    });

    it("orders by timestamp, not by insertion", () => {
      // Written to the table backwards; the rule must still see the read first.
      msg("lapsed", { ts: "2026-09-04T02:10:00.000Z", write5m: 400_000 });
      msg("warm", { ts: "2026-09-04T02:01:00.000Z", read: 400_000, write5m: 2_000 });
      msg("cold", { ts: "2026-09-04T02:00:00.000Z", write5m: 400_000 });

      expect(queries.cacheMisses("today").events).toBe(1);
    });

    /**
     * The reason the window runs over the whole table before the period filter.
     * A session warm since yesterday that lapses inside today's window has all
     * its evidence outside that window, and filtering first would read the
     * lapse as a cold start and drop the most expensive rows this measures.
     */
    it("sees a session that was warm before the period began", () => {
      msg("cold", { ts: "2026-09-03T02:00:00.000Z", write5m: 400_000 });
      msg("warm", { ts: "2026-09-03T02:01:00.000Z", read: 400_000, write5m: 2_000 });
      msg("lapsed", { ts: "2026-09-04T02:00:00.000Z", write5m: 402_000 });

      expect(queries.cacheMisses("today")).toMatchObject({ events: 1, tokens: 402_000 });
    });
  });

  describe("what a lapse cost", () => {
    const lapse = (write5m: number, model?: string) => {
      msg("cold", { ts: "2026-09-04T02:00:00.000Z", write5m: 10, model });
      msg("warm", { ts: "2026-09-04T02:01:00.000Z", read: 10, model });
      msg("lapsed", { ts: "2026-09-04T02:10:00.000Z", write5m, model });
    };

    it("charges the write price less what a hit would have cost", () => {
      lapse(1_000_000);
      // Opus: $6.25/Mtok to write at the 5m TTL, $0.50/Mtok to have read it.
      expect(queries.cacheMisses("today").premiumUsd).toBeCloseTo(5.75, 6);
    });

    it("uses each model's own rates", () => {
      lapse(1_000_000, "claude-haiku-4-5");
      const premium = queries.cacheMisses("today").premiumUsd!;
      // Haiku is far cheaper than Opus, so the same lapse costs far less.
      expect(premium).toBeGreaterThan(0);
      expect(premium).toBeLessThan(5.75);
    });

    it("reports no lapse as zero events and no premium, never as $0.00 spent", () => {
      msg("cold", { ts: "2026-09-04T02:00:00.000Z", write5m: 400_000 });
      expect(queries.cacheMisses("today")).toEqual({ events: 0, tokens: 0, premiumUsd: null });
    });

    it("leaves an unpriced model out rather than counting its lapse free", () => {
      lapse(1_000_000, "<synthetic>");
      expect(queries.cacheMisses("today").events).toBe(1);
      expect(queries.cacheMisses("today").premiumUsd).toBeNull();
    });

    it("has no premium at all when no price table was wired", () => {
      lapse(1_000_000);
      const unpriced = new QueryRepository(db, now).cacheMisses("today");
      // The rule still fires - it needs no prices - but the money is unknown.
      expect(unpriced).toMatchObject({ events: 1, premiumUsd: null });
    });
  });

  describe("on the page", () => {
    it("carries the same total whether read as one figure or as a chart", () => {
      msg("cold", { ts: "2026-09-02T02:00:00.000Z", write5m: 10 });
      msg("warm", { ts: "2026-09-02T02:01:00.000Z", read: 10 });
      msg("l1", { ts: "2026-09-02T03:00:00.000Z", write5m: 1_000_000 });
      msg("w2", { ts: "2026-09-03T02:00:00.000Z", read: 10 });
      msg("l2", { ts: "2026-09-03T03:00:00.000Z", write5m: 500_000 });

      const charted = queries
        .series("month", "day")
        .reduce((n, row) => n + (row.cacheMissUsd ?? 0), 0);

      expect(charted).toBeCloseTo(queries.cacheMisses("month").premiumUsd!, 6);
    });

    it("leaves a bucket with no lapse null rather than zero", () => {
      msg("cold", { ts: "2026-09-02T02:00:00.000Z", write5m: 10 });
      msg("warm", { ts: "2026-09-02T02:01:00.000Z", read: 10 });
      msg("quiet", { ts: "2026-09-03T02:00:00.000Z", read: 10, write5m: 5 });
      msg("lapsed", { ts: "2026-09-04T02:00:00.000Z", write5m: 400_000 });

      const byDay = queries.series("month", "day");
      expect(byDay.find((r) => r.date.endsWith("-03"))?.cacheMissUsd).toBeNull();
      expect(byDay.find((r) => r.date.endsWith("-04"))?.cacheMissUsd).toBeGreaterThan(0);
    });

    it("compares against the same window one period earlier", () => {
      msg("cold", { ts: "2026-09-03T02:00:00.000Z", write5m: 10 });
      msg("warm", { ts: "2026-09-03T02:01:00.000Z", read: 10 });
      msg("yesterday", { ts: "2026-09-03T03:00:00.000Z", write5m: 900_000 });
      msg("today", { ts: "2026-09-04T02:00:00.000Z", write5m: 100_000 });

      expect(queries.totals("today").cacheMisses.tokens).toBe(100_000);
      expect(queries.previousTotals("today").cacheMisses.tokens).toBe(900_000);
    });
  });
});
