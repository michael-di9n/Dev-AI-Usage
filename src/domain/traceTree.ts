/**
 * One session, as a tree.
 *
 * Pure: rows in, nodes out. No I/O, no clock, no database - which is what lets
 * every edge below be pinned by a test instead of found on a live corpus.
 *
 * The shape always comes from the transcript, and spans only decorate it. That
 * is the decision the whole page rests on: OpenTelemetry traces are off by
 * default and cannot be backfilled, so a tree that needed them would be empty
 * for every session anyone already has. With them on, the same tree gains real
 * durations; with them off, it gains em dashes. Nothing else differs.
 */

import type { TraceBlockRow, TraceMessageRow, TraceSpanRow } from "./types";

/**
 * What `nanosToIso` answers for a timestamp it could not read.
 *
 * A span stamped this did not happen in 1970 - it arrived without a usable
 * time. Sorting it to the top of the page is the loudest possible way to be
 * wrong about it, so it is treated as unknown and sorted last instead.
 */
export const EPOCH = "1970-01-01T00:00:00.000Z";

export type TraceKind =
  | "prompt" | "message" | "thinking" | "text" | "tool" | "subagent";

export interface TraceNode {
  /** Unique in the tree and stable across renders: drives keys and the DOM ids. */
  id: string;
  kind: TraceKind;
  label: string;
  /** Null when the only timestamp available was the epoch fallback. */
  at: string | null;
  /** NEVER 0 to mean "unknown". The null is the whole point of this field. */
  durationMs: number | null;
  /** Which source measured it, so a row can label a number it did not take itself. */
  durationFrom: "otel" | "hook" | null;
  /** The captured text, already capped. Null when this kind carries none. */
  body: string | null;
  /** True length before capping, so a row can say what it cut. */
  charLen: number | null;
  /** Small labelled values shown when the row is open. */
  facts: [string, string][];
  children: TraceNode[];
}

export interface TraceTree {
  roots: TraceNode[];
  /** Spans that matched no transcript row. Shown, never silently dropped. */
  unjoined: { name: string; durationMs: number | null }[];
  /** Counted so the page can state them rather than make the reader infer. */
  truncated: number;
  spansJoined: number;
  /** True when no duration anywhere came from a span or a hook. */
  everyDurationMissing: boolean;
  /** Thinking rows in this session, so the page can explain them once at the
   *  top rather than only inside each row a reader happens to open. */
  thinkingRows: number;
}

export interface TraceInput {
  messages: TraceMessageRow[];
  blocks: TraceBlockRow[];
  toolDurations: Map<string, number>;
  toolNames: Map<string, string>;
  spans: TraceSpanRow[];
}

export function buildTrace(input: TraceInput): TraceTree {
  const spansByTool = new Map<string, TraceSpanRow>();
  const spansByRequest = new Map<string, TraceSpanRow>();
  const claimed = new Set<string>();

  for (const span of input.spans) {
    if (span.toolUseId) spansByTool.set(span.toolUseId, span);
    // The llm_request span is the one that carries a request id; others do not.
    else if (span.requestId) spansByRequest.set(span.requestId, span);
  }

  const blocksByMessage = new Map<string, TraceBlockRow[]>();
  /**
   * Every tool_result, by the call it answers.
   *
   * Built once here rather than searched per call. It used to be a
   * `blocks.find()` run once for every tool_use block, which is a linear scan
   * of the whole session inside a loop over the whole session: measured at
   * 194 million comparisons and 1.07 seconds on a 24,396-block run, and 324
   * million on the largest. The same join through a Map is 2.1ms, and returns
   * the identical block for every one of them.
   *
   * First writer wins, which is what `.find()` did. Two results claiming one
   * call is malformed either way; picking the earlier one keeps document order
   * deciding it rather than insertion order.
   */
  const resultsByToolUse = new Map<string, TraceBlockRow>();
  for (const block of input.blocks) {
    const list = blocksByMessage.get(block.messageUuid) ?? [];
    list.push(block);
    blocksByMessage.set(block.messageUuid, list);

    if (block.kind === "tool_result" && block.toolUseId && !resultsByToolUse.has(block.toolUseId)) {
      resultsByToolUse.set(block.toolUseId, block);
    }
  }

  let truncated = 0;
  let measured = 0;
  let thinkingRows = 0;

  const bodyOf = (b: TraceBlockRow): { body: string; charLen: number } => {
    if (b.charLen > b.content.length) truncated += 1;
    return { body: b.content, charLen: b.charLen };
  };

  /** A message and everything it said, as one node. */
  const nodeForMessage = (m: TraceMessageRow): TraceNode => {
    const blocks = blocksByMessage.get(m.uuid) ?? [];
    const children: TraceNode[] = [];

    for (const b of blocks) {
      if (b.kind === "prompt") continue; // the prompt is the parent, not a child
      children.push(
        b.kind === "tool_use" ? nodeForTool(b) : nodeForBlock(m, b),
      );
    }

    const span = m.requestId ? spansByRequest.get(m.requestId) : undefined;
    if (span) claimed.add(span.spanId);
    if (span?.durationMs !== undefined && span.durationMs !== null) measured += 1;

    const facts: [string, string][] = [];
    if (m.model) facts.push(["model", m.model]);
    facts.push(["tokens", `${m.inputTokens} in / ${m.outputTokens} out`]);
    if (m.stopReason) facts.push(["stop", m.stopReason]);

    return {
      id: `m:${m.uuid}`,
      kind: "message",
      label: m.model ?? "assistant",
      at: instantOf(m.ts),
      durationMs: span?.durationMs ?? null,
      durationFrom: span?.durationMs === null || span === undefined ? null : "otel",
      body: null,
      charLen: null,
      facts,
      children,
    };
  };

  const nodeForTool = (b: TraceBlockRow): TraceNode => {
    const id = b.toolUseId;
    const span = id ? spansByTool.get(id) : undefined;
    if (span) claimed.add(span.spanId);

    // Precedence a reader can check in one line: span, then hook, then dash.
    // Labelled because the two measure slightly different windows, and showing
    // them as the same unlabelled number is a quiet lie.
    const hook = id ? input.toolDurations.get(id) : undefined;
    const durationMs = span?.durationMs ?? hook ?? null;
    const durationFrom = span?.durationMs != null ? "otel" : hook != null ? "hook" : null;
    if (durationMs !== null) measured += 1;

    const { body, charLen } = bodyOf(b);
    const result = id ? resultsByToolUse.get(id) ?? null : null;

    const children: TraceNode[] = [];
    if (result) {
      const r = bodyOf(result);
      children.push({
        id: `r:${result.messageUuid}:${result.seq}`,
        kind: "text",
        label: "result",
        at: instantOf(result.ts),
        durationMs: null,
        durationFrom: null,
        body: r.body,
        charLen: r.charLen,
        facts: [],
        children: [],
      });
    }

    return {
      id: `t:${id ?? `${b.messageUuid}:${b.seq}`}`,
      kind: "tool",
      label: b.toolName ?? (id ? input.toolNames.get(id) ?? "tool" : "tool"),
      at: instantOf(b.ts),
      durationMs,
      durationFrom,
      body,
      charLen,
      facts: id ? [["tool_use_id", id]] : [],
      children,
    };
  };

  const nodeForBlock = (m: TraceMessageRow, b: TraceBlockRow): TraceNode => {
    const { body, charLen } = bodyOf(b);
    const thinking = b.kind === "thinking";
    if (thinking) thinkingRows += 1;
    return {
      id: `b:${b.messageUuid}:${b.seq}`,
      kind: thinking ? "thinking" : "text",
      label: thinking ? "thinking" : "text",
      at: instantOf(b.ts),
      durationMs: null,
      durationFrom: null,
      body,
      charLen,
      // Thinking text is blank in every Claude Code version this tool has
      // seen, so the token count is the only real thing to show for it.
      facts: thinking ? [["tokens", String(m.thinkingTokens)]] : [],
      children: [],
    };
  };

  // --- assembly -------------------------------------------------------------

  const mainline = input.messages.filter((m) => !m.isSidechain);
  const sidechain = input.messages.filter((m) => m.isSidechain);

  const promptBlocks = input.blocks.filter((b) => b.kind === "prompt");
  const roots: TraceNode[] = [];

  // A prompt owns every assistant message until the next prompt. That is the
  // same span claude_code.interaction covers, which is why one renderer serves
  // both with and without OpenTelemetry.
  const boundaries = promptBlocks.map((p) => p.ts);
  /**
   * The last prompt at or before this instant, or -1 for work that preceded
   * every captured prompt.
   *
   * Walked from the end so it stops at the answer instead of scanning every
   * boundary for every message. `boundaries` is non-decreasing because
   * `input.blocks` arrives ordered by `ts`, so the first match from the end is
   * the same index the forward scan settled on.
   */
  const ownerOf = (ts: string): number => {
    for (let i = boundaries.length - 1; i >= 0; i -= 1) {
      if (boundaries[i]! <= ts) return i;
    }
    return -1;
  };

  const grouped = new Map<number, TraceNode[]>();
  for (const m of mainline) {
    if (m.role !== "assistant") continue;
    const key = ownerOf(m.ts);
    const list = grouped.get(key) ?? [];
    list.push(nodeForMessage(m));
    grouped.set(key, list);
  }

  promptBlocks.forEach((p, i) => {
    const { body, charLen } = bodyOf(p);
    roots.push({
      id: `p:${p.messageUuid}`,
      kind: "prompt",
      label: firstLine(p.content),
      at: instantOf(p.ts),
      durationMs: null,
      durationFrom: null,
      body,
      charLen,
      facts: [],
      children: grouped.get(i) ?? [],
    });
  });

  // Assistant work before the first captured prompt still happened.
  const orphanMessages = grouped.get(-1) ?? [];
  if (orphanMessages.length) {
    roots.unshift({
      id: "p:before-first-prompt",
      kind: "prompt",
      label: "before the first captured prompt",
      at: orphanMessages[0]!.at,
      durationMs: null, durationFrom: null, body: null, charLen: null,
      facts: [], children: orphanMessages,
    });
  }

  // Subagents are siblings, not children. Measured: no sidechain message's
  // parent is ever a tool_use id, so nesting one under the Task that spawned
  // it would be a guess dressed up as a fact. A run is instead one connected
  // parent_uuid component, which is a real key the transcript actually carries.
  for (const run of connectedRuns(sidechain)) {
    const children = run.map(nodeForMessage);
    roots.push({
      id: `s:${run[0]!.uuid}`,
      kind: "subagent",
      label: `subagent run — ${run.length} messages`,
      at: instantOf(run[0]!.ts),
      durationMs: null, durationFrom: null, body: null, charLen: null,
      facts: [["messages", String(run.length)]],
      children,
    });
  }

  const unjoined = input.spans
    .filter((s) => !claimed.has(s.spanId))
    .map((s) => ({ name: s.name, durationMs: s.durationMs }));

  return {
    roots: roots.sort(byInstant),
    unjoined,
    truncated,
    spansJoined: claimed.size,
    everyDurationMissing: measured === 0,
    thinkingRows,
  };
}

/**
 * Sidechain messages split into runs by walking parent_uuid within the
 * sidechain set. One connected component is one subagent run.
 */
function connectedRuns(sidechain: TraceMessageRow[]): TraceMessageRow[][] {
  const byUuid = new Map(sidechain.map((m) => [m.uuid, m]));
  const rootOf = new Map<string, string>();

  const find = (m: TraceMessageRow): string => {
    const seen = new Set<string>();
    let current = m;
    while (current.parentUuid && byUuid.has(current.parentUuid)) {
      if (seen.has(current.uuid)) break; // a cycle cannot hang the page
      seen.add(current.uuid);
      current = byUuid.get(current.parentUuid)!;
    }
    return current.uuid;
  };

  for (const m of sidechain) rootOf.set(m.uuid, find(m));

  const runs = new Map<string, TraceMessageRow[]>();
  for (const m of sidechain) {
    const key = rootOf.get(m.uuid)!;
    const list = runs.get(key) ?? [];
    list.push(m);
    runs.set(key, list);
  }
  return [...runs.values()];
}

/** An unusable timestamp is unknown, not 1970. */
function instantOf(ts: string): string | null {
  return !ts || ts === EPOCH ? null : ts;
}

/** Unknown sorts last. "Unordered" is not "earliest". */
function byInstant(a: TraceNode, b: TraceNode): number {
  if (a.at === null && b.at === null) return 0;
  if (a.at === null) return 1;
  if (b.at === null) return -1;
  return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
}

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 90 ? `${line.slice(0, 90)}…` : line || "(empty prompt)";
}

// ---------------------------------------------------------------------------
// How much of a tree to draw
// ---------------------------------------------------------------------------

/**
 * How many rows the page draws before it stops and offers the rest.
 *
 * A real run reaches 47,628 nodes, and drawing all of them cost 15.7 seconds
 * of a 17-second page load - not in the database, which answered in 150ms, and
 * not in the builder, but in rendering that many `<details>` elements and
 * serializing them twice, once as HTML and once as the payload Next inlines
 * beside it. The whole document measured 121MB.
 *
 * 500 is the same number `TRACEABLE_LIMIT` uses for the run list, and it is
 * chosen the same way: comfortably more than a reader takes in at once, small
 * enough that the page arrives immediately. A 500-row budget on that run covers
 * its first 41 prompts and subagent runs.
 */
export const DEFAULT_TRACE_ROWS = 500;

/** How many more rows `Show more` adds. Same step, so the count is predictable. */
export const TRACE_ROWS_STEP = 500;

export interface CappedTree {
  roots: TraceNode[];
  /** Rows actually drawn. */
  shown: number;
  /** Rows the run has. Equal to `shown` when nothing was withheld. */
  total: number;
}

/**
 * The stored row budget, or the default.
 *
 * Takes whatever came out of `app_state`, which is a string this code did not
 * write and may not recognise - an older build's value, or a row edited by
 * hand. Anything that is not a positive whole number falls back rather than
 * throwing, following `traceWindowOf`: a page that will not render is a worse
 * answer than a page showing the first 500 rows.
 */
export function traceRowsOf(stored: string | null): number {
  const n = Number(stored);
  return Number.isSafeInteger(n) && n > 0 ? n : DEFAULT_TRACE_ROWS;
}

/** Every node in a forest, counted. */
export function countNodes(nodes: TraceNode[]): number {
  return nodes.reduce((n, node) => n + 1 + countNodes(node.children), 0);
}

/**
 * The first `limit` rows of a tree, in the order they are already in.
 *
 * Depth-first and node-by-node rather than root-by-root, so one enormous root
 * cannot either blow the budget or, if whole roots were the unit, leave the
 * page blank because the first one did not fit.
 *
 * Chronological order is preserved exactly. It is the thing a trace is - a
 * timeline - and reordering to fit more prompts in would have bought a fuller
 * page by making it a different page. What the reader gets is the beginning of
 * the run, which is where reading it starts.
 *
 * Nothing is mutated: withheld children produce a new node, so the tree handed
 * to the export and the tree handed to the page stay independent.
 */
export function capTree(roots: TraceNode[], limit: number): CappedTree {
  const total = countNodes(roots);
  if (limit >= total) return { roots, shown: total, total };

  let left = limit;
  const take = (nodes: TraceNode[]): TraceNode[] => {
    const out: TraceNode[] = [];
    for (const node of nodes) {
      if (left <= 0) break;
      left -= 1;
      out.push({ ...node, children: take(node.children) });
    }
    return out;
  };

  const capped = take(roots);
  return { roots: capped, shown: limit - left, total };
}
