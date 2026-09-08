import { mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db } from "../src/db/Database";
import { IngestRepository } from "../src/db/IngestRepository";
import { QueryRepository } from "../src/db/QueryRepository";
import { resolveClaudeProjectsDir } from "../src/config";
import { ClaudeCodeSource } from "../src/ingest/claude-code/ClaudeCodeSource";
import { TranscriptScanner } from "../src/ingest/claude-code/TranscriptScanner";
import { HookSpoolSource } from "../src/ingest/hooks/HookSpoolSource";
import { AnalyticsSource, mapResponse } from "../src/ingest/analytics/AnalyticsSource";
import { OtlpDecoder } from "../src/ingest/otlp/OtlpDecoder";
import { OtelWriter } from "../src/ingest/otlp/OtelWriter";
import { IngestRunner } from "../src/ingest/IngestRunner";
import { assistantLine, parser, toolResultLine, turnLine } from "./factories";

let workDir: string;
let db: Db;
let repo: IngestRepository;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "dev-ai-usage-"));
  db = Db.openMigrated(":memory:");
  repo = new IngestRepository(db);
});

afterEach(() => {
  db.close();
  rmSync(workDir, { recursive: true, force: true });
});

function transcriptDir(): string {
  const dir = join(workDir, "projects", "-repo");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function claudeSource(projectsDir: string): ClaudeCodeSource {
  return new ClaudeCodeSource(db, repo, new TranscriptScanner(projectsDir), parser(), projectsDir);
}

describe("resolveClaudeProjectsDir", () => {
  it("prefers an explicit projects dir", () => {
    expect(
      resolveClaudeProjectsDir({ CLAUDE_CODE_PROJECTS_DIR: "/explicit", CLAUDE_CONFIG_DIR: "/cfg" }, "/home/u"),
    ).toBe("/explicit");
  });

  it("prefers CLAUDE_CONFIG_DIR over the ~/.claude decoy", () => {
    expect(resolveClaudeProjectsDir({ CLAUDE_CONFIG_DIR: "/cfg" }, "/home/u")).toBe("/cfg/projects");
  });

  it("falls back to ~/.claude only when nothing is set", () => {
    expect(resolveClaudeProjectsDir({}, "/home/u")).toBe("/home/u/.claude/projects");
  });
});

describe("ClaudeCodeSource", () => {
  it("explains itself rather than failing when the directory is absent", async () => {
    const result = await claudeSource(join(workDir, "nope")).ingest();
    expect(result.status).toBe("not-configured");
    expect(result.detail).toContain("CLAUDE_CONFIG_DIR");
  });

  it("ingests a transcript into rows", async () => {
    const dir = transcriptDir();
    writeFileSync(
      join(dir, "s1.jsonl"),
      [
        assistantLine({ uuid: "a1", output: 100, toolUses: [{ id: "t1", name: "Bash", input: { command: "npm test" } }] }),
        toolResultLine({ toolUseId: "t1", text: "ok" }),
      ].join("\n") + "\n",
    );

    const result = await claudeSource(join(workDir, "projects")).ingest();
    expect(result.status).toBe("ok");

    const counts = new QueryRepository(db).counts();
    expect(counts.session).toBe(1);
    expect(counts.message).toBe(1);
    expect(counts.tool_call).toBe(1);
  });

  it("writes nothing on a second run over unchanged files", async () => {
    const dir = transcriptDir();
    writeFileSync(join(dir, "s1.jsonl"), assistantLine({ uuid: "a1" }) + "\n");
    const source = claudeSource(join(workDir, "projects"));

    await source.ingest();
    const second = await source.ingest();

    expect(second.recordsWritten).toBe(0);
    expect(second.detail).toContain("0 of 1");
  });

  it("reads only the appended tail when a transcript grows", async () => {
    const dir = transcriptDir();
    const path = join(dir, "s1.jsonl");
    writeFileSync(path, assistantLine({ uuid: "a1" }) + "\n");
    const source = claudeSource(join(workDir, "projects"));
    await source.ingest();

    appendFileSync(path, assistantLine({ uuid: "a2" }) + "\n");
    const second = await source.ingest();

    expect(second.recordsWritten).toBe(1);
    expect(new QueryRepository(db).counts().message).toBe(2);
  });

  it("applies a tool result that arrives in a later append", async () => {
    const dir = transcriptDir();
    const path = join(dir, "s1.jsonl");
    writeFileSync(
      path,
      assistantLine({ uuid: "a1", toolUses: [{ id: "t1", name: "Bash", input: { command: "boom" } }] }) + "\n",
    );
    const source = claudeSource(join(workDir, "projects"));
    await source.ingest();

    appendFileSync(path, toolResultLine({ toolUseId: "t1", stderr: "failed" }) + "\n");
    await source.ingest();

    const row = db.one<{ is_error: number }>("SELECT is_error FROM tool_call WHERE id = 't1'");
    expect(row?.is_error).toBe(1);
  });

  /**
   * The three below are one bug and its edges.
   *
   * A transcript is appended to while we read it, so a pass routinely lands
   * mid-line. The cursor used to be stored as the file's stat size, which is
   * past the start of that half-written record - so the next pass began inside
   * the JSON, read the remainder as garbage, and no pass ever saw the record
   * whole. It was lost silently, because a dropped line looks exactly like the
   * partial tail that is genuinely normal here.
   */
  it("re-reads a half-written record once the writer has finished it", async () => {
    const dir = transcriptDir();
    const path = join(dir, "s1.jsonl");
    const source = claudeSource(join(workDir, "projects"));

    writeFileSync(path, assistantLine({ uuid: "a1" }) + "\n");
    await source.ingest();

    // The writer is caught mid-line: half a record, no terminator.
    const whole = assistantLine({ uuid: "a2" });
    const cut = Math.floor(whole.length / 2);
    appendFileSync(path, whole.slice(0, cut));
    await source.ingest();

    appendFileSync(path, whole.slice(cut) + "\n");
    await source.ingest();

    expect(new QueryRepository(db).counts().message).toBe(2);
  });

  it("ingests a final line that never gets a newline, exactly once", async () => {
    const dir = transcriptDir();
    const path = join(dir, "s1.jsonl");
    const source = claudeSource(join(workDir, "projects"));

    // Complete JSON, no trailing newline. Stopping at the last newline alone
    // would never ingest this; advancing past it would re-insert it forever.
    writeFileSync(path, assistantLine({ uuid: "a1" }));
    await source.ingest();
    expect(new QueryRepository(db).counts().message).toBe(1);

    const second = await source.ingest();
    expect(second.recordsWritten).toBe(0);
    expect(second.detail).toContain("0 of 1");
  });

  it("does not rewind to the start after stopping short of a torn line", async () => {
    const dir = transcriptDir();
    const path = join(dir, "s1.jsonl");
    const source = claudeSource(join(workDir, "projects"));

    writeFileSync(path, assistantLine({ uuid: "a1" }) + "\n" + assistantLine({ uuid: "a2" }).slice(0, 40));
    await source.ingest();

    // The cursor now sits behind the file's size. That must not read as a
    // shrunk file, which restarts from byte zero and re-parses everything.
    appendFileSync(path, "\n");
    const second = await source.ingest();

    expect(second.recordsWritten).toBe(0);
    expect(new QueryRepository(db).counts().message).toBe(1);
  });

  /**
   * Resuming writes a NEW transcript under a NEW session id and copies the
   * earlier records into it, rewriting `sessionId` on every copy but keeping
   * the original `uuid`. No tokens are spent twice, so nothing may be counted
   * twice. Every uuid-keyed table gets that for free; `turn` had no uuid to
   * key on and needed the identity in this test.
   */
  it("stores one turn when a resume replays it under a new session id", async () => {
    const dir = transcriptDir();
    writeFileSync(join(dir, "s1.jsonl"), turnLine(57260, { sessionId: "s1", ts: "2026-09-01T10:05:00.000Z" }) + "\n");
    writeFileSync(join(dir, "s2.jsonl"), turnLine(57260, { sessionId: "s2", ts: "2026-09-01T10:05:00.000Z" }) + "\n");

    await claudeSource(join(workDir, "projects")).ingest();

    expect(new QueryRepository(db).counts().turn).toBe(1);
    // First writer owns it: the session that did the work, not the resume.
    expect(db.one<{ session_id: string }>("SELECT session_id FROM turn")?.session_id).toBe("s1");
  });

  it("keeps two distinct turns that start in the same millisecond", async () => {
    const dir = transcriptDir();
    writeFileSync(
      join(dir, "s1.jsonl"),
      [
        turnLine(1000, { sessionId: "s1", ts: "2026-09-01T10:05:00.000Z" }),
        turnLine(2000, { sessionId: "s2", ts: "2026-09-01T10:05:00.000Z" }),
      ].join("\n") + "\n",
    );

    await claudeSource(join(workDir, "projects")).ingest();

    expect(new QueryRepository(db).counts().turn).toBe(2);
  });

  it("re-reads from the start when a transcript shrinks", async () => {
    const dir = transcriptDir();
    const path = join(dir, "s1.jsonl");
    writeFileSync(path, [assistantLine({ uuid: "a1" }), assistantLine({ uuid: "a2" })].join("\n") + "\n");
    const source = claudeSource(join(workDir, "projects"));
    await source.ingest();

    writeFileSync(path, assistantLine({ uuid: "a3" }) + "\n");
    await source.ingest();

    expect(new QueryRepository(db).counts().message).toBe(3);
  });
});

describe("HookSpoolSource", () => {
  const spoolLine = (toolUseId: string, duration: number) =>
    JSON.stringify({ hook_event_name: "PostToolUse", tool_use_id: toolUseId, duration });

  it("points at the exercise when no spool exists", async () => {
    const result = await new HookSpoolSource(db, repo, join(workDir, "none.jsonl")).ingest();
    expect(result.status).toBe("not-configured");
    expect(result.detail).toContain("exercises/02");
  });

  it("applies a duration to the matching tool call and drains the spool", async () => {
    repo.saveToolCall(toolCall("t1"));
    const spool = join(workDir, "spool.jsonl");
    writeFileSync(spool, spoolLine("t1", 1.5) + "\n");

    const result = await new HookSpoolSource(db, repo, spool).ingest();

    expect(result.recordsWritten).toBe(1);
    expect(db.one<{ duration_ms: number }>("SELECT duration_ms FROM tool_call WHERE id='t1'")?.duration_ms).toBe(1500);
    expect(readFileSync(spool, "utf8")).toBe("");
  });

  it("keeps a duration whose tool call has not been ingested yet", async () => {
    const spool = join(workDir, "spool.jsonl");
    writeFileSync(spool, spoolLine("not-yet", 2) + "\n");

    await new HookSpoolSource(db, repo, spool).ingest();

    expect(readFileSync(spool, "utf8")).toContain("not-yet");
  });

  /**
   * The regression that matters most here.
   *
   * Exercise 02 registers five hooks and four of them carry no `tool_use_id`.
   * A drain that recognised only durations skipped those lines *and* rewrote
   * the spool without them, so PermissionDenied and PreCompact - two events the
   * exercise's own table promises feed features - were destroyed on every run
   * and no error was ever raised.
   */
  it("stores a hook event that carries no duration, rather than discarding it", async () => {
    const spool = join(workDir, "spool.jsonl");
    writeFileSync(spool, JSON.stringify({
      hook_event_name: "PermissionDenied",
      session_id: "s1",
      tool_name: "Bash",
      reason: "user denied",
      spooled_at: "2026-09-01T10:00:00.000Z",
    }) + "\n");

    const result = await new HookSpoolSource(db, repo, spool).ingest();

    expect(result.status).toBe("ok");
    const kinds = new QueryRepository(db).hookEventKinds();
    expect(kinds).toEqual([
      { event: "PermissionDenied", count: 1, sessions: 1, lastSeen: "2026-09-01T10:00:00.000Z" },
    ]);
  });

  it("stores a timed line as a hook event and still applies its duration", async () => {
    repo.saveToolCall(toolCall("t1"));
    const spool = join(workDir, "spool.jsonl");
    writeFileSync(spool, JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_use_id: "t1",
      tool_name: "Bash",
      duration: 1.5,
      spooled_at: "2026-09-01T10:00:00.000Z",
    }) + "\n");

    await new HookSpoolSource(db, repo, spool).ingest();

    expect(db.one<{ duration_ms: number }>("SELECT duration_ms FROM tool_call WHERE id='t1'")?.duration_ms).toBe(1500);
    expect(new QueryRepository(db).counts().hook_event).toBe(1);
  });

  /** A queued duration is re-read every run, so its hook event must not
   *  accumulate a row per attempt. The id is a hash of the line for this. */
  it("does not duplicate the hook event of a line that stays queued", async () => {
    const spool = join(workDir, "spool.jsonl");
    writeFileSync(spool, spoolLine("not-yet", 2) + "\n");

    await new HookSpoolSource(db, repo, spool).ingest();
    await new HookSpoolSource(db, repo, spool).ingest();
    await new HookSpoolSource(db, repo, spool).ingest();

    expect(new QueryRepository(db).counts().hook_event).toBe(1);
    expect(readFileSync(spool, "utf8")).toContain("not-yet");
  });

  /** The payload carries the whole tool input, which for Write is an entire
   *  file. This table is read by a page, so only scalars are kept. */
  it("keeps scalar fields and drops the tool input entirely", async () => {
    const spool = join(workDir, "spool.jsonl");
    writeFileSync(spool, JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      tool_use_id: "t9",
      duration: 0.5,
      tool_input: { file_path: "/tmp/x.ts", content: "SECRET FILE BODY" },
      spooled_at: "2026-09-01T10:00:00.000Z",
    }) + "\n");

    await new HookSpoolSource(db, repo, spool).ingest();

    const stored = db.one<{ attrs_json: string }>("SELECT attrs_json FROM hook_event")?.attrs_json ?? "";
    expect(stored).not.toContain("SECRET FILE BODY");
    expect(stored).not.toContain("tool_input");
    expect(JSON.parse(stored)).toMatchObject({ tool_name: "Write", duration: 0.5 });
  });
});

describe("OtlpDecoder", () => {
  const decoder = new OtlpDecoder();
  const attr = (key: string, value: string) => ({ key, value: { stringValue: value } });

  const metricsPayload = {
    resourceMetrics: [{
      resource: { attributes: [attr("user.email", "dev@example.com")] },
      scopeMetrics: [{
        metrics: [{
          name: "claude_code.token.usage",
          sum: { dataPoints: [{ timeUnixNano: "1788309248706000000", asInt: 4200, attributes: [attr("session.id", "s1")] }] },
        }],
      }],
    }],
  };

  it("decodes a metric with its resource and point attributes merged", () => {
    const [point] = decoder.decodeMetrics(metricsPayload);
    expect(point).toMatchObject({ name: "claude_code.token.usage", value: 4200, sessionId: "s1" });
    expect(point!.attrs["user.email"]).toBe("dev@example.com");
  });

  it("decodes an event and its request id", () => {
    const [event] = decoder.decodeLogs({
      resourceLogs: [{
        resource: { attributes: [] },
        scopeLogs: [{
          logRecords: [{
            timeUnixNano: "1788309248706000000",
            attributes: [attr("event.name", "claude_code.api_request"), attr("session.id", "s1"), attr("request.id", "req_1")],
          }],
        }],
      }],
    });
    expect(event).toMatchObject({ name: "claude_code.api_request", sessionId: "s1", requestId: "req_1" });
  });

  it("gives the same record the same id so a retried export does not double count", () => {
    const writer = new OtelWriter(db);
    writer.writeMetrics(decoder.decodeMetrics(metricsPayload));
    writer.writeMetrics(decoder.decodeMetrics(metricsPayload));
    expect(db.one<{ n: number }>("SELECT COUNT(*) AS n FROM otel_metric")?.n).toBe(1);
  });

  it("returns nothing for a payload it does not recognise", () => {
    expect(decoder.decodeMetrics({ nonsense: true })).toEqual([]);
    expect(decoder.decodeLogs(null)).toEqual([]);
  });
});

describe("AnalyticsSource", () => {
  const page = (nextPage: string | null) => ({
    data: [{
      date: "2026-09-01",
      actor_email_address: "dev@example.com",
      core_metrics: {
        num_sessions: 3,
        lines_of_code: { added: 120, removed: 8 },
        commits_by_claude_code: 2,
        pull_requests_by_claude_code: 1,
      },
      tool_actions: { edit_tool: { accepted: 9, rejected: 1 } },
      model_breakdown: [{
        model: "claude-opus-5",
        tokens: { input: 100, output: 200, cache_read: 300, cache_creation: 400 },
        estimated_cost: { amount: 1234 },
      }],
    }],
    next_page: nextPage,
  });

  it("says what is missing instead of failing when no admin key is set", async () => {
    const result = await new AnalyticsSource(db, null, "https://api.anthropic.com", 30).ingest();
    expect(result.status).toBe("not-configured");
    expect(result.detail).toContain("ANTHROPIC_ADMIN_KEY");
  });

  it("converts the cost from cents to dollars", () => {
    expect(mapResponse(page(null))[0]!.costUsd).toBe(12.34);
  });

  it("reports an absent cost as unknown rather than free", () => {
    const body = page(null);
    delete (body.data[0]!.model_breakdown[0] as Record<string, unknown>).estimated_cost;
    expect(mapResponse(body)[0]!.costUsd).toBeNull();
  });

  it("follows pagination and upserts rather than duplicating a re-read day", async () => {
    // Two pages per run, keyed on the cursor the source sends back.
    const requested: (string | null)[] = [];
    const fetchImpl = (async (url: URL) => {
      const cursor = url.searchParams.get("page");
      requested.push(cursor);
      return new Response(JSON.stringify(page(cursor ? null : "p2")), { status: 200 });
    }) as unknown as typeof fetch;

    const source = new AnalyticsSource(db, "sk-ant-admin01-x", "https://api.anthropic.com", 30, fetchImpl);
    await source.ingest();
    await source.ingest();

    expect(requested).toEqual([null, "p2", null, "p2"]);
    // The same day arrived four times; it must exist once.
    expect(db.one<{ n: number }>("SELECT COUNT(*) AS n FROM daily_analytics")?.n).toBe(1);
  });

  it("names the credential when the API rejects the key", async () => {
    const fetchImpl = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    const result = await new AnalyticsSource(db, "wrong-key", "https://api.anthropic.com", 30, fetchImpl).ingest();

    expect(result.status).toBe("error");
    expect(result.detail).toContain("organisation admin key");
  });
});

describe("IngestRunner", () => {
  it("isolates one source's failure from the others", async () => {
    const results = await new IngestRunner([
      { id: "boom", label: "boom", unavailableReason: async () => null, ingest: async () => { throw new Error("exploded"); } },
      { id: "fine", label: "fine", unavailableReason: async () => null, ingest: async () => ({ sourceId: "fine", status: "ok" as const, detail: "done", recordsWritten: 1 }) },
    ]).runAll();

    expect(results.map((r) => r.status)).toEqual(["error", "ok"]);
    expect(results[0]!.detail).toBe("exploded");
  });
});

function toolCall(id: string) {
  return {
    id, sessionId: "s1", messageUuid: "a1", toolName: "Bash",
    ts: "2026-09-01T10:00:00.000Z", inputHash: "h", inputNorm: "npm test",
    resultBytes: null, isError: false, isRejected: false, interrupted: false, durationMs: null,
  };
}
