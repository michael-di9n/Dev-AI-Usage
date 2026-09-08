/**
 * One run, as the path it took.
 *
 * The tree below this says everything: every prompt, every tool call, every
 * argument, in full. That is the problem it has. A run of 47,628 rows answers
 * "what did it actually send to Bash on line 3,000" and cannot answer "what
 * did this run do", because the shape of the run is spread over more rows than
 * anyone scrolls. This is the same run flattened to one line of steps -
 * you, then the tools, then the MCP server, then the skill, then the subagent
 * - so the shape arrives before the detail does.
 *
 * Pure: nodes in, steps out. No I/O, no clock, no database, which is what lets
 * every classification below be pinned by a test rather than found on a live
 * corpus.
 *
 * Built from the WHOLE tree, never the capped one. `capTree` withholds rows
 * from being drawn; a summary of the first 500 of 47,628 rows would be a
 * summary of the scroll position, and it would say "62 steps" about a run that
 * took six hundred.
 */

import type { TraceNode } from "./traceTree";

/**
 * What a step is, which is the whole vocabulary of the strip.
 *
 * Four kinds of doing and one kind of asking. The distinction that matters is
 * `tool` against `mcp`: both are tool calls and the transcript records them
 * identically, but one runs in the harness and the other crosses a connection
 * to a server someone else is running - which is the single most useful thing
 * to be able to see at a glance about where a run's time went.
 */
export type StepKind = "user" | "tool" | "mcp" | "skill" | "subagent";

export interface PathStep {
  /** Unique in the path and stable across renders: drives keys and the DOM id. */
  id: string;
  kind: StepKind;
  /** What the strip prints under the icon. Short: it sits in a 90px column. */
  label: string;
  /**
   * How many calls this step collapsed.
   *
   * Always at least 1, and `1` means one call rather than "unknown". A run
   * that shells out 36 times in a row is one step saying ×36, because 36
   * identical icons is a texture rather than a path.
   */
  count: number;
  /**
   * The total wall clock, and only when every call in the step was measured.
   *
   * Null the moment one member is unmeasured. Summing the nine that were timed
   * and printing it as the step's duration would be the quiet lie the tree
   * already refuses: a smaller number, presented as the whole. `measured` and
   * `count` are both carried so the card can say "9 of 12 timed" instead.
   */
  durationMs: number | null;
  measured: number;
  /** Which source took it, when all of them agreed on one. Null when mixed. */
  durationFrom: "otel" | "hook" | null;
  /** First instant in the step, or null when nothing in it carried a usable one. */
  at: string | null;
  /** Small labelled values for the hover card. Same contract as `TraceNode.facts`. */
  facts: [string, string][];
  /** What was sent, already capped upstream. Null when this kind carries none. */
  detail: string | null;
}

export interface TracePath {
  steps: PathStep[];
  /** Steps the strip withheld. Never silently dropped - the strip prints it. */
  withheld: number;
  /** Steps the run has, drawn or not. `steps.length + withheld`. */
  total: number;
}

/**
 * How many steps the strip draws before it stops and counts the rest.
 *
 * Chosen off the strip rather than off the data: at ~92px a step, 40 of them
 * wrap to four rows on a laptop, and a fifth row is a paragraph of icons that
 * nobody reads left to right any more. Collapsing runs of the same tool does
 * most of the work first - the 36,772 Bash calls in this corpus are mostly
 * consecutive - so a run has to be genuinely varied to reach this.
 */
export const DEFAULT_PATH_STEPS = 40;

/**
 * How many more steps `+N more` adds.
 *
 * The same number as the default, so the strip doubles, then trebles - a
 * predictable step, the way `TRACE_ROWS_STEP` is for the tree.
 *
 * Why a stored budget and a server round trip at all, when the strip is
 * already a client component that could reveal steps it had been sent: because
 * of what a step carries. Measured on this corpus, the largest run reaches
 * around eleven thousand steps and 5.6MB of tool arguments between them, and
 * twenty-six runs pass four hundred steps. Sending all of them so the browser
 * can hide most is the same mistake as drawing every row of the tree, which
 * cost a 121MB document and 15.7 seconds - and it is measured in
 * `DEFAULT_TRACE_ROWS`, in this same file, which is a hard place to make it
 * twice.
 */
export const PATH_STEPS_STEP = 40;

/**
 * The stored step budget, or the default.
 *
 * Takes whatever came out of `app_state`, which is a string this code did not
 * write and may not recognise. Anything that is not a positive whole number
 * falls back rather than throwing, exactly as `traceRowsOf` does: a strip
 * showing the first forty steps is a better answer than a page that will not
 * render.
 */
export function pathStepsOf(stored: string | null): number {
  const n = Number(stored);
  return Number.isSafeInteger(n) && n > 0 ? n : DEFAULT_PATH_STEPS;
}

/**
 * How many of the drawn steps arrived with the most recent `+N more`.
 *
 * The strip animates those and leaves the rest alone, so an expansion reads as
 * the new steps attaching to a list that was already there rather than as the
 * whole strip redrawing itself.
 *
 * Derived rather than remembered. The budget only ever moves by
 * `PATH_STEPS_STEP`, so the newest batch is the tail - which means a reader
 * returning to the page with a raised budget stored sees that tail arrive
 * once more. That is the same reveal they asked for, so it is left alone.
 */
export function freshSteps(shown: number): number {
  return shown > DEFAULT_PATH_STEPS
    ? Math.min(PATH_STEPS_STEP, shown - DEFAULT_PATH_STEPS)
    : 0;
}

/**
 * How long a label may be before the strip cuts it.
 *
 * `mcp__claude-in-chrome__tabs_context_mcp` is 38 characters and the server
 * name is stripped from it before it gets here, which is most of the saving.
 * The card carries the whole thing either way.
 */
const LABEL_MAX = 18;

export function buildPath(
  roots: TraceNode[],
  limit: number = DEFAULT_PATH_STEPS,
): TracePath {
  const raw: PathStep[] = [];

  /*
   * Walked in the order the tree is already in, which is chronological -
   * `buildTrace` sorts its roots by instant and nothing below reorders. A path
   * is a timeline before it is anything else, so this must never sort.
   */
  for (const root of roots) {
    if (root.kind === "prompt") {
      raw.push(userStep(root));
      for (const message of root.children) collectTools(message, raw);
      continue;
    }

    /*
     * A subagent root is the same launch as the mainline `Agent` tool call
     * that spawned it - the transcript records both, one as the call and one
     * as the run it produced. The call is already in the path, in the right
     * place, so drawing the root as well would double every subagent. Its
     * children are not walked for the same reason the strip exists: a
     * subagent's own forty tool calls are the detail this is a summary of.
     */
    if (root.kind === "subagent") continue;

    collectTools(root, raw);
  }

  const collapsed = collapse(raw);

  return {
    steps: collapsed.slice(0, limit),
    withheld: Math.max(0, collapsed.length - limit),
    total: collapsed.length,
  };
}

/** Every tool call under a node, in order, appended to `out`. */
function collectTools(node: TraceNode, out: PathStep[]): void {
  if (node.kind === "tool") out.push(toolStep(node));
  for (const child of node.children) collectTools(child, out);
}

/**
 * A prompt, as the step that starts a turn.
 *
 * One prompt root is not a prompt: `buildTrace` invents a root for assistant
 * work that happened before the first captured prompt, and it is the only one
 * with no body. Labelling that "you" would put words in the reader's mouth -
 * nobody asked for it, the transcript simply starts mid-conversation - so it
 * says what it is and carries the tree's own name for it as a fact.
 */
function userStep(prompt: TraceNode): PathStep {
  const captured = prompt.body !== null;
  return {
    id: `s:${prompt.id}`,
    kind: "user",
    label: captured ? "you" : "before capture",
    count: 1,
    durationMs: null,
    measured: 0,
    durationFrom: null,
    at: prompt.at,
    facts: captured ? [] : [["what", prompt.label]],
    detail: prompt.body,
  };
}

/**
 * One tool call, classified.
 *
 * The classification is a rule table a reader can check, not a model and not a
 * heuristic: the tool's own name decides it, and the names are the ones the
 * transcript records. `Agent` is what Claude Code calls the subagent tool now;
 * `Task` was the older name and both are still in this corpus, so both are
 * listed rather than the newer one being assumed.
 */
function toolStep(node: TraceNode): PathStep {
  const name = node.label;
  const args = parseArgs(node.body);
  /** One named argument: parsed if the JSON held, read out of the text if not. */
  const arg = (key: string) => str(args[key]) ?? scanKey(node.body, key);

  const step = (over: Partial<PathStep> & { kind: StepKind; label: string }): PathStep => ({
    id: `s:${node.id}`,
    count: 1,
    durationMs: node.durationMs,
    measured: node.durationMs === null ? 0 : 1,
    durationFrom: node.durationFrom,
    at: node.at,
    facts: [["tool", name]],
    detail: node.body,
    ...over,
  });

  const server = mcpServerOf(name);
  if (server) {
    return step({
      kind: "mcp",
      label: clip(server.tool),
      facts: [["server", server.server], ["tool", server.tool]],
    });
  }

  if (name === "Skill") {
    /*
     * The skill's own name, when the arguments parsed. They are capped
     * upstream and a long `args` string can leave the JSON unterminated, so
     * the fallback is the tool name - which is true, just less useful. An
     * invented skill name would not be.
     */
    const skill = arg("skill");
    return step({
      kind: "skill",
      label: clip(skill ?? "skill"),
      facts: named([["skill", skill], ["args", arg("args")], ["tool", name]]),
    });
  }

  if (name === "Agent" || name === "Task") {
    const type = arg("subagent_type");
    const what = arg("description");
    return step({
      kind: "subagent",
      label: clip(type ?? "subagent"),
      facts: named([["subagent", type], ["doing", what], ["tool", name]]),
    });
  }

  return step({ kind: "tool", label: clip(name) });
}

/**
 * The server and tool inside an MCP tool name, or null for anything else.
 *
 * `mcp__claude-in-chrome__navigate` is the shape Claude Code writes, and the
 * server name can itself contain the separator in principle - so the split
 * takes the first two segments and rejoins the rest, rather than assuming
 * exactly three. A name that starts with the prefix and carries nothing after
 * it is not an MCP call this can describe, so it falls through to `tool` and
 * keeps its own name.
 */
function mcpServerOf(name: string): { server: string; tool: string } | null {
  if (!name.startsWith("mcp__")) return null;
  const parts = name.slice(5).split("__");
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return { server: parts[0], tool: parts.slice(1).join("__") };
}

/**
 * A tool call's arguments, or nothing.
 *
 * `content` is capped at `DEV_AI_USAGE_TRACE_CHARS`, so a call with a long
 * prompt in it arrives as JSON that stops mid-string. That is not an error
 * here and must not throw: the step still happened, and it is drawn with the
 * tool's own name. Every caller treats an empty object as "the arguments did
 * not tell me", which is the honest reading of a truncated body.
 */
function parseArgs(body: string | null): Record<string, unknown> {
  if (!body) return {};
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * One string value, read straight out of a body whose JSON did not parse.
 *
 * Not a second parser and not a guess: the value is verbatim in the text this
 * already holds, and this finds it. Measured on the real corpus, which is why
 * it exists - an `Agent` call writes `description` and `subagent_type` before
 * its `prompt`, the prompt is what pushes the body past the cap, and the run
 * of 1,018 tool calls drew two of its three subagents as the bare word
 * "subagent" while their types sat in the recorded text a few characters
 * earlier.
 *
 * Deliberately narrow. It matches a plain double-quoted value with no escapes
 * in it and gives up on anything else, because half-decoding a JSON string by
 * hand is how a path label ends up with a `\u0041` in it. Giving up returns
 * the tool's own name, which is where this started.
 */
function scanKey(body: string | null, key: string): string | null {
  if (!body) return null;
  const found = new RegExp(`"${key}"\\s*:\\s*"([^"\\\\]*)"`).exec(body);
  return found?.[1] ? found[1] : null;
}

/** A string argument, or null. A number where a name was expected is not a name. */
function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** The facts that have a value. A `dt` over an empty `dd` is a row of nothing. */
function named(pairs: [string, string | null][]): [string, string][] {
  return pairs.filter((p): p is [string, string] => p[1] !== null);
}

function clip(label: string): string {
  return label.length > LABEL_MAX ? `${label.slice(0, LABEL_MAX - 1)}…` : label;
}

/**
 * Consecutive steps of the same kind and label, as one.
 *
 * Only consecutive ones. Twelve Bash calls in a row are one thing the run did;
 * twelve Bash calls with a Read between each pair are a different thing, and
 * folding those together would draw a path the run did not take. This is why
 * the strip can claim to be in order: nothing is ever moved to sit beside
 * something it did not follow.
 *
 * A collapsed step keeps the first member's `at` and facts - the step began
 * there - and sums only what was measured, refusing the sum entirely if
 * anything was not. `durationFrom` survives only when every member agreed,
 * because a total that is part span and part hook is not from either.
 */
function collapse(steps: PathStep[]): PathStep[] {
  const out: PathStep[] = [];

  for (const step of steps) {
    const last = out[out.length - 1];
    /*
     * A prompt never folds into the prompt before it.
     *
     * Every user step is labelled the same, so without this two prompts sent
     * back to back become one step reading "you ×2" - and a turn boundary is
     * the one thing on this strip that must not be collapsible. It is what
     * divides the run into turns, the caption above claims every prompt is
     * drawn, and only the first of the two would have kept its text. Measured
     * on the real corpus: the first run this was tried against opened with
     * exactly that pair.
     */
    if (!last || step.kind === "user" || last.kind !== step.kind || last.label !== step.label) {
      out.push({ ...step });
      continue;
    }

    last.count += 1;
    last.measured += step.measured;
    last.durationMs =
      last.durationMs === null || step.durationMs === null
        ? null
        : last.durationMs + step.durationMs;
    if (last.durationFrom !== step.durationFrom) last.durationFrom = null;
  }

  /*
   * A step whose members were not all timed carries no total, however many of
   * them were. Done here rather than in the loop so the running sum can stay
   * arithmetic and the rule stays one line a reader can check.
   */
  for (const step of out) {
    if (step.measured < step.count) {
      step.durationMs = null;
      step.durationFrom = null;
    }
  }

  return out;
}
