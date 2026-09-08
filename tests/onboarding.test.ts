import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/db/Database";
import { IngestRepository } from "../src/db/IngestRepository";
import { QueryRepository } from "../src/db/QueryRepository";
import { decideNextStep } from "../src/onboarding/NextStep";

/**
 * The empty state is the first thing everyone sees, and getting it wrong is the
 * one bug this project claims not to have. So what the guide says, and when it
 * stops saying it, is asserted rather than eyeballed.
 */

describe("decideNextStep", () => {
  it("asks for the transcript path when no folder was found", () => {
    const state = decideNextStep({ transcriptsFound: false, sessions: 0 });

    expect(state.nextStep?.command).toBe("");
    expect(state.nextStep?.why).toContain("No transcript folder");
    expect(state.showGuide).toBe(true);
  });

  it("asks for one import when the folder exists but nothing is in the database", () => {
    const state = decideNextStep({ transcriptsFound: true, sessions: 0 });

    expect(state.nextStep?.command).toBe("npm run run");
    expect(state.showGuide).toBe(true);
  });

  /** One import is the whole setup now: every number is read straight from the
   *  imported rows, so there is no second step to nag about. */
  it("stops guiding once anything is imported", () => {
    const state = decideNextStep({ transcriptsFound: true, sessions: 1 });

    expect(state.nextStep).toBeNull();
    expect(state.showGuide).toBe(false);
  });
});

describe("QueryRepository.counts", () => {
  let db: Db;

  beforeEach(() => { db = Db.openMigrated(":memory:"); });
  afterEach(() => { db.close(); });

  /**
   * `counts()` names its tables as strings, so a table dropped from the schema
   * without being dropped here fails at query time rather than at compile
   * time - and it fails on the Setup page, in front of someone.
   */
  it("counts exactly the tables the schema still has, and none it does not", () => {
    const counts = new QueryRepository(db).counts();

    expect(Object.keys(counts).sort()).toEqual([
      "edit", "hook_event", "message", "otel_event", "otel_metric",
      "prompt", "session", "signal", "tool_call", "turn",
    ]);
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
  });

  it("reports no sessions on a fresh database without inventing a row", () => {
    expect(new QueryRepository(db).onboardingCounts()).toEqual({ sessions: 0 });
  });
});

describe("telemetry reads", () => {
  let db: Db;
  let queries: QueryRepository;

  beforeEach(() => {
    db = Db.openMigrated(":memory:");
    queries = new QueryRepository(db);
  });
  afterEach(() => { db.close(); });

  const otelEvent = (name: string, ts: string) =>
    db.run(
      "INSERT INTO otel_event (id, name, ts, session_id, request_id, attrs_json) VALUES (?,?,?,?,?,?)",
      [`${name}-${ts}`, name, ts, "s1", null, JSON.stringify({ "service.name": "claude-code" })],
    );

  /**
   * Before exercise 01 the receiver is up and has simply heard nothing. That is
   * a measured zero, but `lastSeen` must stay null - rendering an empty
   * timestamp reads like a broken clock, not like an absence.
   */
  it("reports nothing received without inventing a last-seen time", () => {
    expect(queries.otelSummary()).toEqual({ events: 0, metrics: 0, sessions: 0, lastSeen: null });
    expect(queries.otelRecentEvents()).toEqual([]);
    expect(queries.otelEventKinds()).toEqual([]);
    expect(queries.otelMetricRollup()).toEqual([]);
  });

  it("feeds the terminal newest first, the way a log scrolls", () => {
    otelEvent("claude_code.api_request", "2026-09-01T10:00:00.000Z");
    otelEvent("claude_code.tool_decision", "2026-09-01T10:00:05.000Z");

    expect(queries.otelRecentEvents().map((e) => e.name)).toEqual([
      "claude_code.tool_decision",
      "claude_code.api_request",
    ]);
  });

  it("summarises across both tables and counts a session once", () => {
    otelEvent("claude_code.api_request", "2026-09-01T10:00:00.000Z");
    db.run(
      "INSERT INTO otel_metric (id, name, ts, value, session_id, attrs_json) VALUES (?,?,?,?,?,?)",
      ["m1", "claude_code.token.usage", "2026-09-01T10:01:00.000Z", 4200, "s1", "{}"],
    );

    expect(queries.otelSummary()).toEqual({
      events: 1,
      metrics: 1,
      sessions: 1,
      lastSeen: "2026-09-01T10:01:00.000Z",
    });
  });

  /** A counter wants the sum, a gauge only its latest point. The rollup gives
   *  both rather than guessing which shape a metric name is. */
  it("gives a metric both a total and its most recent value", () => {
    for (const [i, v] of [10, 20, 30].entries()) {
      db.run(
        "INSERT INTO otel_metric (id, name, ts, value, session_id, attrs_json) VALUES (?,?,?,?,?,?)",
        [`m${i}`, "claude_code.cost.usage", `2026-09-01T10:0${i}:00.000Z`, v, "s1", "{}"],
      );
    }

    expect(queries.otelMetricRollup()).toEqual([
      {
        name: "claude_code.cost.usage",
        points: 3,
        total: 60,
        latest: 30,
        lastSeen: "2026-09-01T10:02:00.000Z",
      },
    ]);
  });
});

describe("tool duration reads", () => {
  let db: Db;
  let repo: IngestRepository;
  let queries: QueryRepository;

  beforeEach(() => {
    db = Db.openMigrated(":memory:");
    repo = new IngestRepository(db);
    queries = new QueryRepository(db);
  });
  afterEach(() => { db.close(); });

  const call = (id: string, durationMs: number | null) => {
    repo.saveToolCall({
      id, sessionId: "s1", messageUuid: "m1", toolName: "Bash",
      ts: "2026-09-01T10:00:00.000Z", inputHash: id, inputNorm: id,
      resultBytes: 0, isError: false, isRejected: false, interrupted: false,
      durationMs: null,
    });
    if (durationMs !== null) repo.setToolDuration(id, durationMs);
  };

  /**
   * The figure the Hooks page renders as an em dash.
   *
   * Coverage is returned as a fraction, not a percentage, precisely so the page
   * can tell "no durations recorded" apart from "0% of calls were slow".
   */
  it("reports zero timed calls as a fraction, leaving the page to render a dash", () => {
    call("a", null);
    call("b", null);

    expect(queries.toolDurationCoverage()).toEqual({ timed: 0, total: 2 });
    expect(queries.toolDurations()).toEqual([]);
  });

  /**
   * The outlier must reach p90 on a small sample.
   *
   * With five calls, `floor((n - 1) * p)` returns 400 and the 5s call is
   * invisible in the only column meant to surface it. Nearest-rank returns
   * 5000, which is what "p90 is what a slow call costs you" claims.
   */
  it("takes percentiles from observed durations, never interpolating a new one", () => {
    const observed = [100, 200, 300, 400, 5000];
    observed.forEach((ms, i) => call(`t${i}`, ms));

    const [bash] = queries.toolDurations();
    expect(bash).toEqual({
      toolName: "Bash",
      timed: 5,
      p50Ms: 300,
      p90Ms: 5000,
      totalMs: 6000,
    });
    // Every reported figure is a duration that actually happened.
    expect(observed).toContain(bash!.p50Ms);
    expect(observed).toContain(bash!.p90Ms);
  });

  it("counts coverage across timed and untimed calls together", () => {
    call("a", 500);
    call("b", null);
    call("c", null);

    expect(queries.toolDurationCoverage()).toEqual({ timed: 1, total: 3 });
  });
});
