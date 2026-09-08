import { describe, expect, it } from "vitest";
import { DEFAULT_PATH_STEPS, buildPath } from "../src/domain/tracePath";
import { buildTrace, type TraceInput } from "../src/domain/traceTree";
import type { TraceBlockRow, TraceMessageRow, TraceSpanRow } from "../src/domain/types";

/**
 * The path is built from a real tree, not from hand-written nodes.
 *
 * It could take nodes directly and every test here would be shorter. It would
 * also stop testing the thing that breaks: the path's whole job is to read the
 * shape `buildTrace` produces - tools nested under messages nested under
 * prompts, subagents as siblings - and a fixture that asserts that shape from
 * memory passes forever after the shape changes.
 */

const message = (over: Partial<TraceMessageRow> & { uuid: string }): TraceMessageRow => ({
  parentUuid: null, role: "assistant", model: "claude-opus-5",
  ts: "2026-09-01T10:00:00.000Z", isSidechain: false, requestId: null,
  inputTokens: 0, outputTokens: 0, thinkingTokens: 0, stopReason: null, costUsd: null,
  ...over,
});

const block = (over: Partial<TraceBlockRow> & { messageUuid: string; kind: string }): TraceBlockRow => ({
  seq: 0, ts: "2026-09-01T10:00:00.000Z", toolUseId: null, toolName: null,
  content: "", charLen: 0, ...over,
});

const span = (over: Partial<TraceSpanRow> & { spanId: string; name: string }): TraceSpanRow => ({
  parentSpanId: null, toolUseId: null, requestId: null,
  startedAt: "2026-09-01T10:00:00.000Z", durationMs: 100, ...over,
});

const input = (over: Partial<TraceInput> = {}): TraceInput => ({
  messages: [], blocks: [], toolDurations: new Map(), toolNames: new Map(), spans: [],
  ...over,
});

/** A prompt at `t`, one assistant message under it, and the tools it called. */
function run(tools: { name: string; args?: string; id?: string; at?: string }[]) {
  const blocks: TraceBlockRow[] = [
    block({ messageUuid: "u0", kind: "prompt", seq: 0, content: "do the thing", charLen: 12 }),
  ];
  tools.forEach((t, i) => {
    blocks.push(block({
      messageUuid: "a1",
      kind: "tool_use",
      seq: i,
      ts: t.at ?? `2026-09-01T10:00:${String(i + 1).padStart(2, "0")}.000Z`,
      toolUseId: t.id ?? `toolu_${i}`,
      toolName: t.name,
      content: t.args ?? "{}",
      charLen: (t.args ?? "{}").length,
    }));
  });
  return { messages: [message({ uuid: "a1" })], blocks };
}

const pathOf = (over: Partial<TraceInput>, limit?: number) =>
  buildPath(buildTrace(input(over)).roots, limit);

describe("what each step is", () => {
  it("tells a harness tool, an MCP tool, a skill and a subagent apart", () => {
    const path = pathOf(run([
      { name: "Bash" },
      { name: "mcp__claude-in-chrome__navigate" },
      { name: "Skill", args: JSON.stringify({ skill: "claude-api" }) },
      { name: "Agent", args: JSON.stringify({ subagent_type: "Explore", description: "find the thing" }) },
    ]));

    expect(path.steps.map((s) => s.kind)).toEqual([
      "user", "tool", "mcp", "skill", "subagent",
    ]);
  });

  it("splits an MCP name into the server and the tool, so the strip can show which server", () => {
    const path = pathOf(run([{ name: "mcp__claude-in-chrome__tabs_context_mcp" }]));
    const step = path.steps.find((s) => s.kind === "mcp")!;

    expect(Object.fromEntries(step.facts)).toMatchObject({
      server: "claude-in-chrome",
      tool: "tabs_context_mcp",
    });
    // The label is the tool, not the whole 39-character name.
    expect(step.label).not.toContain("mcp__");
  });

  it("keeps the whole tail when a server name is followed by more separators", () => {
    const path = pathOf(run([{ name: "mcp__srv__a__b" }]));
    expect(Object.fromEntries(path.steps[1]!.facts)).toMatchObject({ server: "srv", tool: "a__b" });
  });

  it("treats a bare mcp__ prefix with nothing after it as an ordinary tool, not a nameless server", () => {
    const path = pathOf(run([{ name: "mcp__lonely" }]));
    expect(path.steps[1]!.kind).toBe("tool");
    expect(path.steps[1]!.label).toBe("mcp__lonely");
  });

  it("names the skill that was invoked, from the arguments", () => {
    const path = pathOf(run([
      { name: "Skill", args: JSON.stringify({ skill: "jira-updates", args: "since 2026-08-08" }) },
    ]));
    const step = path.steps[1]!;

    expect(step.label).toBe("jira-updates");
    expect(Object.fromEntries(step.facts)).toMatchObject({
      skill: "jira-updates",
      args: "since 2026-08-08",
    });
  });

  it("names the subagent type and what it was asked to do", () => {
    const path = pathOf(run([
      { name: "Agent", args: JSON.stringify({ subagent_type: "Explore", description: "map the annotations" }) },
    ]));

    expect(path.steps[1]!.label).toBe("Explore");
    expect(Object.fromEntries(path.steps[1]!.facts)).toMatchObject({
      subagent: "Explore",
      doing: "map the annotations",
    });
  });

  it("still classifies the older Task name as a subagent", () => {
    const path = pathOf(run([{ name: "Task", args: JSON.stringify({ subagent_type: "Plan" }) }]));
    expect(path.steps[1]!.kind).toBe("subagent");
    expect(path.steps[1]!.label).toBe("Plan");
  });

  /**
   * Bodies are capped at DEV_AI_USAGE_TRACE_CHARS, so a call with a long
   * prompt in it arrives as JSON that stops mid-string. The step still
   * happened; inventing a skill name for it would be worse than saying less.
   */
  it("falls back to the tool's own name when the arguments will not parse and hold no name", () => {
    const truncated = '{"args":"a very long argument, and the skill name never arriv';
    const path = pathOf(run([{ name: "Skill", args: truncated }]));

    expect(path.steps[1]!.kind).toBe("skill");
    expect(path.steps[1]!.label).toBe("skill");
    expect(Object.fromEntries(path.steps[1]!.facts)).toMatchObject({ tool: "Skill" });
  });

  /**
   * Measured on the real corpus. An `Agent` call writes `description` and
   * `subagent_type` before its `prompt`; the prompt is what pushes the body
   * past the cap, so the JSON is cut while both names sit intact a few
   * characters earlier. The run of 1,018 tool calls drew two of its three
   * subagents as the bare word "subagent" until this was added.
   */
  it("reads a name straight out of a body whose JSON was cut short", () => {
    const cut = '{"description":"map the annotations","subagent_type":"Explore","prompt":"Explore the annota';
    const path = pathOf(run([{ name: "Agent", args: cut }]));

    expect(path.steps[1]!.label).toBe("Explore");
    expect(Object.fromEntries(path.steps[1]!.facts)).toMatchObject({
      subagent: "Explore",
      doing: "map the annotations",
    });
  });

  it("recovers a skill name from a cut body too", () => {
    const cut = '{"skill":"prep-release","args":"a very long argument that runs o';
    expect(pathOf(run([{ name: "Skill", args: cut }])).steps[1]!.label).toBe("prep-release");
  });

  /**
   * The scan matches a plain double-quoted value and nothing cleverer. A value
   * carrying an escape is left alone rather than half-decoded by hand, because
   * that is how a `\u0041` ends up printed on the strip as a step's name.
   */
  it("leaves a value with an escape in it to the fallback rather than half-decoding it", () => {
    const cut = '{"subagent_type":"Ex\\u0041plore","prompt":"and then';
    expect(pathOf(run([{ name: "Agent", args: cut }])).steps[1]!.label).toBe("subagent");
  });

  it("does not invent a name when the key is absent from a cut body", () => {
    const cut = '{"prompt":"go and do the thing which is a very long';
    expect(pathOf(run([{ name: "Agent", args: cut }])).steps[1]!.label).toBe("subagent");
  });

  it("does not read a name out of arguments that are not an object", () => {
    const path = pathOf(run([{ name: "Skill", args: '"claude-api"' }]));
    expect(path.steps[1]!.label).toBe("skill");
  });
});

describe("collapsing a run of the same call", () => {
  it("folds consecutive identical calls into one step with a count", () => {
    const path = pathOf(run([
      { name: "Bash" }, { name: "Bash" }, { name: "Bash" },
    ]));

    expect(path.steps.map((s) => [s.label, s.count])).toEqual([
      ["you", 1], ["Bash", 3],
    ]);
  });

  it("does not fold across a different call, because that would draw a path the run did not take", () => {
    const path = pathOf(run([
      { name: "Bash" }, { name: "Read" }, { name: "Bash" },
    ]));

    expect(path.steps.map((s) => [s.label, s.count])).toEqual([
      ["you", 1], ["Bash", 1], ["Read", 1], ["Bash", 1],
    ]);
  });

  /**
   * Every user step carries the same label, so nothing but an explicit rule
   * stops two prompts sent back to back from becoming one step reading
   * "you ×2". A turn boundary is what divides the run into turns; folding two
   * of them makes the strip claim the run had fewer turns than it did, and
   * only the first of the two prompts would have kept its text.
   */
  it("never folds one prompt into the prompt before it", () => {
    const path = buildPath(buildTrace(input({
      messages: [],
      blocks: [
        block({ messageUuid: "u0", kind: "prompt", seq: 0, ts: "2026-09-01T10:00:00.000Z", content: "first", charLen: 5 }),
        block({ messageUuid: "u1", kind: "prompt", seq: 0, ts: "2026-09-01T10:00:05.000Z", content: "second", charLen: 6 }),
      ],
    })).roots);

    expect(path.steps.map((s) => [s.kind, s.count])).toEqual([["user", 1], ["user", 1]]);
    expect(path.steps.map((s) => s.detail)).toEqual(["first", "second"]);
  });

  it("does not fold two MCP tools from the same server into each other", () => {
    const path = pathOf(run([
      { name: "mcp__chrome__navigate" }, { name: "mcp__chrome__computer" },
    ]));
    expect(path.steps).toHaveLength(3);
  });
});

describe("how long a step took", () => {
  const timed = (durations: (number | null)[]) => {
    const rows = run(durations.map((_, i) => ({ name: "Bash", id: `toolu_${i}` })));
    const toolDurations = new Map<string, number>();
    durations.forEach((ms, i) => { if (ms !== null) toolDurations.set(`toolu_${i}`, ms); });
    return pathOf({ ...rows, toolDurations });
  };

  it("sums the step when every call in it was measured", () => {
    const path = timed([100, 250, 50]);
    expect(path.steps[1]!.durationMs).toBe(400);
    expect(path.steps[1]!.durationFrom).toBe("hook");
    expect(path.steps[1]!.measured).toBe(3);
  });

  /**
   * The rule the tree already keeps, at step scale: a total that covers nine
   * of twelve calls is a smaller number presented as the whole. The dash is
   * the honest answer and the two counts are what make it checkable.
   */
  it("refuses the total when one call in the step was never measured", () => {
    const path = timed([100, null, 50]);

    expect(path.steps[1]!.durationMs).toBeNull();
    expect(path.steps[1]!.measured).toBe(2);
    expect(path.steps[1]!.count).toBe(3);
  });

  it("names no source when a step's calls were timed by different ones", () => {
    const rows = run([{ name: "Bash", id: "t0" }, { name: "Bash", id: "t1" }]);
    const path = pathOf({
      ...rows,
      toolDurations: new Map([["t1", 40]]),
      spans: [span({ spanId: "s0", name: "tool", toolUseId: "t0", durationMs: 60 })],
    });

    expect(path.steps[1]!.durationMs).toBe(100);
    expect(path.steps[1]!.durationFrom).toBeNull();
  });
});

describe("the whole run, in order", () => {
  it("starts a step at every prompt, so a session reads as its own sequence of turns", () => {
    const path = pathOf({
      messages: [
        message({ uuid: "a1", ts: "2026-09-01T10:00:10.000Z" }),
        message({ uuid: "a2", ts: "2026-09-01T10:01:10.000Z" }),
      ],
      blocks: [
        block({ messageUuid: "u0", kind: "prompt", seq: 0, ts: "2026-09-01T10:00:00.000Z", content: "first", charLen: 5 }),
        block({ messageUuid: "a1", kind: "tool_use", seq: 0, ts: "2026-09-01T10:00:11.000Z", toolUseId: "t0", toolName: "Read" }),
        block({ messageUuid: "u1", kind: "prompt", seq: 0, ts: "2026-09-01T10:01:00.000Z", content: "second", charLen: 6 }),
        block({ messageUuid: "a2", kind: "tool_use", seq: 0, ts: "2026-09-01T10:01:11.000Z", toolUseId: "t1", toolName: "Write" }),
      ],
    });

    expect(path.steps.map((s) => s.label)).toEqual(["you", "Read", "you", "Write"]);
  });

  /**
   * The mainline `Agent` call and the sidechain run it produced are one
   * launch recorded twice. Drawing both would double every subagent, and
   * walking into the sidechain would put its forty tool calls on a strip whose
   * whole purpose is to be shorter than that.
   */
  it("draws a subagent once, from the call that launched it, and never its inner work", () => {
    const path = pathOf({
      messages: [
        message({ uuid: "a1" }),
        message({ uuid: "sc1", isSidechain: true, ts: "2026-09-01T10:00:30.000Z" }),
      ],
      blocks: [
        block({ messageUuid: "u0", kind: "prompt", seq: 0, content: "go", charLen: 2 }),
        block({ messageUuid: "a1", kind: "tool_use", seq: 0, ts: "2026-09-01T10:00:10.000Z", toolUseId: "t0", toolName: "Agent", content: '{"subagent_type":"Explore"}', charLen: 27 }),
        block({ messageUuid: "sc1", kind: "tool_use", seq: 0, ts: "2026-09-01T10:00:31.000Z", toolUseId: "t9", toolName: "Grep" }),
      ],
    });

    expect(path.steps.map((s) => s.label)).toEqual(["you", "Explore"]);
    expect(path.steps.filter((s) => s.kind === "subagent")).toHaveLength(1);
  });

  /**
   * `buildTrace` invents a prompt root for assistant work that happened before
   * the first captured prompt. Labelling that step "you" would put words in
   * the reader's mouth: nobody asked for it, the transcript simply starts
   * mid-conversation.
   */
  it("does not call work that preceded every captured prompt something you asked for", () => {
    const path = pathOf({
      messages: [message({ uuid: "a1", ts: "2026-09-01T09:00:00.000Z" })],
      blocks: [
        block({ messageUuid: "a1", kind: "tool_use", seq: 0, ts: "2026-09-01T09:00:01.000Z", toolUseId: "t0", toolName: "Read" }),
        block({ messageUuid: "u0", kind: "prompt", seq: 0, ts: "2026-09-01T10:00:00.000Z", content: "now do this", charLen: 11 }),
      ],
    });

    expect(path.steps.map((s) => s.label)).toEqual(["before capture", "Read", "you"]);
    expect(path.steps[0]!.detail).toBeNull();
    expect(Object.fromEntries(path.steps[0]!.facts)).toMatchObject({
      what: "before the first captured prompt",
    });
  });

  it("caps the strip and says how many steps it withheld", () => {
    const names = Array.from({ length: 12 }, (_, i) => ({ name: `Tool${i}` }));
    const path = pathOf(run(names), 5);

    expect(path.steps).toHaveLength(5);
    expect(path.total).toBe(13); // the prompt plus twelve distinct tools
    expect(path.withheld).toBe(8);
  });

  it("withholds nothing when the whole run fits", () => {
    const path = pathOf(run([{ name: "Bash" }]));
    expect(path.withheld).toBe(0);
    expect(path.total).toBe(path.steps.length);
  });

  it("has a default budget, so a caller that does not choose one still gets a strip", () => {
    const names = Array.from({ length: DEFAULT_PATH_STEPS + 10 }, (_, i) => ({ name: `Tool${i}` }));
    expect(pathOf(run(names)).steps).toHaveLength(DEFAULT_PATH_STEPS);
  });
});

describe("a run with nothing in it", () => {
  it("returns an empty path rather than throwing", () => {
    const path = buildPath([]);
    expect(path).toMatchObject({ steps: [], withheld: 0, total: 0 });
  });
});
