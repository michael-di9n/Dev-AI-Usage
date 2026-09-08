import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRACE_ROWS, EPOCH, buildTrace, capTree, countNodes, traceRowsOf,
  type TraceInput, type TraceNode,
} from "../src/domain/traceTree";
import type { TraceBlockRow, TraceMessageRow, TraceSpanRow } from "../src/domain/types";

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

const flatten = (nodes: TraceNode[]): TraceNode[] =>
  nodes.flatMap((n) => [n, ...flatten(n.children)]);

describe("joining a tool call to its result", () => {
  /**
   * These pin the join that used to be a `blocks.find()` per tool call - a
   * linear scan of the whole session, inside a loop over the whole session.
   * On a real 24,396-block run that was 194 million comparisons and 1.07
   * seconds of a 17-second page load. It is a Map now, and the point of these
   * is that the answers did not move.
   */
  it("matches a result to its call, and leaves an unanswered call answered by nothing", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1" })],
      blocks: [
        block({ messageUuid: "a1", kind: "tool_use", seq: 0, toolUseId: "toolu_1", toolName: "Read" }),
        block({ messageUuid: "a1", kind: "tool_use", seq: 1, toolUseId: "toolu_never", toolName: "Bash" }),
        block({ messageUuid: "u1", kind: "tool_result", seq: 0, toolUseId: "toolu_1", content: "the answer", charLen: 10 }),
      ],
    }));

    const tools = flatten(tree.roots).filter((n) => n.kind === "tool");
    expect(tools).toHaveLength(2);

    const answered = tools.find((n) => n.label.includes("Read"))!;
    expect(answered.children.map((c) => c.body), "the result hangs off the call").toEqual(["the answer"]);

    // A call nothing answered is a call with no result, never an error and
    // never a fabricated empty one.
    const unanswered = tools.find((n) => n.label.includes("Bash"))!;
    expect(unanswered.children).toEqual([]);
  });

  /**
   * Two results claiming one call is malformed either way. `.find()` took the
   * first in document order, so the Map does too - insertion order must not be
   * what decides it.
   */
  it("takes the first result in document order when two claim the same call", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1" })],
      blocks: [
        block({ messageUuid: "a1", kind: "tool_use", toolUseId: "toolu_1", toolName: "Read" }),
        block({ messageUuid: "u1", kind: "tool_result", seq: 0, toolUseId: "toolu_1", content: "first", charLen: 5 }),
        block({ messageUuid: "u2", kind: "tool_result", seq: 1, toolUseId: "toolu_1", content: "second", charLen: 6 }),
      ],
    }));

    const tool = flatten(tree.roots).find((n) => n.kind === "tool")!;
    expect(tool.children.map((c) => c.body)).toEqual(["first"]);
  });

  /** A result block is not a call, and must not be matched to itself. */
  it("never joins a call to a block of some other kind carrying the same id", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1" })],
      blocks: [
        block({ messageUuid: "a1", kind: "tool_use", toolUseId: "toolu_1", toolName: "Read" }),
        block({ messageUuid: "a1", kind: "text", seq: 1, toolUseId: "toolu_1", content: "not a result", charLen: 12 }),
      ],
    }));

    expect(flatten(tree.roots).find((n) => n.kind === "tool")!.children).toEqual([]);
  });
});

describe("which prompt owns a message", () => {
  /**
   * `ownerOf` walks the prompt boundaries backwards and stops at the first
   * match rather than scanning all of them for every message. Same answer,
   * and these say what "same" means at the edges.
   */
  it("gives a message to the last prompt at or before it", () => {
    const tree = buildTrace(input({
      messages: [
        message({ uuid: "a1", ts: "2026-09-01T10:00:30.000Z" }),
        message({ uuid: "a2", ts: "2026-09-01T10:02:00.000Z" }),
      ],
      blocks: [
        block({ messageUuid: "p1", kind: "prompt", ts: "2026-09-01T10:00:00.000Z", content: "first", charLen: 5 }),
        block({ messageUuid: "p2", kind: "prompt", ts: "2026-09-01T10:01:00.000Z", content: "second", charLen: 6 }),
        block({ messageUuid: "a1", kind: "text", ts: "2026-09-01T10:00:30.000Z", content: "under first", charLen: 11 }),
        block({ messageUuid: "a2", kind: "text", ts: "2026-09-01T10:02:00.000Z", content: "under second", charLen: 12 }),
      ],
    }));

    const prompts = tree.roots.filter((n) => n.kind === "prompt");
    expect(prompts.map((p) => p.label)).toEqual(["first", "second"]);
    expect(flatten([prompts[0]!]).some((n) => n.body === "under first")).toBe(true);
    expect(flatten([prompts[1]!]).some((n) => n.body === "under second")).toBe(true);
  });

  /** A message exactly on a boundary belongs to that prompt, not the one before. */
  it("gives a message landing exactly on a prompt to that prompt", () => {
    const at = "2026-09-01T10:01:00.000Z";
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1", ts: at })],
      blocks: [
        block({ messageUuid: "p1", kind: "prompt", ts: "2026-09-01T10:00:00.000Z", content: "first", charLen: 5 }),
        block({ messageUuid: "p2", kind: "prompt", ts: at, content: "second", charLen: 6 }),
        block({ messageUuid: "a1", kind: "text", ts: at, content: "on the boundary", charLen: 15 }),
      ],
    }));

    const second = tree.roots.filter((n) => n.kind === "prompt").find((p) => p.label === "second")!;
    expect(flatten([second]).some((n) => n.body === "on the boundary")).toBe(true);
  });

  /**
   * Work before every captured prompt still happened, and gets its own root
   * rather than being attached to a prompt that had not been written yet.
   */
  it("keeps work that precedes every prompt under its own heading", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1", ts: "2026-09-01T09:00:00.000Z" })],
      blocks: [
        block({ messageUuid: "p1", kind: "prompt", ts: "2026-09-01T10:00:00.000Z", content: "later", charLen: 5 }),
        block({ messageUuid: "a1", kind: "text", ts: "2026-09-01T09:00:00.000Z", content: "early", charLen: 5 }),
      ],
    }));

    const before = tree.roots.find((n) => n.id === "p:before-first-prompt")!;
    expect(before, "an orphan is never silently dropped").toBeDefined();
    expect(flatten([before]).some((n) => n.body === "early")).toBe(true);
  });
});

describe("buildTrace", () => {
  /**
   * The case that decides whether this page is worth having. Traces are off by
   * default and cannot be backfilled, so a tree that needed them would be
   * empty for every session anyone already has.
   */
  it("builds the whole tree from the transcript alone, with no spans at all", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1", requestId: "req_1" })],
      blocks: [
        block({ messageUuid: "p1", kind: "prompt", content: "Fix the login bug", charLen: 17 }),
        block({
          messageUuid: "a1", kind: "tool_use", seq: 1, toolUseId: "toolu_1",
          toolName: "Read", content: '{"file_path":"/repo/a.ts"}', charLen: 26,
        }),
      ],
    }));

    const kinds = flatten(tree.roots).map((n) => n.kind);
    expect(kinds).toContain("prompt");
    expect(kinds).toContain("message");
    expect(kinds).toContain("tool");
    expect(tree.everyDurationMissing).toBe(true);
  });

  it("leaves every duration null when nothing measured one", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1" })],
      blocks: [block({
        messageUuid: "a1", kind: "tool_use", toolUseId: "toolu_1", toolName: "Read",
      })],
    }));

    for (const node of flatten(tree.roots)) {
      expect(node.durationMs).toBeNull();
      expect(node.durationMs).not.toBe(0);
      expect(node.durationFrom).toBeNull();
    }
  });

  it("takes a tool duration from a span, and says it came from otel", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1" })],
      blocks: [block({ messageUuid: "a1", kind: "tool_use", toolUseId: "toolu_1", toolName: "Read" })],
      spans: [span({ spanId: "s1", name: "claude_code.tool", toolUseId: "toolu_1", durationMs: 240 })],
    }));

    const tool = flatten(tree.roots).find((n) => n.kind === "tool")!;
    expect(tool.durationMs).toBe(240);
    expect(tool.durationFrom).toBe("otel");
    expect(tree.spansJoined).toBe(1);
  });

  it("falls back to a hook duration, and says so, when no span arrived", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1" })],
      blocks: [block({ messageUuid: "a1", kind: "tool_use", toolUseId: "toolu_1", toolName: "Read" })],
      toolDurations: new Map([["toolu_1", 90]]),
    }));

    const tool = flatten(tree.roots).find((n) => n.kind === "tool")!;
    expect(tool.durationMs).toBe(90);
    expect(tool.durationFrom).toBe("hook");
  });

  it("prefers the span over the hook when both measured the same call", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1" })],
      blocks: [block({ messageUuid: "a1", kind: "tool_use", toolUseId: "toolu_1", toolName: "Read" })],
      toolDurations: new Map([["toolu_1", 90]]),
      spans: [span({ spanId: "s1", name: "claude_code.tool", toolUseId: "toolu_1", durationMs: 240 })],
    }));

    expect(flatten(tree.roots).find((n) => n.kind === "tool")!.durationMs).toBe(240);
  });

  /** Silently dropping a span is how a viewer starts lying about what ran. */
  it("reports a span that joined nothing rather than dropping it", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1" })],
      spans: [span({ spanId: "orphan", name: "claude_code.tool.execution", parentSpanId: "gone" })],
    }));

    expect(tree.unjoined).toEqual([{ name: "claude_code.tool.execution", durationMs: 100 }]);
    expect(tree.spansJoined).toBe(0);
  });

  /**
   * Measured on the real corpus: no sidechain message's parent is ever a
   * tool_use id, so nesting a subagent under the Task that spawned it would be
   * a guess. They are siblings, grouped by a key the transcript really has.
   */
  it("groups subagent messages into their own run, not into the main thread", () => {
    const tree = buildTrace(input({
      messages: [
        message({ uuid: "a1" }),
        message({ uuid: "sub1", isSidechain: true, parentUuid: "nothing-here" }),
        message({ uuid: "sub2", isSidechain: true, parentUuid: "sub1" }),
      ],
      blocks: [block({ messageUuid: "p1", kind: "prompt", content: "go", charLen: 2 })],
    }));

    const subagents = tree.roots.filter((n) => n.kind === "subagent");
    expect(subagents).toHaveLength(1);
    expect(subagents[0]!.children).toHaveLength(2);
    // and the main thread does not contain them
    const prompt = tree.roots.find((n) => n.kind === "prompt")!;
    expect(flatten(prompt.children).map((n) => n.id)).not.toContain("m:sub1");
  });

  it("separates two subagent runs that share no parent chain", () => {
    const tree = buildTrace(input({
      messages: [
        message({ uuid: "r1", isSidechain: true, parentUuid: null }),
        message({ uuid: "r1b", isSidechain: true, parentUuid: "r1" }),
        message({ uuid: "r2", isSidechain: true, parentUuid: null }),
      ],
    }));

    expect(tree.roots.filter((n) => n.kind === "subagent")).toHaveLength(2);
  });

  it("does not hang on a parent cycle", () => {
    const tree = buildTrace(input({
      messages: [
        message({ uuid: "c1", isSidechain: true, parentUuid: "c2" }),
        message({ uuid: "c2", isSidechain: true, parentUuid: "c1" }),
      ],
    }));

    expect(tree.roots.filter((n) => n.kind === "subagent").length).toBeGreaterThan(0);
  });

  /** An epoch stamp means "no usable time", and unordered is not earliest. */
  it("treats an epoch timestamp as unknown and sorts it last", () => {
    const tree = buildTrace(input({
      blocks: [
        block({ messageUuid: "p_epoch", kind: "prompt", ts: EPOCH, content: "unknown time", charLen: 12 }),
        block({ messageUuid: "p_real", kind: "prompt", ts: "2026-09-01T11:00:00.000Z", content: "later", charLen: 5 }),
      ],
    }));

    expect(tree.roots.map((n) => n.at)).toEqual(["2026-09-01T11:00:00.000Z", null]);
  });

  it("counts truncated bodies so the page can say what it cut", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1" })],
      blocks: [block({
        messageUuid: "a1", kind: "text", content: "x".repeat(2_000), charLen: 45_976,
      })],
    }));

    expect(tree.truncated).toBe(1);
    const text = flatten(tree.roots).find((n) => n.kind === "text")!;
    expect(text.charLen).toBe(45_976);
    expect(text.body).toHaveLength(2_000);
  });

  it("shows a thinking row with its token count, since the text is never recorded", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1", thinkingTokens: 412 })],
      blocks: [block({ messageUuid: "a1", kind: "thinking", content: "", charLen: 0 })],
    }));

    const thinking = flatten(tree.roots).find((n) => n.kind === "thinking")!;
    expect(thinking.body).toBe("");
    expect(thinking.charLen).toBe(0);
    expect(thinking.facts).toContainEqual(["tokens", "412"]);
  });

  it("hangs a tool result under the call it answers", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1" })],
      blocks: [
        block({ messageUuid: "a1", kind: "tool_use", seq: 0, toolUseId: "toolu_1", toolName: "Read" }),
        block({ messageUuid: "u1", kind: "tool_result", seq: 0, toolUseId: "toolu_1", content: "file body", charLen: 9 }),
      ],
    }));

    const tool = flatten(tree.roots).find((n) => n.kind === "tool")!;
    expect(tool.children.map((c) => c.body)).toEqual(["file body"]);
  });

  it("keeps assistant work that happened before the first captured prompt", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1", ts: "2026-09-01T09:00:00.000Z" })],
      blocks: [block({ messageUuid: "p1", kind: "prompt", ts: "2026-09-01T10:00:00.000Z", content: "later", charLen: 5 })],
    }));

    const early = tree.roots.find((n) => n.id === "p:before-first-prompt");
    expect(early?.children.map((c) => c.id)).toEqual(["m:a1"]);
  });

  it("gives every node a unique id, so React keys and DOM ids stay stable", () => {
    const tree = buildTrace(input({
      messages: [message({ uuid: "a1" }), message({ uuid: "a2" })],
      blocks: [
        block({ messageUuid: "p1", kind: "prompt", content: "go", charLen: 2 }),
        block({ messageUuid: "a1", kind: "text", seq: 0, content: "one", charLen: 3 }),
        block({ messageUuid: "a2", kind: "text", seq: 0, content: "two", charLen: 3 }),
      ],
    }));

    const ids = flatten(tree.roots).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("survives a session with nothing in it", () => {
    const tree = buildTrace(input());
    expect(tree.roots).toEqual([]);
    expect(tree.unjoined).toEqual([]);
  });
});

describe("capTree", () => {
  /** A node with `n` children, so a tree of a known size is easy to state. */
  const node = (id: string, children: TraceNode[] = []): TraceNode => ({
    id, kind: "message", label: id, at: EPOCH, durationMs: null, durationFrom: null,
    body: null, charLen: null, facts: [], children,
  });

  /** Three roots of three nodes each: 9 nodes, depth 2. */
  const forest = (): TraceNode[] => [
    node("a", [node("a1"), node("a2")]),
    node("b", [node("b1"), node("b2")]),
    node("c", [node("c1"), node("c2")]),
  ];

  it("counts every node, not every root", () => {
    expect(countNodes(forest())).toBe(9);
  });

  /**
   * The budget is rows, because rows are what cost the 15.7 seconds. Counting
   * roots instead would have let one root of 40,000 nodes through untouched,
   * which is the exact case this exists for.
   */
  it("draws exactly the budget in nodes, counted through the whole tree", () => {
    const capped = capTree(forest(), 4);

    expect(capped.shown, "four nodes, not four roots").toBe(4);
    expect(countNodes(capped.roots)).toBe(4);
    expect(capped.total, "and says how many there were").toBe(9);
    // Depth-first, in the order they were already in.
    expect(capped.roots.map((r) => r.id)).toEqual(["a", "b"]);
    expect(capped.roots[0]!.children.map((c) => c.id)).toEqual(["a1", "a2"]);
    expect(capped.roots[1]!.children).toEqual([]);
  });

  it("hands back the same tree when the budget covers it", () => {
    const roots = forest();
    const capped = capTree(roots, 9);

    expect(capped.roots, "no copy when nothing was withheld").toBe(roots);
    expect(capped.shown).toBe(9);
    expect(capped.total).toBe(9);
    // shown < total is the page's whole test for whether to offer more, so it
    // must be false the moment everything is on screen.
    expect(capped.shown < capped.total).toBe(false);
  });

  it("still draws something when one root is larger than the whole budget", () => {
    const huge = [node("big", Array.from({ length: 50 }, (_, i) => node(`k${i}`)))];
    const capped = capTree(huge, 5);

    // Whole roots as the unit would have shown a blank page here.
    expect(capped.roots).toHaveLength(1);
    expect(capped.shown).toBe(5);
    expect(capped.total).toBe(51);
    expect(capped.roots[0]!.children).toHaveLength(4);
  });

  it("never mutates the tree it was given", () => {
    const roots = forest();
    capTree(roots, 2);

    expect(countNodes(roots), "the export still needs every node").toBe(9);
    expect(roots[0]!.children).toHaveLength(2);
  });

  it("treats an empty run as a measured zero", () => {
    expect(capTree([], 500)).toEqual({ roots: [], shown: 0, total: 0 });
  });
});

describe("traceRowsOf", () => {
  /**
   * `app_state` holds strings this code did not write - an older build's
   * value, or a row edited by hand. Following `traceWindowOf`: fall back
   * rather than throw, because a page that will not render is a worse answer
   * than a page showing the first 500 rows.
   */
  it("falls back for anything that is not a positive whole number", () => {
    for (const stored of [null, "", "0", "-1", "abc", "1.5", "1e999", "NaN"]) {
      expect(traceRowsOf(stored), `stored ${JSON.stringify(stored)}`).toBe(DEFAULT_TRACE_ROWS);
    }
  });

  it("keeps a stored budget the reader actually chose", () => {
    expect(traceRowsOf("1000")).toBe(1000);
    expect(traceRowsOf("47628")).toBe(47628);
  });
});
