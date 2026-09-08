import { describe, expect, it } from "vitest";
import { assistantLine, parser, promptLine, toolResultLine } from "./factories";

/**
 * Block capture: the only place this project keeps transcript text.
 *
 * Everything else here counts things. These rows exist because the trace page
 * has to show what was actually sent, and `tool_call.inputNorm` deliberately
 * cannot - it collapses paths and numbers so two calls can be compared.
 */
describe("TranscriptParser block capture", () => {
  it("keeps the real tool arguments, not the normalised shape beside them", () => {
    const parsed = parser().parse([
      assistantLine({
        uuid: "a1",
        toolUses: [{
          id: "toolu_1", name: "Bash",
          input: { command: "grep -n 'port 3000' /repo/src/config.ts", timeout: 120000 },
        }],
      }),
    ]);

    const block = parsed.blocks.find((b) => b.kind === "tool_use")!;
    expect(block.toolUseId).toBe("toolu_1");
    expect(block.toolName).toBe("Bash");
    // The point of the table: the path and the number survive here...
    expect(block.content).toContain("/repo/src/config.ts");
    expect(block.content).toContain("3000");
    // ...while the row beside it still stores the comparable shape.
    expect(parsed.toolCalls[0]!.inputNorm).toContain("<path>");
  });

  it("stores a thinking block as measured-empty rather than skipping it", () => {
    // Every Claude Code version this tool has seen writes "" here. The row has
    // to exist so the page can say "thinking happened, text not recorded"
    // beside the token count, which a skipped row could never do.
    const parsed = parser().parse([
      assistantLine({ uuid: "a1", thinkingTexts: [""], thinking: 412 }),
    ]);

    const block = parsed.blocks.find((b) => b.kind === "thinking")!;
    expect(block.content).toBe("");
    expect(block.charLen).toBe(0);
    expect(parsed.messages[0]!.usage.thinkingTokens).toBe(412);
  });

  it("captures assistant prose and the prompt that preceded it", () => {
    const parsed = parser().parse([
      promptLine("Fix the login bug", { uuid: "p1" }),
      assistantLine({ uuid: "a1", texts: ["I will start by reading the auth module."] }),
    ]);

    expect(parsed.blocks.find((b) => b.kind === "prompt")!.content).toBe("Fix the login bug");
    expect(parsed.blocks.find((b) => b.kind === "text")!.content)
      .toBe("I will start by reading the auth module.");
  });

  it("keeps the prompt verbatim, where the prompt row keeps it lowercased", () => {
    const parsed = parser().parse([promptLine("Read /repo/src/App.tsx and TELL me", { uuid: "p1" })]);

    expect(parsed.blocks[0]!.content).toBe("Read /repo/src/App.tsx and TELL me");
    // The existing row is unchanged: normalised for comparison, as before.
    expect(parsed.prompts[0]!.textNorm).not.toContain("App.tsx");
  });

  it("captures a tool result body, and leaves result_bytes measuring the whole thing", () => {
    const long = "x".repeat(5_000);
    const parsed = parser("test", 2_000).parse([toolResultLine({ toolUseId: "toolu_1", text: long })]);

    const block = parsed.blocks.find((b) => b.kind === "tool_result")!;
    expect(block.content).toHaveLength(2_000);
    expect(block.charLen).toBe(5_000);
    // The measurement is not capped, only the display copy is.
    expect(parsed.toolResults[0]!.resultBytes).toBe(5_000);
  });

  it("records the true length when it caps, so the page can say what it cut", () => {
    const parsed = parser("test", 10).parse([
      assistantLine({ uuid: "a1", texts: ["abcdefghijklmnopqrstuvwxyz"] }),
    ]);

    const block = parsed.blocks[0]!;
    expect(block.content).toBe("abcdefghij");
    expect(block.charLen).toBe(26);
    expect(block.charLen).toBeGreaterThan(block.content.length);
  });

  it("counts seq over every block, so an id does not move if capture rules change", () => {
    const parsed = parser().parse([
      assistantLine({
        uuid: "a1",
        thinkingTexts: [""],
        texts: ["one"],
        toolUses: [{ id: "toolu_1", name: "Read", input: { file_path: "/a.ts" } }],
      }),
    ]);

    expect(parsed.blocks.map((b) => [b.seq, b.kind])).toEqual([
      [0, "thinking"], [1, "text"], [2, "tool_use"],
    ]);
  });

  /**
   * The off switch has to be a switch, not a filter: nothing may reach the
   * database at all, and every existing row must be untouched by flipping it.
   */
  it("captures nothing when trace text is off, and changes no other row", () => {
    const lines = [
      promptLine("Fix the login bug", { uuid: "p1" }),
      assistantLine({
        uuid: "a1", texts: ["ok"], thinkingTexts: [""],
        toolUses: [{ id: "toolu_1", name: "Read", input: { file_path: "/a.ts" } }],
      }),
      toolResultLine({ toolUseId: "toolu_1", text: "file contents" }),
    ];

    const on = parser("test", 2_000).parse(lines);
    const off = parser("test", null).parse(lines);

    expect(off.blocks).toEqual([]);
    expect(on.blocks.length).toBeGreaterThan(0);
    expect(off.messages).toEqual(on.messages);
    expect(off.toolCalls).toEqual(on.toolCalls);
    expect(off.toolResults).toEqual(on.toolResults);
    expect(off.prompts).toEqual(on.prompts);
  });

  it("still suppresses an interrupt notice, which is a marker and not a prompt", () => {
    const parsed = parser().parse([promptLine("Request interrupted by user", { uuid: "p1" })]);

    expect(parsed.prompts).toEqual([]);
    expect(parsed.blocks.filter((b) => b.kind === "prompt")).toEqual([]);
  });
});
