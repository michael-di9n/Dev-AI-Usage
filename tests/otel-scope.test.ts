import { beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/db/Database";
import { IngestRepository } from "../src/db/IngestRepository";
import { QueryRepository } from "../src/db/QueryRepository";
import { OtelWriter } from "../src/ingest/otlp/OtelWriter";

/**
 * The join every project-scoped live-evidence query goes through:
 * `otel_event`/`otel_metric`/`otel_span`/`tool_call` carry a `session_id`,
 * `session.project_path` is the only place a project lives, and OTLP export
 * is machine-wide - two projects' sessions can both write into the same
 * database. Without this scoping the Observability page reported one
 * project's traffic while a different one was selected in the picker.
 */
describe("project-scoped live evidence", () => {
  let db: Db;
  let ingest: IngestRepository;
  let queries: QueryRepository;
  let otel: OtelWriter;

  beforeEach(() => {
    db = Db.openMigrated(":memory:");
    ingest = new IngestRepository(db);
    queries = new QueryRepository(db);
    otel = new OtelWriter(db);

    ingest.saveSession({
      sessionId: "sess-a", developerId: "dev", tool: "claude-code",
      projectPath: "/projects/a", gitBranch: null,
      startedAt: "2026-08-01T09:00:00Z", endedAt: "2026-08-01T10:00:00Z",
      agentVersion: null, entrypoint: null,
    });
    ingest.saveSession({
      sessionId: "sess-b", developerId: "dev", tool: "claude-code",
      projectPath: "/projects/b", gitBranch: null,
      startedAt: "2026-08-02T09:00:00Z", endedAt: "2026-08-02T10:00:00Z",
      agentVersion: null, entrypoint: null,
    });

    otel.writeEvents([
      { id: "ev-a", name: "user_prompt", ts: "2026-08-01T09:05:00Z", sessionId: "sess-a", requestId: null, attrs: { prompt: "hi" } },
      { id: "ev-b", name: "user_prompt", ts: "2026-08-02T09:05:00Z", sessionId: "sess-b", requestId: null, attrs: { prompt: "hi" } },
      // No session_id at all - a record this machine cannot attribute to any project.
      { id: "ev-orphan", name: "user_prompt", ts: "2026-08-03T09:05:00Z", sessionId: null, requestId: null, attrs: { prompt: "hi" } },
    ]);

    otel.writeSpans([
      {
        traceId: "t1", spanId: "sp-a", parentSpanId: null, name: "claude_code.tool",
        sessionId: "sess-a", toolUseId: null, requestId: null,
        startedAt: "2026-08-01T09:05:00Z", endedAt: "2026-08-01T09:05:01Z",
        durationMs: 1_000, status: null, attrs: {},
      },
      {
        traceId: "t2", spanId: "sp-b", parentSpanId: null, name: "claude_code.tool",
        sessionId: "sess-b", toolUseId: null, requestId: null,
        startedAt: "2026-08-02T09:05:00Z", endedAt: "2026-08-02T09:05:01Z",
        durationMs: 2_000, status: null, attrs: {},
      },
    ]);

    ingest.saveToolCall({
      id: "tc-a", sessionId: "sess-a", messageUuid: "m-a", toolName: "Read", ts: "2026-08-01T09:05:00Z",
      inputHash: "h1", inputNorm: "{}", resultBytes: 10, isError: false, isRejected: false,
      interrupted: false, durationMs: 500,
    });
    ingest.saveToolCall({
      id: "tc-b", sessionId: "sess-b", messageUuid: "m-b", toolName: "Read", ts: "2026-08-02T09:05:00Z",
      inputHash: "h2", inputNorm: "{}", resultBytes: 10, isError: false, isRejected: false,
      interrupted: false, durationMs: null,
    });
  });

  it("otelSummary counts only the selected project's events", () => {
    expect(queries.otelSummary("/projects/a").events).toBe(1);
    expect(queries.otelSummary("/projects/b").events).toBe(1);
    // Unscoped still sees everything, orphan record included.
    expect(queries.otelSummary(null).events).toBe(3);
  });

  it("otelSpanSummary counts only the selected project's spans", () => {
    expect(queries.otelSpanSummary("/projects/a")).toMatchObject({ spans: 1, timed: 1 });
    expect(queries.otelSpanSummary("/projects/b")).toMatchObject({ spans: 1, timed: 1 });
    expect(queries.otelSpanSummary(null).spans).toBe(2);
  });

  it("toolDurationCoverage counts only the selected project's tool calls", () => {
    expect(queries.toolDurationCoverage("/projects/a")).toEqual({ total: 1, timed: 1 });
    // Project b's only call has no duration - a measured zero, not missing.
    expect(queries.toolDurationCoverage("/projects/b")).toEqual({ total: 1, timed: 0 });
    expect(queries.toolDurationCoverage(null)).toEqual({ total: 2, timed: 1 });
  });

  it("otelRecentEvents lists only the selected project's lines", () => {
    expect(queries.otelRecentEvents(10, "/projects/a").map((e) => e.sessionId)).toEqual(["sess-a"]);
    expect(queries.otelRecentEvents(10, "/projects/b").map((e) => e.sessionId)).toEqual(["sess-b"]);
    expect(queries.otelRecentEvents(10, null)).toHaveLength(3);
  });

  /**
   * The tap reads three tables as one list. What matters is that a row says
   * which table it came from, that the list is newest first across all three,
   * that a switched-off stream contributes nothing, and that the project scope
   * holds on every arm - a span from project b appearing under project a would
   * be the bug this file exists to stop, on a new path.
   */
  it("otelRecentRecords interleaves the streams asked for, newest first, scoped", () => {
    otel.writeMetrics([
      { id: "mp-a", name: "claude_code.token.usage", ts: "2026-08-01T09:06:00Z", value: 12, sessionId: "sess-a", attrs: { type: "input" } },
    ]);

    const all = queries.otelRecentRecords(10, "/projects/a", ["log", "metric", "span"]);
    expect(all.map((r) => [r.kind, r.ts])).toEqual([
      ["metric", "2026-08-01T09:06:00Z"],
      // The event and the span share an instant; both are here.
      ["log", "2026-08-01T09:05:00Z"],
      ["span", "2026-08-01T09:05:00Z"],
    ].sort((x, y) => (x[1]! < y[1]! ? 1 : x[1]! > y[1]! ? -1 : 0)).map((r) => r) satisfies unknown[]);
    expect(all.find((r) => r.kind === "metric")).toMatchObject({ value: 12, durationMs: null, status: null });
    expect(all.find((r) => r.kind === "span")).toMatchObject({ value: null, durationMs: 1_000 });

    // A switched-off stream is not read at all.
    expect(queries.otelRecentRecords(10, "/projects/a", ["span"]).map((r) => r.kind)).toEqual(["span"]);
    expect(queries.otelRecentRecords(10, "/projects/a", [])).toEqual([]);

    // Scope holds on every arm: nothing of a's under b, the orphan under neither.
    expect(queries.otelRecentRecords(10, "/projects/b", ["log", "metric", "span"]).map((r) => r.sessionId))
      .toEqual(["sess-b", "sess-b"]);
    expect(queries.otelRecentRecords(10, null, ["log"])).toHaveLength(3);
  });

  it("otelRecentRecords keeps an unmeasured span duration null", () => {
    otel.writeSpans([{
      traceId: "t3", spanId: "sp-c", parentSpanId: null, name: "claude_code.tool",
      sessionId: "sess-a", toolUseId: null, requestId: null,
      startedAt: "2026-08-01T09:07:00Z", endedAt: "2026-08-01T09:07:00Z",
      durationMs: null, status: null, attrs: {},
    }]);
    const [newest] = queries.otelRecentRecords(1, "/projects/a", ["span"]);
    // Null stays null on the way out: a span nobody could time is not a
    // zero-millisecond call.
    expect(newest?.durationMs).toBeNull();
  });

  /**
   * The two tool settings add attributes rather than un-redacting them, so
   * the receipt is presence. Counted on both tool event names, because
   * `tool_parameters` arrives on the decision as well as the result.
   */
  it("contentReceived counts the attributes the tool settings add, per project", () => {
    otel.writeEvents([
      { id: "td-a", name: "tool_decision", ts: "2026-08-01T09:08:00Z", sessionId: "sess-a", requestId: null, attrs: { tool_name: "Bash", tool_parameters: '{"bash_command":"git"}' } },
      { id: "tr-a", name: "tool_result", ts: "2026-08-01T09:08:01Z", sessionId: "sess-a", requestId: null, attrs: { tool_name: "Bash", tool_parameters: '{"bash_command":"git"}', tool_input: '{"command":"git status"}' } },
      // Setting off: the event arrives, the attributes do not.
      { id: "tr-a2", name: "tool_result", ts: "2026-08-01T09:09:00Z", sessionId: "sess-a", requestId: null, attrs: { tool_name: "Read", tool_input_size_bytes: "40" } },
      { id: "tr-b", name: "tool_result", ts: "2026-08-02T09:08:00Z", sessionId: "sess-b", requestId: null, attrs: { tool_name: "Read", tool_output: "..." } },
    ]);

    expect(queries.contentReceived("/projects/a")).toMatchObject({ toolArgs: 2, toolContent: 1 });
    expect(queries.contentReceived("/projects/b")).toMatchObject({ toolArgs: 0, toolContent: 1 });
    // A project that sent none reads as a measured zero.
    expect(queries.contentReceived("/projects/c")).toMatchObject({ toolArgs: 0, toolContent: 0 });
  });

  /**
   * A record with no session_id belongs to no project - crediting it to
   * whichever project happens to be selected would be a number nobody
   * measured for that project.
   */
  it("never credits a session-less record to a project", () => {
    const a = queries.otelSummary("/projects/a");
    const b = queries.otelSummary("/projects/b");
    expect(a.events + b.events).toBe(2);
    expect(queries.otelSummary(null).events).toBe(3);
  });

  /**
   * A project that exists but has sent nothing reads as a measured zero, the
   * same rule `contentReceived`'s own doc comment states - not as a dash, and
   * not as another project's figures.
   */
  it("reports a genuine zero for a project with no OTEL traffic at all", () => {
    ingest.saveSession({
      sessionId: "sess-c", developerId: "dev", tool: "claude-code",
      projectPath: "/projects/c", gitBranch: null,
      startedAt: "2026-08-03T09:00:00Z", endedAt: "2026-08-03T10:00:00Z",
      agentVersion: null, entrypoint: null,
    });

    expect(queries.otelSummary("/projects/c")).toEqual({ events: 0, metrics: 0, sessions: 0, lastSeen: null });
  });
});

describe("TraceableSession.otelSpans", () => {
  it("counts a run's own otel_span rows, zero when it has none", () => {
    const db = Db.openMigrated(":memory:");
    const ingest = new IngestRepository(db);
    const queries = new QueryRepository(db);
    const otel = new OtelWriter(db);

    ingest.saveSession({
      sessionId: "sess-x", developerId: "dev", tool: "claude-code", projectPath: "/p",
      gitBranch: null, startedAt: null, endedAt: null, agentVersion: null, entrypoint: null,
    });
    ingest.saveSession({
      sessionId: "sess-y", developerId: "dev", tool: "claude-code", projectPath: "/p",
      gitBranch: null, startedAt: null, endedAt: null, agentVersion: null, entrypoint: null,
    });
    // A run only appears in traceableSessions if it has captured trace text.
    ingest.saveBlock({
      messageUuid: "m-x", seq: 0, sessionId: "sess-x", role: "assistant", kind: "text",
      ts: "2026-08-01T09:00:00Z", toolUseId: null, toolName: null, content: "hi", charLen: 2,
    });
    ingest.saveBlock({
      messageUuid: "m-y", seq: 0, sessionId: "sess-y", role: "assistant", kind: "text",
      ts: "2026-08-02T09:00:00Z", toolUseId: null, toolName: null, content: "hi", charLen: 2,
    });
    otel.writeSpans([{
      traceId: "t1", spanId: "sp-x", parentSpanId: null, name: "claude_code.tool",
      sessionId: "sess-x", toolUseId: null, requestId: null,
      startedAt: "2026-08-01T09:00:00Z", endedAt: "2026-08-01T09:00:01Z",
      durationMs: 1_000, status: null, attrs: {},
    }]);

    const sessions = new Map(queries.traceableSessions(10).map((s) => [s.sessionId, s.otelSpans]));
    expect(sessions.get("sess-x")).toBe(1);
    expect(sessions.get("sess-y")).toBe(0);
    expect(queries.traceableSession("sess-x")!.otelSpans).toBe(1);
    expect(queries.traceableSession("sess-y")!.otelSpans).toBe(0);
  });
});
