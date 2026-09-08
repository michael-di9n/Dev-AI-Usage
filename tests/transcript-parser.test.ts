import { describe, expect, it } from "vitest";
import { isRejection } from "../src/ingest/claude-code/TranscriptParser";
import { assistantLine, parser, promptLine, toolResultLine, turnLine } from "./factories";

describe("TranscriptParser", () => {
  it("maps an assistant record into a message row with split cache TTLs", () => {
    const parsed = parser().parse([
      assistantLine({ uuid: "a1", input: 10, output: 500, cacheRead: 20_000, cacheCreate5m: 1_000, cacheCreate1h: 500, thinking: 120 }),
    ]);

    expect(parsed.messages).toHaveLength(1);
    const message = parsed.messages[0]!;
    expect(message.usage).toEqual({
      inputTokens: 10,
      outputTokens: 500,
      cacheReadTokens: 20_000,
      cacheCreate5mTokens: 1_000,
      cacheCreate1hTokens: 500,
      thinkingTokens: 120,
    });
    expect(message.model).toBe("claude-opus-5");
    expect(message.requestId).toBe("req_a1");
  });

  it("attributes an unsplit cache_creation total to the cheaper 5m rate", () => {
    const line = JSON.stringify({
      type: "assistant", uuid: "a1", sessionId: "s1", timestamp: "2026-09-01T10:00:00.000Z",
      message: {
        role: "assistant", model: "claude-opus-5",
        content: [],
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 4_000 },
      },
    });

    const usage = parser().parse([line]).messages[0]!.usage;
    expect(usage.cacheCreate5mTokens).toBe(4_000);
    expect(usage.cacheCreate1hTokens).toBe(0);
  });

  it("skips a malformed trailing line without losing the rest", () => {
    const parsed = parser().parse([assistantLine({ uuid: "a1" }), '{"type":"assist']);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.malformedLines).toBe(1);
  });

  it("records tool calls and reconciles their results", () => {
    const parsed = parser().parse([
      assistantLine({ uuid: "a1", toolUses: [{ id: "t1", name: "Bash", input: { command: "npm test" } }] }),
      toolResultLine({ toolUseId: "t1", text: "2 passed" }),
    ]);

    expect(parsed.toolCalls).toHaveLength(1);
    expect(parsed.toolCalls[0]!.toolName).toBe("Bash");
    expect(parsed.toolResults[0]).toMatchObject({ toolUseId: "t1", isError: false, isRejected: false });
  });

  it("treats stderr on a Bash result as an error", () => {
    const parsed = parser().parse([
      assistantLine({ uuid: "a1", toolUses: [{ id: "t1", name: "Bash", input: { command: "nope" } }] }),
      toolResultLine({ toolUseId: "t1", stderr: "command not found" }),
    ]);
    expect(parsed.toolResults[0]!.isError).toBe(true);
  });

  it("records an edit with its language and authored line count", () => {
    const parsed = parser().parse([
      assistantLine({
        uuid: "a1",
        toolUses: [{ id: "t1", name: "Write", input: { file_path: "/repo/src/app.ts", content: "a\nb\nc" } }],
      }),
    ]);

    expect(parsed.edits[0]).toMatchObject({ language: "TypeScript", linesAdded: 3, decision: "undecided" });
  });

  it("does not count an interrupt notice as something the developer typed", () => {
    const parsed = parser().parse([promptLine("[Request interrupted by user]")]);
    expect(parsed.prompts).toEqual([]);
  });

  it("captures prompts but not tool results or injected context", () => {
    const parsed = parser().parse([
      promptLine("run the tests"),
      toolResultLine({ toolUseId: "t1" }),
      JSON.stringify({ type: "user", uuid: "m1", sessionId: "s1", timestamp: "2026-09-01T10:00:00.000Z", isMeta: true, message: { role: "user", content: "injected" } }),
    ]);

    expect(parsed.prompts).toHaveLength(1);
    expect(parsed.prompts[0]!.textNorm).toBe("run the tests");
  });

  it("reads turn duration from a system record", () => {
    const parsed = parser().parse([turnLine(42_000)]);
    expect(parsed.turns[0]).toMatchObject({ durationMs: 42_000, messageCount: 12 });
  });

  it("derives session bounds from the first and last timestamps seen", () => {
    const parsed = parser().parse([
      assistantLine({ uuid: "a1", ts: "2026-09-01T10:00:00.000Z" }),
      assistantLine({ uuid: "a2", ts: "2026-09-01T12:00:00.000Z" }),
    ]);

    expect(parsed.session).toMatchObject({
      sessionId: "s1",
      projectPath: "/repo",
      startedAt: "2026-09-01T10:00:00.000Z",
      endedAt: "2026-09-01T12:00:00.000Z",
    });
  });

  it("marks sidechain messages so subagent spend can be separated", () => {
    const parsed = parser().parse([assistantLine({ uuid: "a1", isSidechain: true })]);
    expect(parsed.messages[0]!.isSidechain).toBe(true);
  });
});

describe("isRejection", () => {
  it("matches every rejection phrasing Claude Code emits", () => {
    for (const marker of [
      "The user doesn't want to proceed with this tool use",
      "The user doesn't want to take this action",
      "The tool use was rejected",
      "Request interrupted by user",
      "[Request interrupted by user for tool use]",
    ]) {
      expect(isRejection(marker)).toBe(true);
    }
  });

  it("matches the bracketed interrupt notice in either spelling", () => {
    expect(isRejection("[Request interrupted by user]")).toBe(true);
    expect(isRejection("[Request interrupted by user for tool use]")).toBe(true);
  });

  it("does not fire on the same words inside file content", () => {
    expect(
      isRejection("export const MSG = \"The tool use was rejected\"; // sample fixture"),
    ).toBe(false);
  });
});
