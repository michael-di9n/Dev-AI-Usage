import type { HabitInput } from "../domain/habitBadges";
import { bucketLookback, previousWindowOf, rollingDays, windowOf, type Granularity, type PeriodId } from "../domain/period";
import type { CostCalculator } from "../domain/PriceTable";
import { ZERO_USAGE } from "../domain/types";
import type { TraceBlockRow, TraceMessageRow, TraceSpanRow } from "../domain/types";
import type { Db } from "./Database";

/**
 * The bucket expression for each granularity.
 *
 * A fixed table keyed by a validated union, never interpolated user input -
 * ids are parsed against `granularityFor` before they reach here, and a value
 * that is not in the table cannot index it.
 *
 * Every one converts to `localtime` first. The stored `ts` is UTC, so grouping
 * on the raw string buckets a reader on UTC+10 into somebody else's days, and
 * into plainly wrong hours. Unlike the period bounds, this cannot be
 * precomputed in JavaScript - it is a per-row grouping key - but it only ever
 * runs over rows the indexed `ts >= ?` bound has already selected.
 *
 * The week expressions land on Monday. SQLite's `%w` is 0 for Sunday, so
 * `(%w + 6) % 7` is "days since Monday", which is the shift that gets there
 * without a separate case for Sundays.
 */
const LOCAL_MONDAY_SHIFT = "((CAST(strftime('%w', ts, 'localtime') AS INTEGER) + 6) % 7)";

const BUCKET: Record<Granularity, string> = {
  // 'YYYY-MM-DDTHH:00'. Longer than the others and not a bare date, which is
  // deliberate: an hour bucket is a different kind of key and the chart's axis
  // labels switch on exactly that.
  hour: "strftime('%Y-%m-%dT%H:00', ts, 'localtime')",
  day: "date(ts, 'localtime')",
  week: `date(ts, 'localtime', '-' || ${LOCAL_MONDAY_SHIFT} || ' days')`,
  // The first of the month, so a bucket key is always a sortable ISO date.
  month: "strftime('%Y-%m-01', ts, 'localtime')",
};

/** The reader's local calendar day, for counting days that had any work. */
const LOCAL_DAY = "date(ts, 'localtime')";

/**
 * How many buckets a chart is padded back to when the period holds fewer.
 *
 * Seven, because two or three points is a chart with no shape in it and the
 * periods that produce them - today before the day has got going, this week
 * on a Monday - are the commonest ones to look at. Not larger: every bucket
 * past the period is a measurement from outside the slice the rest of the
 * page is scoped to, and the padding is there to give a lone point some
 * context, not to become a second period filter.
 */
export const MIN_CHART_POINTS = 7;

export interface DailyUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheCreate: number;
  thinkingTokens: number;
  costUsd: number | null;
  /** What lapsed caches cost this bucket, over a hit. Null on the same terms. */
  cacheMissUsd: number | null;
  messages: number;
  /**
   * True for a bucket that sits before the selected period.
   *
   * A chart is padded back to `MIN_CHART_POINTS` when the period alone does
   * not hold that many buckets, so these are real measurements from outside
   * the slice everything else on the page is scoped to. They are flagged
   * rather than blended in, because a reader adding up the chart's own table
   * would otherwise disagree with the total above it - which is exactly the
   * failure the single period filter exists to prevent.
   */
  beforePeriod: boolean;
}

export interface PeriodTotals {
  /** Null when the period holds no priced messages at all. Never 0. */
  costUsd: number | null;
  /** Every lapsed cache in the period, and what the lapses cost. */
  cacheMisses: CacheMisses;
  outputTokens: number;
  thinkingTokens: number;
  cacheRead: number;
  cacheCreate: number;
  messages: number;
  sessions: number;
  activeDays: number;
}

/**
 * Context that had to be written to cache again because the cache had gone
 * cold - the five-minute TTL lapsing while nobody was typing.
 *
 * Counted, not judged. Stepping away mid-session is a normal thing to do and
 * this says what it cost, never that it was a mistake.
 */
export interface CacheMisses {
  /** How many times a warm cache had gone cold and been paid for again. */
  events: number;
  /** Tokens re-written because of them. */
  tokens: number;
  /**
   * Write price minus read price for those tokens: the money the lapse cost.
   * Null when the period holds no priced miss at all. Never 0.
   */
  premiumUsd: number | null;
}

export interface ProjectUsage {
  project: string;
  sessions: number;
  costUsd: number | null;
  outputTokens: number;
  cacheRead: number;
}

export interface ModelUsage {
  model: string;
  /** Null when the price table has no rate for this model. Never 0. */
  costUsd: number | null;
  messages: number;
  outputTokens: number;
}

export interface SignalRow {
  kind: string;
  severity: string;
  scope: string;
  scopeId: string;
  evidence: Record<string, unknown>;
}

/** One row in the trace page's session picker. */
export interface TraceableSession {
  sessionId: string;
  projectPath: string | null;
  startedAt: string;
  endedAt: string;
  blocks: number;
  /** Null when no message in the run had a priced model. Never a zero. */
  costUsd: number | null;
  toolCalls: number;
}

/** One run's usage, split by model so the parts can be priced. */
export interface SessionUsageRow {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreate5mTokens: number;
  cacheCreate1hTokens: number;
  thinkingTokens: number;
}

/** Everything one session needs to be drawn as a tree. Rows, not a shape - the
 *  shape is `buildTrace`'s job, and it is pure so it can be tested without this. */
export interface TraceRows {
  messages: TraceMessageRow[];
  blocks: TraceBlockRow[];
  /** tool_use id → hook-measured milliseconds. Empty until exercise 02 is done. */
  toolDurations: Map<string, number>;
  toolNames: Map<string, string>;
  spans: TraceSpanRow[];
}

export type { TraceBlockRow, TraceMessageRow, TraceSpanRow } from "../domain/types";

export interface OtelSummary {
  events: number;
  metrics: number;
  sessions: number;
  /** Null when nothing has ever arrived. Never a zero-length string. */
  lastSeen: string | null;
}

/**
 * Spans specifically, which `otelSummary` does not count.
 *
 * A separate reading because spans are what tier 2 buys and the other two
 * signals are not: a receiver with thousands of events and no spans is the
 * exact state `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA` being unset produces, and
 * folding spans into the same total would hide it.
 */
export interface OtelSpanSummary {
  spans: number;
  /** Spans that carry a measured duration. Never coalesced from a null. */
  timed: number;
  lastSeen: string | null;
}

/** Events whose text came through, rather than arriving as `<REDACTED>`. */
export interface ContentReceived {
  prompts: number;
  replies: number;
}

export interface OtelEventLine {
  ts: string;
  name: string;
  sessionId: string | null;
  requestId: string | null;
  attrs: Record<string, string>;
}

export interface OtelKind {
  name: string;
  count: number;
  lastSeen: string;
}

export interface OtelMetricRollup {
  name: string;
  points: number;
  total: number;
  latest: number;
  lastSeen: string;
}

export interface HookKind {
  event: string;
  count: number;
  /** Null when every row of this kind predates the `spooled_at` stamp. */
  lastSeen: string | null;
  sessions: number;
}

export interface ToolDuration {
  toolName: string;
  timed: number;
  p50Ms: number;
  p90Ms: number;
  totalMs: number;
}

export interface SecondOpinion {
  sessionId: string;
  derivedUsd: number;
  reportedUsd: number;
}

/**
 * Owns every read. Kept apart from IngestRepository so the write path and the
 * question-answering path can change independently - the UI adds questions far
 * more often than the ingest adds tables.
 */
export class QueryRepository {
  /**
   * `now` is injected so the period boundaries are testable without waiting
   * for a calendar to turn over. It defaults to the real clock, which is the
   * only thing this class reads that is not the database.
   *
   * `costs` prices what a lapsed cache cost, and its absence renders an em
   * dash rather than a zero. That figure is worked out at read time instead of
   * being stored beside `cost_usd_derived` at ingest, and that is not a style
   * choice: Claude Code expires transcripts on its own schedule, so rows sit
   * in this database long after their source file is gone. A new cost column
   * could never be filled in for those rows, and a column that is NULL across
   * most of the history sums to a figure that looks real and is not. The
   * tokens are already stored per row and the rates are a table, so the
   * arithmetic can happen now and cover every row ever ingested.
   */
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
    private readonly costs: CostCalculator | null = null,
  ) {}

  /**
   * The lapsed-cache scan, as a rule anyone can read.
   *
   * A miss is a message that wrote to the cache while reading nothing back, in
   * a session that had already read from it. On a warm cache every turn shows
   * a large read beside a small write of the new delta; when the five-minute
   * TTL lapses, the read drops to nothing and the whole prefix is written
   * again. The first cold write in a session is the unavoidable cold start and
   * is not a miss - `prior_read > 0` is what excludes it.
   *
   * The window deliberately runs over the whole table before the period filter
   * is applied. A session that was warm yesterday and lapsed inside today's
   * window has its history outside that window, and filtering first would read
   * the lapse as a cold start and silently drop the most expensive rows this
   * measures.
   */
  private missRows(
    bucket: string | null,
    predicate: string,
    params: unknown[],
  ): Record<string, unknown>[] {
    return this.db.all<Record<string, unknown>>(
      `WITH ordered AS (
         SELECT ts, model, cache_read, cache_create_5m, cache_create_1h,
                MAX(cache_read) OVER (
                  PARTITION BY session_id ORDER BY ts
                  ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                ) AS prior_read
           FROM message
          WHERE model IS NOT NULL
       )
       SELECT ${bucket === null ? "" : `${bucket} AS date,`} model,
              COUNT(*)             AS events,
              SUM(cache_create_5m) AS create_5m,
              SUM(cache_create_1h) AS create_1h
         FROM ordered
        WHERE cache_create_5m + cache_create_1h > 0
          AND cache_read = 0
          AND prior_read > 0
          AND ${predicate}
        GROUP BY ${bucket === null ? "model" : "date, model"}`,
      params,
    );
  }

  /** One grouped miss row, priced. Null for a model the price table lacks. */
  private missPremium(row: Record<string, unknown>): number | null {
    if (!this.costs) return null;
    return this.costs.cacheMissPremiumOf(
      row.model === null || row.model === undefined ? null : String(row.model),
      { create5m: Number(row.create_5m ?? 0), create1h: Number(row.create_1h ?? 0) },
    );
  }

  /**
   * Every lapsed cache in the period.
   *
   * Events and tokens are counts, and are genuinely zero when nothing lapsed.
   * The premium is a price, so it is null when nothing in the period could be
   * priced - a model missing from the price table is left out rather than
   * counted free, exactly as SUM() leaves out a NULL cost_usd_derived.
   */
  cacheMisses(period: PeriodId): CacheMisses {
    return this.cacheMissesWhere("ts >= ?", [this.bounds(period).from]);
  }

  private cacheMissesWhere(predicate: string, params: unknown[]): CacheMisses {
    let events = 0;
    let tokens = 0;
    let premiumUsd: number | null = null;

    for (const row of this.missRows(null, predicate, params)) {
      events += Number(row.events ?? 0);
      tokens += Number(row.create_5m ?? 0) + Number(row.create_1h ?? 0);
      const premium = this.missPremium(row);
      if (premium === null) continue;
      premiumUsd = (premiumUsd ?? 0) + premium;
    }
    return { events, tokens, premiumUsd };
  }

  /**
   * The same premium, bucketed for the chart.
   *
   * Grouped by bucket and model in one query rather than a query per bucket:
   * the rates differ by model, and a quarter of days would otherwise be ninety
   * round trips for arithmetic that fits in a map.
   */
  private missSeries(
    period: PeriodId,
    granularity: Granularity,
    /** Where to start looking. Earlier than the period when the chart is
     *  padded backwards, so the added buckets carry their own figure. */
    from = this.bounds(period).from,
  ): Map<string, number> {
    const totals = new Map<string, number>();
    if (!this.costs) return totals;

    const rows = this.missRows(BUCKET[granularity], "ts >= ?", [from]);
    for (const row of rows) {
      const premium = this.missPremium(row);
      if (premium === null) continue;
      const key = String(row.date);
      totals.set(key, (totals.get(key) ?? 0) + premium);
    }
    return totals;
  }

  /** The period's local bounds, as the ISO strings `ts` is stored in. */
  private bounds(period: PeriodId): { from: string; to: string } {
    const w = windowOf(period, this.now());
    return { from: w.from.toISOString(), to: w.to.toISOString() };
  }

  /**
   * The series behind the charts, bucketed by hour, day, week or month.
   *
   * `date` is always the first instant of the bucket as an ISO date, whatever
   * the granularity, so the axis stays sortable and the chart does not need to
   * know which bucket it was handed.
   *
   * Padded backwards when the period holds fewer than `MIN_CHART_POINTS`
   * buckets. Two or three points is a chart with no shape in it, and the
   * periods that produce them are the commonest ones to look at: today before
   * the day has got going, or this week on a Monday. So the query falls back
   * to the most recent `MIN_CHART_POINTS` buckets that have data, whether or
   * not they are inside the period, and marks the ones that are not.
   *
   * The buckets it adds are the ones that *have data* rather than the ones
   * that come next in the calendar. That matches how the chart already spaces
   * its points - by index, not by time - so nothing about the axis changes.
   */
  series(period: PeriodId, granularity: Granularity, minPoints = MIN_CHART_POINTS): DailyUsage[] {
    const from = this.bounds(period).from;
    const inPeriod = this.seriesRows(granularity, "WHERE ts >= ?", [from], null);
    if (inPeriod.length >= minPoints) return this.withMisses(inPeriod, period, granularity);

    /*
     * The padded query, and it has a floor: `minPoints` buckets before the
     * window start, in the reader's own calendar. Without one this grouped
     * the whole corpus - a full scan, and an hourly chart could reach back
     * three weeks for its seventh bucket and label it "18:00" beside today's.
     * With one it binds an instant and the index on `message(ts)` applies.
     *
     * Fewer than `minPoints` can still come back, and that is the honest
     * answer: it means there are not that many recent buckets with anything
     * in them.
     */
    const floor = bucketLookback(windowOf(period, this.now()).from, granularity, minPoints);
    const padded = this
      .seriesRows(granularity, "WHERE ts >= ?", [floor.toISOString()], minPoints)
      .reverse();
    return this.withMisses(padded.length > inPeriod.length ? padded : inPeriod, period, granularity);
  }

  /**
   * One bucketed aggregate. `limit` takes the newest buckets and is null for
   * the whole predicate.
   *
   * `in_period` is decided per bucket by its earliest row: a window boundary
   * is always a bucket boundary too - local midnight for hours and days, a
   * local Monday for weeks, the 1st for months - so a bucket is either wholly
   * inside the period or wholly outside it and cannot straddle.
   */
  private seriesRows(
    granularity: Granularity,
    predicate: string,
    params: unknown[],
    limit: number | null,
  ): DailyUsage[] {
    const rows = this.db.all<Record<string, unknown>>(
      `SELECT ${BUCKET[granularity]} AS date,
              SUM(input_tokens)    AS input_tokens,
              SUM(output_tokens)   AS output_tokens,
              SUM(cache_read)      AS cache_read,
              SUM(cache_create_5m + cache_create_1h) AS cache_create,
              SUM(thinking_tokens) AS thinking_tokens,
              SUM(cost_usd_derived) AS cost_usd,
              COUNT(*)             AS messages,
              MIN(ts)              AS first_ts
         FROM message
         ${predicate}
        GROUP BY date ORDER BY date ${limit === null ? "" : "DESC LIMIT ?"}`,
      limit === null ? params : [...params, limit],
    );

    return rows.map((r) => ({
      date: String(r.date),
      inputTokens: Number(r.input_tokens ?? 0),
      outputTokens: Number(r.output_tokens ?? 0),
      cacheRead: Number(r.cache_read ?? 0),
      cacheCreate: Number(r.cache_create ?? 0),
      thinkingTokens: Number(r.thinking_tokens ?? 0),
      costUsd: r.cost_usd === null ? null : Number(r.cost_usd),
      cacheMissUsd: null,
      messages: Number(r.messages ?? 0),
      // Filled in by `withMisses`, which knows the period.
      beforePeriod: false,
      firstTs: String(r.first_ts ?? ""),
    })) as (DailyUsage & { firstTs: string })[];
  }

  /**
   * Attaches the lapsed-cache figure and the out-of-period flag.
   *
   * The miss series is looked up over the same buckets the rows came back
   * with rather than over the period, so a padded chart's earlier buckets
   * carry their own lapse cost instead of a null that would read as "no
   * lapses here".
   */
  private withMisses(
    rows: DailyUsage[],
    period: PeriodId,
    granularity: Granularity,
  ): DailyUsage[] {
    const from = this.bounds(period).from;
    const oldest = rows[0] as (DailyUsage & { firstTs?: string }) | undefined;
    const misses = this.missSeries(period, granularity, oldest?.firstTs || from);


    return rows.map((row) => {
      const { firstTs, ...rest } = row as DailyUsage & { firstTs?: string };
      return {
        ...rest,
        // `?? null` and not `?? 0`. A bucket with no lapse and a bucket whose
        // only model the price table lacks both have no figure here, and
        // neither is the claim that a lapse cost nothing.
        cacheMissUsd: misses.get(row.date) ?? null,
        beforePeriod: (firstTs ?? "") !== "" && firstTs! < from,
      };
    });
  }

  byProject(period: PeriodId, limit = 12): ProjectUsage[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT COALESCE(s.project_path, 'unknown') AS project,
                COUNT(DISTINCT s.session_id)  AS sessions,
                SUM(m.cost_usd_derived)       AS cost_usd,
                SUM(m.output_tokens)          AS output_tokens,
                SUM(m.cache_read)             AS cache_read
           FROM session s JOIN message m ON m.session_id = s.session_id
          WHERE m.ts >= ?
          GROUP BY project ORDER BY cost_usd DESC NULLS LAST LIMIT ?`,
        [this.bounds(period).from, limit],
      )
      .map((r) => ({
        project: String(r.project),
        sessions: Number(r.sessions ?? 0),
        costUsd: r.cost_usd === null ? null : Number(r.cost_usd),
        outputTokens: Number(r.output_tokens ?? 0),
        cacheRead: Number(r.cache_read ?? 0),
      }));
  }

  /**
   * What the period's cost was spent on, per model.
   *
   * Dearest first, because that is the order the question is asked in. The
   * costs sum to exactly the hero figure above them: a message with no model
   * is one you typed and was never priced, and `<synthetic>` is Claude Code's
   * own placeholder for a notice it generated locally - an interrupt, a
   * warning - which nobody chose and no rate applies to. Both carry a NULL
   * `cost_usd_derived`, so excluding them here removes no money from the
   * total. Leaving them in would add two rows to a model breakdown that name
   * no model.
   *
   * `messages` counts only what this model answered, so it is deliberately
   * less than the period's message count, which includes the ones you sent.
   *
   * A model the price table lacks keeps its row with a NULL cost rather than
   * being dropped: it did work, and hiding it would make the remaining shares
   * look like the whole picture.
   */
  modelMix(period: PeriodId, limit = 12): ModelUsage[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT model,
                SUM(cost_usd_derived) AS cost_usd,
                COUNT(*)              AS messages,
                SUM(output_tokens)    AS output_tokens
           FROM message
          WHERE ts >= ? AND model IS NOT NULL AND model <> '<synthetic>'
          GROUP BY model
          ORDER BY cost_usd DESC NULLS LAST, messages DESC
          LIMIT ?`,
        [this.bounds(period).from, limit],
      )
      .map((r) => ({
        model: String(r.model),
        costUsd: r.cost_usd === null ? null : Number(r.cost_usd),
        messages: Number(r.messages ?? 0),
        outputTokens: Number(r.output_tokens ?? 0),
      }));
  }

  toolMix(period: PeriodId, limit = 15): { toolName: string; calls: number; failures: number; avgMs: number | null }[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT tool_name, COUNT(*) AS calls, SUM(is_error) AS failures, AVG(duration_ms) AS avg_ms
           FROM tool_call WHERE ts >= ?
          GROUP BY tool_name ORDER BY calls DESC LIMIT ?`,
        [this.bounds(period).from, limit],
      )
      .map((r) => ({
        toolName: String(r.tool_name),
        calls: Number(r.calls ?? 0),
        failures: Number(r.failures ?? 0),
        avgMs: r.avg_ms === null ? null : Number(r.avg_ms),
      }));
  }

  /** Worst first. Ordering is by severity alone: a finding carries no shared
   *  measure to rank by, on purpose - see the comment on the signal table. */
  signals(limit = 60, kinds?: string[]): SignalRow[] {
    const filter = kinds?.length
      ? ` WHERE kind IN (${kinds.map(() => "?").join(",")})`
      : "";
    return this.db
      .all<Record<string, unknown>>(
        `SELECT kind, severity, scope, scope_id, evidence_json
           FROM signal${filter}
          ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END, kind
          LIMIT ?`,
        [...(kinds ?? []), limit],
      )
      .map((r) => ({
        kind: String(r.kind),
        severity: String(r.severity),
        scope: String(r.scope),
        scopeId: String(r.scope_id),
        evidence: JSON.parse(String(r.evidence_json)) as Record<string, unknown>,
      }));
  }

  /**
   * Derived cost beside Claude Code's own figure, per session.
   *
   * Presented as a second opinion, not a check, because the two count
   * different things and neither is wrong. `cost-state` tallies one process
   * run - it resets on resume - and its `inputTokens` is measurably not the
   * sum of the per-message `usage.input_tokens` it sits beside, so its
   * accounting cannot be reconstructed from the transcript. Derived cost sums
   * every message in the file, subagents included.
   *
   * The price table is validated instead by unit tests against a recorded
   * session whose arithmetic closes exactly (see tests/cost.test.ts). A large
   * difference here means the two are counting different messages, which is
   * expected, and must not be rendered as a pricing error.
   */
  costSecondOpinion(limit = 10): SecondOpinion[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT r.session_id, r.total_cost_usd AS reported, SUM(m.cost_usd_derived) AS derived
           FROM session_cost_report r JOIN message m ON m.session_id = r.session_id
          WHERE r.total_cost_usd > 0
          GROUP BY r.session_id HAVING derived IS NOT NULL
          ORDER BY reported DESC LIMIT ?`,
        [limit],
      )
      .map((r) => ({
        sessionId: String(r.session_id),
        derivedUsd: Number(r.derived),
        reportedUsd: Number(r.reported),
      }));
  }

  /**
   * Sessions the trace page can actually draw, newest last-activity first.
   *
   * Grouped from `message_block` rather than listed from `session` on purpose.
   * Most of the sessions in this database were imported from transcripts
   * Claude Code has since expired, so they have no captured text and never
   * will - offering one is offering a page that is guaranteed to be empty.
   * This lists only what will render.
   */
  traceableSessions(limit = 40): TraceableSession[] {
    return this.db
      .all<Record<string, unknown>>(
        /*
         * The cost and the tool count are correlated subqueries rather than
         * two more joins, because a join to `message` would multiply the block
         * count by the message count and leave the caller to divide it back
         * out. Measured at 23ms for 264 runs on a real corpus, which is the
         * only reason the run list can carry them at all.
         *
         * `cost_usd` stays null when nothing in the run was priced: SUM over
         * no priced rows is null in SQL, and that null is the answer. Do not
         * coalesce it to zero here - a run whose models are missing from the
         * price table did not cost nothing.
         */
        `SELECT b.session_id,
                MIN(b.ts) AS started_at,
                MAX(b.ts) AS ended_at,
                COUNT(*)  AS blocks,
                (SELECT project_path FROM session s WHERE s.session_id = b.session_id) AS project_path,
                (SELECT SUM(m.cost_usd_derived) FROM message m WHERE m.session_id = b.session_id) AS cost_usd,
                (SELECT COUNT(*) FROM tool_call t WHERE t.session_id = b.session_id) AS tool_calls
           FROM message_block b
          GROUP BY b.session_id
          ORDER BY ended_at DESC
          LIMIT ?`,
        [limit],
      )
      .map((r) => ({
        sessionId: String(r.session_id),
        projectPath: r.project_path === null ? null : String(r.project_path),
        startedAt: String(r.started_at),
        endedAt: String(r.ended_at),
        blocks: Number(r.blocks),
        costUsd: r.cost_usd == null ? null : Number(r.cost_usd),
        toolCalls: Number(r.tool_calls ?? 0),
      }));
  }

  /**
   * One run's summary, by id.
   *
   * The same question `traceableSessions` answers, asked about a single
   * session. The export route used to build the whole list - a `GROUP BY` over
   * every block in the corpus, 134,879 rows and 21ms - and then `.find()` the
   * one row it wanted. This is an indexed lookup instead.
   *
   * Existence means the same thing in both: a run exists if it has blocks. The
   * one difference is deliberate - `traceableSessions` stops at its limit and
   * this does not, so every run the page can list can be exported, and so can
   * one whose link was kept after it fell off the end of the list.
   */
  traceableSession(sessionId: string): TraceableSession | null {
    const row = this.db.one<Record<string, unknown>>(
      `SELECT b.session_id,
              MIN(b.ts) AS started_at,
              MAX(b.ts) AS ended_at,
              COUNT(*)  AS blocks,
              (SELECT project_path FROM session s WHERE s.session_id = b.session_id) AS project_path,
              (SELECT SUM(m.cost_usd_derived) FROM message m WHERE m.session_id = b.session_id) AS cost_usd,
              (SELECT COUNT(*) FROM tool_call t WHERE t.session_id = b.session_id) AS tool_calls
         FROM message_block b
        WHERE b.session_id = ?
        GROUP BY b.session_id`,
      [sessionId],
    );
    // GROUP BY over no rows yields no row at all, which is the absence.
    if (!row) return null;

    return {
      sessionId: String(row.session_id),
      projectPath: row.project_path === null ? null : String(row.project_path),
      startedAt: String(row.started_at),
      endedAt: String(row.ended_at),
      blocks: Number(row.blocks),
      // Null stays null: a run whose models are missing from the price table
      // did not cost nothing.
      costUsd: row.cost_usd == null ? null : Number(row.cost_usd),
      toolCalls: Number(row.tool_calls ?? 0),
    };
  }

  /**
   * Every row one session's trace is built from.
   *
   * Five reads rather than one join: the shapes are genuinely different, and a
   * join would multiply blocks by spans and leave the caller to undo it.
   */
  traceRows(sessionId: string): TraceRows {
    const messages = this.db
      .all<Record<string, unknown>>(
        `SELECT uuid, parent_uuid, role, model, ts, is_sidechain, request_id,
                input_tokens, output_tokens, thinking_tokens, stop_reason, cost_usd_derived
           FROM message WHERE session_id = ? ORDER BY ts, rowid`,
        [sessionId],
      )
      .map((r) => ({
        uuid: String(r.uuid),
        parentUuid: r.parent_uuid === null ? null : String(r.parent_uuid),
        role: String(r.role),
        model: r.model === null ? null : String(r.model),
        ts: String(r.ts),
        isSidechain: Number(r.is_sidechain) === 1,
        requestId: r.request_id === null ? null : String(r.request_id),
        // Counts, so a zero here is a measured zero and correct.
        inputTokens: Number(r.input_tokens ?? 0),
        outputTokens: Number(r.output_tokens ?? 0),
        thinkingTokens: Number(r.thinking_tokens ?? 0),
        stopReason: r.stop_reason === null ? null : String(r.stop_reason),
        // Derived from a price table, so null means unpriced and must stay null.
        costUsd: r.cost_usd_derived === null ? null : Number(r.cost_usd_derived),
      }));

    const blocks = this.db
      .all<Record<string, unknown>>(
        `SELECT message_uuid, seq, kind, ts, tool_use_id, tool_name, content, char_len
           FROM message_block WHERE session_id = ? ORDER BY ts, seq`,
        [sessionId],
      )
      .map((r) => ({
        messageUuid: String(r.message_uuid),
        seq: Number(r.seq),
        kind: String(r.kind),
        ts: String(r.ts),
        toolUseId: r.tool_use_id === null ? null : String(r.tool_use_id),
        toolName: r.tool_name === null ? null : String(r.tool_name),
        content: String(r.content),
        charLen: Number(r.char_len),
      }));

    const toolDurations = new Map<string, number>();
    const toolNames = new Map<string, string>();
    for (const r of this.db.all<Record<string, unknown>>(
      "SELECT id, tool_name, duration_ms FROM tool_call WHERE session_id = ?", [sessionId],
    )) {
      toolNames.set(String(r.id), String(r.tool_name));
      // Absent, not zero: no hook has ever timed this call.
      if (r.duration_ms !== null) toolDurations.set(String(r.id), Number(r.duration_ms));
    }

    const spans = this.db
      .all<Record<string, unknown>>(
        `SELECT span_id, parent_span_id, name, tool_use_id, request_id, started_at, duration_ms
           FROM otel_span WHERE session_id = ? ORDER BY started_at, rowid`,
        [sessionId],
      )
      .map((r) => ({
        spanId: String(r.span_id),
        parentSpanId: r.parent_span_id === null ? null : String(r.parent_span_id),
        name: String(r.name),
        toolUseId: r.tool_use_id === null ? null : String(r.tool_use_id),
        requestId: r.request_id === null ? null : String(r.request_id),
        startedAt: String(r.started_at),
        durationMs: r.duration_ms === null ? null : Number(r.duration_ms),
      }));

    return { messages, blocks, toolDurations, toolNames, spans };
  }

  /** Whether any trace text exists at all - a different state from "nothing
   *  imported", and the page needs a different sentence for each. */

  /**
   * One run's tokens, grouped by model.
   *
   * Grouped rather than summed flat because rates differ by model, and a run
   * that used two of them cannot be priced from one set of totals. `costSplit`
   * prices these rows; this only counts them.
   */
  sessionUsage(sessionId: string): SessionUsageRow[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT model,
                SUM(input_tokens)      AS input_tokens,
                SUM(output_tokens)     AS output_tokens,
                SUM(cache_read)        AS cache_read,
                SUM(cache_create_5m)   AS cache_create_5m,
                SUM(cache_create_1h)   AS cache_create_1h,
                SUM(thinking_tokens)   AS thinking_tokens
           FROM message WHERE session_id = ? GROUP BY model`,
        [sessionId],
      )
      .map((r) => ({
        model: r.model === null ? null : String(r.model),
        inputTokens: Number(r.input_tokens ?? 0),
        outputTokens: Number(r.output_tokens ?? 0),
        cacheReadTokens: Number(r.cache_read ?? 0),
        cacheCreate5mTokens: Number(r.cache_create_5m ?? 0),
        cacheCreate1hTokens: Number(r.cache_create_1h ?? 0),
        thinkingTokens: Number(r.thinking_tokens ?? 0),
      }));
  }

  /** Tool calls in one run, for the badge above the tree. */
  sessionToolCalls(sessionId: string): number {
    const row = this.db.one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM tool_call WHERE session_id = ?",
      [sessionId],
    );
    return Number(row?.n ?? 0);
  }

  traceBlockCount(): number {
    return this.db.one<{ c: number }>("SELECT COUNT(*) AS c FROM message_block")?.c ?? 0;
  }

  readState(key: string): string | null {
    return this.db.one<{ value: string }>(
      "SELECT value FROM app_state WHERE key = ?", [key],
    )?.value ?? null;
  }

  /**
   * Project paths Claude Code has actually been used in, most-used first.
   *
   * The picker offers these rather than walking the filesystem: a path in here
   * is one the developer has worked in, which is a far better candidate list
   * than every directory on the machine, and it costs no scanning to produce.
   */
  knownProjects(limit = 60): { path: string; sessions: number; lastSeen: string | null }[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT project_path AS path, COUNT(*) AS sessions, MAX(ended_at) AS last_seen
           FROM session
          WHERE project_path IS NOT NULL AND project_path <> ''
          GROUP BY project_path
          ORDER BY sessions DESC
          LIMIT ?`,
        [limit],
      )
      .map((r) => ({
        path: String(r.path),
        sessions: Number(r.sessions ?? 0),
        lastSeen: r.last_seen === null ? null : String(r.last_seen),
      }));
  }

  /**
   * Has the receiver ever heard anything, and from how many sessions.
   *
   * `lastSeen` is null rather than an empty string when nothing has arrived, so
   * the page can say "nothing yet" instead of rendering a blank timestamp that
   * reads like a broken clock.
   */
  otelSummary(): OtelSummary {
    const row = this.db.one<Record<string, unknown>>(
      `SELECT (SELECT COUNT(*) FROM otel_event)  AS events,
              (SELECT COUNT(*) FROM otel_metric) AS metrics,
              (SELECT COUNT(DISTINCT session_id) FROM (
                 SELECT session_id FROM otel_event  WHERE session_id IS NOT NULL
                 UNION SELECT session_id FROM otel_metric WHERE session_id IS NOT NULL
               )) AS sessions,
              (SELECT MAX(ts) FROM (
                 SELECT ts FROM otel_event UNION ALL SELECT ts FROM otel_metric
               )) AS last_seen`,
    );
    return {
      events: Number(row?.events ?? 0),
      metrics: Number(row?.metrics ?? 0),
      sessions: Number(row?.sessions ?? 0),
      lastSeen: row?.last_seen == null ? null : String(row.last_seen),
    };
  }

  /**
   * How much of what was said actually arrived, as opposed to a placeholder.
   *
   * The content settings are the only ones on the page whose effect is
   * invisible in a count of events: the event arrives either way, carrying
   * `prompt` / `response` set to the literal string `<REDACTED>` when the
   * setting is off. So the question "is text coming through" cannot be
   * answered by counting user_prompt rows - it needs the attribute read.
   *
   * A zero here is a measurement, not a gap: the receiver is in this process
   * and the rows are in front of it. Sessions whose transcript this machine
   * does have are counted too, because the setting is machine-wide and a
   * reader checking whether they set it correctly should not have to reason
   * about which half of the corpus answered.
   */
  contentReceived(): ContentReceived {
    const of = (name: string, attr: string): number =>
      this.db.one<{ n: number }>(
        `SELECT COUNT(*) AS n FROM otel_event
          WHERE name = ?
            AND json_extract(attrs_json, ?) IS NOT NULL
            AND json_extract(attrs_json, ?) <> '<REDACTED>'`,
        [name, `$.${attr}`, `$.${attr}`],
      )?.n ?? 0;

    return {
      prompts: of("user_prompt", "prompt"),
      replies: of("assistant_response", "response"),
    };
  }

  /**
   * What the traces exporter has actually delivered.
   *
   * `timed` counts only spans the receiver could measure. A span with a null
   * duration is one that arrived without an end timestamp, and reporting it as
   * a zero-millisecond call would be a measurement nobody took.
   */
  otelSpanSummary(): OtelSpanSummary {
    const row = this.db.one<Record<string, unknown>>(
      `SELECT COUNT(*) AS spans,
              SUM(CASE WHEN duration_ms IS NOT NULL THEN 1 ELSE 0 END) AS timed,
              MAX(started_at) AS last_seen
         FROM otel_span`,
    );
    return {
      spans: Number(row?.spans ?? 0),
      timed: Number(row?.timed ?? 0),
      lastSeen: row?.last_seen == null ? null : String(row.last_seen),
    };
  }

  /** Newest first: this feeds a terminal, which scrolls the way a log does. */
  otelRecentEvents(limit = 60): OtelEventLine[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT ts, name, session_id, request_id, attrs_json
           FROM otel_event ORDER BY ts DESC, rowid DESC LIMIT ?`,
        [limit],
      )
      .map((r) => ({
        ts: String(r.ts),
        name: String(r.name),
        sessionId: r.session_id === null ? null : String(r.session_id),
        requestId: r.request_id === null ? null : String(r.request_id),
        attrs: JSON.parse(String(r.attrs_json)) as Record<string, string>,
      }));
  }

  otelEventKinds(): OtelKind[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT name, COUNT(*) AS n, MAX(ts) AS last_seen
           FROM otel_event GROUP BY name ORDER BY n DESC`,
      )
      .map((r) => ({
        name: String(r.name),
        count: Number(r.n ?? 0),
        lastSeen: String(r.last_seen),
      }));
  }

  /**
   * Both a total and a latest, because the two metric shapes need different
   * readings: a counter like `claude_code.token.usage` means something summed,
   * a gauge means only its most recent point. The page shows both and lets the
   * name say which one matters.
   */
  otelMetricRollup(): OtelMetricRollup[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT m.name, COUNT(*) AS n, SUM(m.value) AS total, MAX(m.ts) AS last_seen,
                (SELECT value FROM otel_metric x
                  WHERE x.name = m.name ORDER BY x.ts DESC, x.rowid DESC LIMIT 1) AS latest
           FROM otel_metric m GROUP BY m.name ORDER BY n DESC`,
      )
      .map((r) => ({
        name: String(r.name),
        points: Number(r.n ?? 0),
        total: Number(r.total ?? 0),
        latest: Number(r.latest ?? 0),
        lastSeen: String(r.last_seen),
      }));
  }

  hookEventKinds(): HookKind[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT event, COUNT(*) AS n, MAX(ts) AS last_seen,
                COUNT(DISTINCT session_id) AS sessions
           FROM hook_event GROUP BY event ORDER BY n DESC`,
      )
      .map((r) => ({
        event: String(r.event),
        count: Number(r.n ?? 0),
        lastSeen: r.last_seen == null ? null : String(r.last_seen),
        sessions: Number(r.sessions ?? 0),
      }));
  }

  /**
   * How much of the tool history is actually timed.
   *
   * Reported as a fraction rather than a percentage so the page can render an
   * em dash at zero timed calls. "0% of tools are slow" is a claim; "no
   * durations recorded yet" is the truth before exercise 02.
   */
  toolDurationCoverage(): { timed: number; total: number } {
    const row = this.db.one<Record<string, unknown>>(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN duration_ms IS NOT NULL THEN 1 ELSE 0 END) AS timed
         FROM tool_call`,
    );
    return { timed: Number(row?.timed ?? 0), total: Number(row?.total ?? 0) };
  }

  /**
   * Per-tool duration spread, from the hook.
   *
   * Percentiles rather than an average: one twenty-minute build hides behind a
   * mean, and p90 is what a slow call actually costs you. Computed here rather
   * than in SQL because SQLite has no percentile function, and the timed set is
   * small by construction - only calls made after exercise 02 have a duration.
   */
  toolDurations(limit = 15): ToolDuration[] {
    const rows = this.db.all<Record<string, unknown>>(
      `SELECT tool_name, duration_ms FROM tool_call
        WHERE duration_ms IS NOT NULL ORDER BY tool_name, duration_ms`,
    );

    const byTool = new Map<string, number[]>();
    for (const r of rows) {
      const name = String(r.tool_name);
      const bucket = byTool.get(name);
      if (bucket) bucket.push(Number(r.duration_ms));
      else byTool.set(name, [Number(r.duration_ms)]);
    }

    return [...byTool]
      .map(([toolName, sorted]) => ({
        toolName,
        timed: sorted.length,
        p50Ms: percentileOf(sorted, 0.5),
        p90Ms: percentileOf(sorted, 0.9),
        totalMs: sorted.reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, limit);
  }

  /** Rejections and interruptions, per tool. Read from the transcript, so this
   *  one works without exercise 02. */
  toolFriction(limit = 10): { toolName: string; rejected: number; interrupted: number }[] {
    return this.db
      .all<Record<string, unknown>>(
        `SELECT tool_name, SUM(is_rejected) AS rejected, SUM(interrupted) AS interrupted
           FROM tool_call
          WHERE is_rejected = 1 OR interrupted = 1
          GROUP BY tool_name ORDER BY rejected + interrupted DESC LIMIT ?`,
        [limit],
      )
      .map((r) => ({
        toolName: String(r.tool_name),
        rejected: Number(r.rejected ?? 0),
        interrupted: Number(r.interrupted ?? 0),
      }));
  }

  /**
   * The headline figures for one period, in one query.
   *
   * Separate from `series` because the tiles must not be a client-side sum of
   * the chart: a bucket with no messages is absent from the series, and adding
   * up what is drawn would quietly agree with the chart while disagreeing with
   * the database.
   */
  totals(period: PeriodId): PeriodTotals {
    return this.totalsWhere("ts >= ?", [this.bounds(period).from]);
  }

  /** The same figures for the comparison window, so a delta is like-for-like. */
  previousTotals(period: PeriodId): PeriodTotals {
    const w = previousWindowOf(period, this.now());
    return this.totalsWhere("ts >= ? AND ts < ?", [w.from.toISOString(), w.to.toISOString()]);
  }

  private totalsWhere(predicate: string, params: unknown[]): PeriodTotals {
    // The same window, so a delta on the miss premium is like-for-like.
    const cacheMisses = this.cacheMissesWhere(predicate, params);
    const row = this.db.one<Record<string, unknown>>(
      `SELECT SUM(cost_usd_derived)  AS cost_usd,
              SUM(output_tokens)     AS output_tokens,
              SUM(thinking_tokens)   AS thinking_tokens,
              SUM(cache_read)        AS cache_read,
              SUM(cache_create_5m + cache_create_1h) AS cache_create,
              COUNT(*)               AS messages,
              COUNT(DISTINCT session_id) AS sessions,
              COUNT(DISTINCT ${LOCAL_DAY}) AS activeDays
         FROM message WHERE ${predicate}`,
      params,
    );
    const messages = Number(row?.messages ?? 0);
    return {
      /*
       * Zero and null are different answers, and `SUM()` gives the same
       * value for both.
       *
       * No messages in the window means you spent nothing in it - a measured
       * zero, and the honest figure for a day you did not work. Messages with
       * no price attached means we do not know what they cost, which is a
       * gap, and it stays null so the UI draws a dash.
       *
       * These used to collapse into one null, which took the whole Trends
       * page down to a "nothing recorded" panel whenever the selected period
       * was empty. See the missing-number rule in AGENTS.md: this is the half
       * of it that is not a gap.
       */
      costUsd: messages === 0 ? 0 : row?.cost_usd == null ? null : Number(row.cost_usd),
      cacheMisses,
      outputTokens: Number(row?.output_tokens ?? 0),
      thinkingTokens: Number(row?.thinking_tokens ?? 0),
      cacheRead: Number(row?.cache_read ?? 0),
      cacheCreate: Number(row?.cache_create ?? 0),
      messages,
      sessions: Number(row?.sessions ?? 0),
      activeDays: Number(row?.activeDays ?? 0),
    };
  }

  /**
   * Output tokens and how many days actually had sessions, for the usage band.
   *
   * Active days rather than elapsed days: a day with no session is absent from
   * the message table, and counting it as a zero would drag the average down
   * for anyone who takes weekends off.
   */
  usageWindow(days: number): { outputTokens: number; activeDays: number } {
    const row = this.db.one<Record<string, unknown>>(
      `SELECT COALESCE(SUM(output_tokens), 0) AS output_tokens,
              COUNT(DISTINCT ${LOCAL_DAY}) AS active_days
         FROM message WHERE ts >= ?`,
      [rollingDays(days, this.now()).from.toISOString()],
    );
    return {
      outputTokens: Number(row?.output_tokens ?? 0),
      activeDays: Number(row?.active_days ?? 0),
    };
  }

  /**
   * The per-day figures behind the habit badges.
   *
   * Two queries because the two halves have different denominators and saying
   * so is more honest than picking one. A day with tool calls and a day with
   * priced messages are not the same set - a session that only read files has
   * tools and no cost - so each badge is measured over the days its own
   * evidence actually exists on, and says which those were.
   */
  habits(period: PeriodId): HabitInput {
    const from = this.bounds(period).from;

    // Distinct tools are counted per day and then summed: reaching for twelve
    // tools every day is a broader habit than twelve different ones once each,
    // and a window-wide DISTINCT cannot tell those apart.
    const tools = this.db.one<Record<string, unknown>>(
      `SELECT COUNT(*) AS days,
              COALESCE(SUM(skills), 0) AS skills,
              COALESCE(SUM(agents), 0) AS agents,
              COALESCE(SUM(tools), 0)  AS tool_sum
         FROM (SELECT ${LOCAL_DAY} AS d,
                      COUNT(DISTINCT tool_name) AS tools,
                      SUM(CASE WHEN tool_name = 'Skill' THEN 1 ELSE 0 END) AS skills,
                      SUM(CASE WHEN tool_name = 'Agent' THEN 1 ELSE 0 END) AS agents
                 FROM tool_call WHERE ts >= ? GROUP BY d)`,
      [from],
    );

    // '<synthetic>' is Claude Code's placeholder for a message it generated
    // itself - an interrupt, a local notice - not a model anyone chose.
    // Counting it would make every day look one model more adaptive than it was.
    const models = this.db.one<Record<string, unknown>>(
      `SELECT COUNT(*) AS days, COALESCE(SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END), 0) AS multi
         FROM (SELECT ${LOCAL_DAY} AS d, COUNT(DISTINCT model) AS n
                 FROM message
                WHERE model IS NOT NULL AND model <> '<synthetic>' AND ts >= ?
                GROUP BY d)`,
      [from],
    );

    return {
      toolDays: Number(tools?.days ?? 0),
      skillCalls: Number(tools?.skills ?? 0),
      subagentCalls: Number(tools?.agents ?? 0),
      distinctToolsPerDaySum: Number(tools?.tool_sum ?? 0),
      modelDays: Number(models?.days ?? 0),
      multiModelDays: Number(models?.multi ?? 0),
    };
  }

  /** Just enough to decide what the developer should do next. */
  onboardingCounts(): { sessions: number } {
    return {
      sessions: this.db.one<{ n: number }>("SELECT COUNT(*) AS n FROM session")?.n ?? 0,
    };
  }

  counts(): Record<string, number> {
    const tables = [
      "session", "message", "tool_call", "turn", "prompt", "edit", "signal",
      "hook_event", "otel_event", "otel_metric",
    ];
    const out: Record<string, number> = {};
    for (const table of tables) {
      out[table] = this.db.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0;
    }
    return out;
  }
}

/**
 * Nearest-rank: the smallest observed value that at least `p` of the samples
 * fall at or below. No interpolation, so every figure shown is a duration that
 * actually happened.
 *
 * `ceil(p * n) - 1` rather than `floor((n - 1) * p)`. The latter under-reports
 * the tail on small samples - with five calls it can never return the slowest
 * one, which is the only value the p90 column exists to surface. Tool duration
 * sets are small by construction, because only calls made after exercise 02
 * have a duration at all.
 */
function percentileOf(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(p * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index] ?? 0;
}
