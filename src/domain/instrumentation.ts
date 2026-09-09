/**
 * The vocabulary of instrumentation readiness. Pure: no filesystem, no clock,
 * no database.
 *
 * "Readiness" here means one thing only - whether Claude Code is configured to
 * tell this machine enough for an in-depth trace. Unlike `readiness.ts`, which
 * describes how much of a configuration surface a repository happens to use,
 * this one has a right answer: below a certain line the Trace page is full of
 * em dashes, and above it there are real durations. So this file is allowed to
 * say a setting is wrong, which that one deliberately never does.
 *
 * The requirements are transcribed from `exercises/01-enable-otel.md` and
 * `exercises/02-register-hooks.md`. Those files stay the source of truth: where
 * they and this table disagree, they are right and this is stale.
 */

import { type MaturityBand } from "./readiness";

/**
 * Which of the three tiers a requirement belongs to.
 *
 * The tiers are a ladder for the whole page rather than one per requirement.
 * `readiness.ts` records at length why a ladder per cell was removed from the
 * AI maturity page - "silver" meant something different in each of eight cells
 * and every one had to print its own ceiling. That lesson applies here, so
 * there is exactly one ladder and it is stated once.
 */
export type Tier = 1 | 2 | 3;

/**
 * What each tier is called, and what reaching it buys.
 *
 * `unlocks` is written as the thing the reader gets rather than the thing they
 * set, because it is read by someone deciding whether to bother. A tier that
 * describes itself in the vocabulary of its own settings cannot answer that.
 */
export const TIERS: Record<Tier, { name: string; unlocks: string }> = {
  1: {
    name: "Events and metrics",
    unlocks: "Cost, token and active-time metrics, and the events behind Trends.",
  },
  2: {
    name: "Spans",
    unlocks: "Real per-call wall-clock on Trace, instead of an em dash on every row.",
  },
  3: {
    name: "Tool wall-clock",
    unlocks: "Per-tool duration, which exists in no other source on this machine.",
  },
};

/**
 * The three states one requirement can be in.
 *
 * `missing` and `wrong` are deliberately not the same state, and keeping them
 * apart is most of the value of this page. A variable nobody has set needs a
 * line adding; one set to `grpc` needs a line changing, and the reader who
 * believes they have already done this is the one who most needs to be told
 * which of the two it is. This mirrors the `ok`/`todo`/`problem` split in
 * `src/onboarding/Doctor.ts`, for the same reason it was drawn there.
 */
export type RequirementState = "met" | "missing" | "wrong";

/** The pill each state is drawn in. All three classes already exist in the CSS. */
export const STATE_TONE: Record<RequirementState, "ok" | "plain" | "high"> = {
  met: "ok",
  missing: "plain",
  wrong: "high",
};

// ---------------------------------------------------------------------------
// What a scan of the settings files yields
// ---------------------------------------------------------------------------

/**
 * Where a value came from, lowest precedence first.
 *
 * `user` is whichever single user-level file is actually in force - see
 * `SettingsScan.ignoredUserFile`, which is the whole reason this is labelled
 * rather than merged silently.
 */
export type SettingsLayer = "user" | "project" | "local";

export const LAYER_LABELS: Record<SettingsLayer, string> = {
  user: "user settings",
  project: "project settings",
  local: "project local settings",
};

export interface SettingsValue {
  value: string;
  layer: SettingsLayer;
  /** The file it was read from, as the reader would type it. */
  file: string;
}

/** One registered hook command, as found in a `hooks` block. */
export interface HookHandler {
  event: string;
  command: string;
  layer: SettingsLayer;
  file: string;
  /** True when the command runs this tool's spool script rather than something else. */
  spools: boolean;
}

/**
 * One settings file the scan looked at, whether or not it existed.
 *
 * Absent files are listed too. An absence has to be able to say what would
 * have counted, which is the same rule `CapabilityPresence.lookedFor` follows.
 */
export interface SettingsFile {
  layer: SettingsLayer;
  path: string;
  exists: boolean;
  /** Set when the file exists but could not be read or parsed. */
  problem: string | null;
}

/**
 * How the user-scope settings file was located, and whether it was there.
 *
 * User scope has exactly one documented home - `~/.claude/settings.json`, moved
 * wholesale when `CLAUDE_CONFIG_DIR` is set - so this is not a search path and
 * must not read like one. It is that resolution, plus the one escape hatch it
 * needs.
 *
 * The escape hatch exists because this server and Claude Code are different
 * processes with different environments. `CLAUDE_CONFIG_DIR` exported in a
 * shell profile reaches the terminal Claude Code runs in and not the dev
 * server started from somewhere else, and the symptom is this page reporting
 * no user settings on a machine that plainly has them. A reader who can see
 * the file has better information than our environment does, so they can name
 * it, and the answer is remembered.
 */
export type UserSettingsSource = "nominated" | "config-dir" | "home";

export interface UserSettingsLocation {
  /** The file actually consulted, as the reader would type it. */
  path: string;
  source: UserSettingsSource;
  exists: boolean;
  /**
   * Where this would look with nothing nominated, always. The page offers it
   * as the way back, so it has to be populated even while an override is in
   * force - otherwise "reset" would have nothing to reset to.
   */
  fallback: string;
  /** Set when a nominated path does not resolve, so the page can say why. */
  problem: string | null;
}

export interface SettingsScan {
  /** The project scanned. Absolute; never rendered into a shared surface. */
  root: string;
  name: string;
  scannedAt: string;
  files: SettingsFile[];
  /** The merged `env`, highest-precedence value winning, each with its origin. */
  env: Record<string, SettingsValue>;
  hooks: HookHandler[];
  /**
   * The user-level file that exists but is NOT read, because CLAUDE_CONFIG_DIR
   * points somewhere else.
   *
   * This is the trap named in AGENTS.md and in docs/04-troubleshooting.md: on a
   * machine that sets CLAUDE_CONFIG_DIR, a complete and plausible `~/.claude`
   * usually also exists and is never loaded, so a setting added to it fails
   * silently. It is the likeliest reason this page reads unconfigured for
   * someone who is certain they configured it, so the page says so out loud
   * rather than leaving them to find it.
   */
  ignoredUserFile: string | null;
  /**
   * Where the user-scope file was looked for, and whether that was this
   * machine's answer or the reader's.
   *
   * Carried on the scan rather than worked out again in the page, because the
   * page has to be able to say which file it read before it says what was in
   * it. A verdict whose source the reader cannot see is the one thing this
   * project will not ship.
   */
  userSettings: UserSettingsLocation;
  /**
   * This server's own origin, so the endpoint requirement can be checked
   * against the address the exporter would actually have to reach.
   *
   * Read from the request rather than assumed, because the port is whatever
   * Next settled on at startup and is not always 3000.
   */
  receiverOrigin: string;
}

// ---------------------------------------------------------------------------
// The rule table
// ---------------------------------------------------------------------------

/**
 * How a requirement is checked.
 *
 * Three kinds rather than a function per requirement, so the table below stays
 * a table a reader can check against the exercise. `equals` covers six of the
 * eight; the other two need to compare against something this machine knows -
 * its own address, and its own spool script.
 */
export type Check =
  | { kind: "equals"; value: string }
  | { kind: "endpoint" }
  | { kind: "hook"; event: string }
  /**
   * Set to anything Claude Code reads as on.
   *
   * The content settings take 1, true, yes or on, and a reader who wrote
   * "true" has done the thing correctly. `equals "1"` would call that wrong,
   * which is the one verdict this page must never get wrong - it is the
   * difference between a line to change and a line to add.
   */
  | { kind: "truthy" };

export interface Requirement {
  /** The environment variable, or `hooks.<Event>` for the hook check. */
  key: string;
  /**
   * Which rung this is, or null for a setting that is not on the ladder.
   *
   * Null is what keeps the content settings out of every count on the page.
   * `tierComplete` and `tierSummaries` both filter on `c.tier === tier` for a
   * literal 1, 2 or 3, so a null tier cannot reach the band, the gate, or the
   * "N of 3 tiers complete" figure however the table below grows.
   */
  tier: Tier | null;
  label: string;
  /**
   * One word, for the tag under this requirement's node in the pipe.
   *
   * Separate from `label` because they are read in different places and at
   * different sizes: the label names the setting in a sentence, this one has
   * about 70 pixels under a circle. Truncating the label there would have cut
   * "Telemetry switch" and "Traces exporter" to the same "Telemetry…" and
   * "Traces…", which is two nodes a reader cannot tell apart.
   */
  short: string;
  /** What it does and why it is required, in one line. */
  what: string;
  /**
   * The records that exist because of this one setting, named exactly.
   *
   * Separate from the tier's `unlocks`, which five of these share and which
   * therefore cannot answer the question a reader actually arrives with:
   * what does *this* variable buy, as opposed to the one next to it. The
   * metrics and the logs exporters are the pair that made the tier-level
   * answer untenable - they sit side by side, they are set to the same value,
   * and they deliver completely different things.
   *
   * Names are taken from Claude Code's monitoring documentation rather than
   * from this receiver's tables, so a reader can search for one and find the
   * upstream page. Where the two disagree, the documentation is right.
   */
  buys: string;
  check: Check;
  /** Other keys accepted in its place. */
  aliases?: string[];
}

/**
 * The eight things an in-depth trace needs, in the order they matter.
 *
 * Eight and not seven: the exercise lists seven environment variables, and the
 * PostToolUse hook is the eighth thing without which per-tool duration has no
 * source anywhere on the machine. Grouping them here rather than across two
 * pages is the point of this page existing.
 */
export const REQUIREMENTS: Requirement[] = [
  {
    key: "CLAUDE_CODE_ENABLE_TELEMETRY",
    tier: 1,
    label: "Telemetry switch",
    short: "Switch",
    what: "The master switch. Without it every other variable here is ignored.",
    buys:
      "Nothing on its own. It is the gate the other six sit behind: with it " +
      "unset Claude Code collects nothing and exports nothing, whatever else is " +
      "set.",
    check: { kind: "equals", value: "1" },
  },
  {
    key: "OTEL_METRICS_EXPORTER",
    tier: 1,
    label: "Metrics exporter",
    short: "Metrics",
    what: "Where counters and gauges go - cost, tokens, active time.",
    buys:
      "Eight counters: claude_code.session.count, .lines_of_code.count, " +
      ".commit.count, .pull_request.count, .cost.usage in USD, .token.usage, " +
      ".code_edit_tool.decision, and .active_time.total in seconds - the one " +
      "figure no transcript can give you, because turn duration counts the time " +
      "you spent reading the reply and this does not.",
    check: { kind: "equals", value: "otlp" },
  },
  {
    key: "OTEL_LOGS_EXPORTER",
    tier: 1,
    label: "Logs exporter",
    short: "Logs",
    what: "Where events go - api_request, tool_decision, mcp_server_connection.",
    buys:
      "One event per thing that happened: claude_code.user_prompt, " +
      ".assistant_response, .api_request, .api_error, .api_refusal, " +
      ".tool_result, .tool_decision, .permission_mode_changed, .auth and " +
      ".mcp_server_connection. .api_request carries the per-request duration " +
      "the transcript leaves null, and .tool_result carries duration_ms per " +
      "tool call.",
    check: { kind: "equals", value: "otlp" },
  },
  {
    key: "OTEL_EXPORTER_OTLP_PROTOCOL",
    tier: 1,
    label: "Wire format",
    short: "Format",
    what:
      "The receiver here decodes JSON only, so there is no protobuf dependency " +
      "and no build step. grpc and http/protobuf are not understood.",
    buys:
      "Nothing of its own - it decides whether anything arrives at all. Set to " +
      "grpc or http/protobuf the exporter runs, reports no error, and this " +
      "receiver understands none of it.",
    check: { kind: "equals", value: "http/json" },
  },
  {
    key: "OTEL_EXPORTER_OTLP_ENDPOINT",
    tier: 1,
    label: "Endpoint",
    short: "Endpoint",
    what: "The base URL. Each signal appends its own /v1/... path to it.",
    buys:
      "Nothing of its own. It decides which process receives all three signals; " +
      "each appends its own /v1/metrics, /v1/logs or /v1/traces to it.",
    check: { kind: "endpoint" },
  },
  {
    key: "OTEL_TRACES_EXPORTER",
    tier: 2,
    label: "Traces exporter",
    short: "Traces",
    what: "Where spans go - one per prompt, API call and tool. This is what Trace reads.",
    buys:
      "Spans, and the parent-child shape between them: claude_code.interaction " +
      "over the whole prompt, .llm_request per API call, and .tool, " +
      ".tool.blocked_on_user and .tool.execution under it - which separates how " +
      "long a tool ran from how long it sat waiting for you to approve it.",
    check: { kind: "equals", value: "otlp" },
  },
  {
    key: "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA",
    tier: 2,
    label: "Spans enabled",
    short: "Spans",
    what:
      "Makes Claude Code emit spans at all. Without it the traces exporter is " +
      "set correctly and has nothing to send, which is the hardest of these to " +
      "spot from the outside.",
    buys:
      "The spans themselves. Without it the traces exporter is set correctly, " +
      "posts nothing, and reports no error - which is why this is the hardest " +
      "of the seven to spot from the outside.",
    check: { kind: "equals", value: "1" },
    aliases: ["ENABLE_ENHANCED_TELEMETRY_BETA"],
  },
  {
    key: "hooks.PostToolUse",
    tier: 3,
    label: "PostToolUse hook",
    short: "Hook",
    what:
      "Per-tool wall-clock exists in exactly one place: the duration field on " +
      "this hook's payload. The transcript records no tool timing, and OTel " +
      "times the API request rather than the tool.",
    buys:
      "A duration on every tool call, written straight onto the call the " +
      "transcript already recorded.",
    check: { kind: "hook", event: "PostToolUse" },
  },
];

/**
 * The four other handlers exercise 02 registers.
 *
 * Reported beside the grid, never banded. Each one adds something real - a
 * recurring PermissionDenied is a permission entry nobody has added yet - but
 * none of them is needed for a trace to have durations in it, and folding them
 * into the band would mean the gate flipped for a reason unrelated to tracing.
 */
export const EXTRA_HOOK_EVENTS = [
  { event: "PermissionDenied", what: "Recurring stalls, each one a missing permission entry." },
  { event: "PreCompact", what: "Context blowouts, and the cost of the turns leading into one." },
  { event: "SubagentStop", what: "Subagent runs, which the transcript attributes to the parent." },
  { event: "SessionEnd", what: "Ingest without a cron job or a manual command." },
] as const;

/**
 * The four spellings Claude Code reads as on.
 *
 * Shared by the content settings, which are met when set to any of them, and
 * by the hygiene rules, which are tripped by exactly the same values. One set,
 * because a variable this page called set and that page called unset would be
 * two answers to one question.
 */
const TRUTHY = new Set(["1", "true", "yes", "on"]);

const isTruthy = (value: string): boolean => TRUTHY.has(value.trim().toLowerCase());

/**
 * The content settings: a branch off the run, never part of it.
 *
 * These four put the actual words into telemetry - what was asked, what came
 * back, what a tool was called with, what it returned. Everything else on this
 * page is a requirement; these are a choice, and which way the choice goes
 * depends on something the page cannot read.
 *
 * On this machine they are redundant. The transcript already carries every
 * prompt, reply, tool argument and tool result, untruncated and in full, and
 * these copy a 60 KB-capped subset of it into a second store that nothing here
 * reads.
 *
 * Pointed at an agent on another machine they are the opposite: the only
 * source there is. The receiver takes OTLP from any host that can reach the
 * port, and half the sessions that have arrived here have no transcript on
 * this disk - so for those, `<REDACTED>` is the whole of what was said.
 *
 * They are therefore not requirements and not hygiene faults. They are a
 * branch, drawn beside the run, never counted, never banded, and never gating:
 * `tier: null` is what guarantees that, because every count on this page
 * filters for a literal rung.
 */
export const CONTENT_SETTINGS: Requirement[] = [
  {
    key: "OTEL_LOG_USER_PROMPTS",
    tier: null,
    label: "Prompt text",
    short: "Prompts",
    what: "What was actually asked. Sent as <REDACTED> until this is set.",
    buys:
      "The prompt attribute on claude_code.user_prompt events. Without it the " +
      "event still arrives with prompt_length beside it, so you can see that " +
      "something was asked and how long it was, and never what it said. It also " +
      "turns on assistant responses unless that is set on its own.",
    check: { kind: "truthy" },
  },
  {
    key: "OTEL_LOG_ASSISTANT_RESPONSES",
    tier: null,
    label: "Reply text",
    short: "Replies",
    what: "What the agent actually answered. Redacted until this is set.",
    buys:
      "The response attribute on claude_code.assistant_response events, capped " +
      "at 60 KB. Watching an agent without this is watching what it was asked " +
      "and never what it did.",
    check: { kind: "truthy" },
  },
  {
    key: "OTEL_LOG_TOOL_DETAILS",
    tier: null,
    label: "Tool arguments",
    short: "Args",
    what: "What each tool was called with - the command, the path, the query.",
    buys:
      "Tool parameters on the tool events: whole Bash command strings, MCP " +
      "server and tool names, skill names, and the tool input. Without it a " +
      "remote agent's tool calls are a list of tool names and durations.",
    check: { kind: "truthy" },
  },
  {
    key: "OTEL_LOG_TOOL_CONTENT",
    tier: null,
    label: "Tool output",
    short: "Output",
    what: "What each tool returned. Rides on spans, so it needs the run above finished.",
    buys:
      "Whole tool inputs and outputs, capped at 60 KB each - but carried on " +
      "span events, so this one delivers nothing at all until the traces " +
      "exporter and the spans flag on the run above are both set.",
    check: { kind: "truthy" },
  },
];

/**
 * The content settings, read against a scan.
 *
 * Same cell shape as a requirement, so one panel renders both. What differs is
 * everything around them: they are drawn on a branch, and no count on this
 * page can see them.
 */
export const contentCells = (scan: SettingsScan): RequirementCell[] =>
  CONTENT_SETTINGS.map((setting) => cellFor(scan, setting));

// ---------------------------------------------------------------------------
// Reading the table
// ---------------------------------------------------------------------------

export interface RequirementCell {
  key: string;
  label: string;
  /** The rung, or null for a setting off the ladder. See `Requirement.tier`. */
  tier: Tier | null;
  /** One word, for the tag under the node. See `Requirement.short`. */
  short: string;
  what: string;
  /** The records this one setting is responsible for. See `Requirement.buys`. */
  buys: string;
  state: RequirementState;
  /** What is true right now, in one sentence. */
  finding: string;
  /** What to do about it. Empty when met. */
  fix: string;
  /** The value found. Null when nothing was set - never an empty string. */
  found: string | null;
  /** The file it came from. Null when it was not set anywhere. */
  source: string | null;
}

/** The value in force for a requirement, following its aliases. */
export function valueOf(scan: SettingsScan, requirement: Requirement): SettingsValue | null {
  for (const key of [requirement.key, ...(requirement.aliases ?? [])]) {
    const found = scan.env[key];
    if (found) return found;
  }
  return null;
}

/**
 * Whether an endpoint points at this receiver.
 *
 * Compared by origin rather than by string, because `http://localhost:3000` and
 * `http://127.0.0.1:3000` are the same receiver and a reader who typed either
 * has done nothing wrong. A trailing `/api/otlp` is expected but not required -
 * the exporter appends the signal path itself, and the exercise's value
 * includes it, so both forms are accepted and the finding says which was found.
 */
export function endpointMatches(value: string, receiverOrigin: string): boolean {
  try {
    return sameHost(new URL(value).origin, receiverOrigin);
  } catch {
    return false;
  }
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function sameHost(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    const one = new URL(a);
    const two = new URL(b);
    if (one.port !== two.port) return false;
    return LOOPBACK.has(one.hostname) && LOOPBACK.has(two.hostname);
  } catch {
    return false;
  }
}

/** The handlers registered for one event that actually run this tool's spool. */
export const spoolHandlersFor = (scan: SettingsScan, event: string): HookHandler[] =>
  scan.hooks.filter((h) => h.event === event && h.spools);

/**
 * One requirement, read against a scan.
 *
 * Every branch produces both a `finding` and, where there is something to do, a
 * `fix` naming the file to put it in. A cell that said only "missing" would
 * move the problem rather than solve it, which is the rule `Doctor` is built
 * on and the reason this page exists at all.
 */
export function cellFor(scan: SettingsScan, requirement: Requirement): RequirementCell {
  const base = {
    key: requirement.key,
    tier: requirement.tier,
    label: requirement.label,
    short: requirement.short,
    what: requirement.what,
    buys: requirement.buys,
  };

  if (requirement.check.kind === "hook") {
    const event = requirement.check.event;
    const handlers = spoolHandlersFor(scan, event);
    const others = scan.hooks.filter((h) => h.event === event && !h.spools);

    if (handlers.length > 0) {
      return {
        ...base,
        state: "met",
        found: handlers[0]!.command,
        source: handlers[0]!.file,
        finding: `Registered in ${LAYER_LABELS[handlers[0]!.layer]}.`,
        fix: "",
      };
    }
    return {
      ...base,
      state: others.length > 0 ? "wrong" : "missing",
      found: others[0]?.command ?? null,
      source: others[0]?.file ?? null,
      finding:
        others.length > 0
          ? `${event} is registered, but to a command that is not this tool's spool, so no duration reaches it.`
          : `No ${event} handler is registered, so no tool call has ever been timed.`,
      fix: `Add a ${event} hook running \`node ${scan.root}/bin/hook-spool.mjs ${event}\` — exercises/02-register-hooks.md.`,
    };
  }

  const found = valueOf(scan, requirement);
  if (!found) {
    return {
      ...base,
      state: "missing",
      found: null,
      source: null,
      finding: "Not set in any settings file this scan read.",
      fix: `Add "${requirement.key}": "${wantedValue(requirement, scan)}" to the env block — exercises/01-enable-otel.md.`,
    };
  }

  const ok =
    requirement.check.kind === "endpoint"
      ? endpointMatches(found.value, scan.receiverOrigin)
      : requirement.check.kind === "truthy"
        ? isTruthy(found.value)
        : found.value === requirement.check.value;

  if (ok) {
    return {
      ...base,
      state: "met",
      found: found.value,
      source: found.file,
      finding: `Set in ${LAYER_LABELS[found.layer]}.`,
      fix: "",
    };
  }

  return {
    ...base,
    state: "wrong",
    found: found.value,
    source: found.file,
    finding:
      requirement.check.kind === "endpoint"
        ? `Points at ${found.value}, but this receiver is at ${scan.receiverOrigin}/api/otlp. Records are being posted somewhere else, or nowhere.`
        : `Set to ${found.value}, which this receiver does not accept.`,
    fix: `Change it to "${wantedValue(requirement, scan)}" in ${found.file}.`,
  };
}

/** The value the reader should set, for the fix sentence to quote. */
function wantedValue(requirement: Requirement, scan: SettingsScan): string {
  if (requirement.check.kind === "endpoint") return `${scan.receiverOrigin}/api/otlp`;
  if (requirement.check.kind === "equals") return requirement.check.value;
  // Any of 1, true, yes or on would do. The panel has to quote one of them,
  // and the documentation's own examples use 1.
  if (requirement.check.kind === "truthy") return "1";
  return "";
}

export const requirementCells = (scan: SettingsScan): RequirementCell[] =>
  REQUIREMENTS.map((requirement) => cellFor(scan, requirement));

// ---------------------------------------------------------------------------
// The band, and the gate
// ---------------------------------------------------------------------------

export const tierComplete = (cells: RequirementCell[], tier: Tier): boolean =>
  cells.filter((c) => c.tier === tier).every((c) => c.state === "met");

export const metCount = (cells: RequirementCell[]): number =>
  cells.filter((c) => c.state === "met").length;

/**
 * How far up the ladder this configuration got.
 *
 * The five names and their tones are the ones `readiness.ts` already
 * establishes, reused rather than redeclared so the two pages cannot drift into
 * describing the same metal differently.
 *
 * Note that tiers 2 and 3 cannot carry the band on their own: without tier 1
 * there is no working exporter, so a repository with the spans variables and
 * nothing else is emitting into the void. That is why this reads the tiers in
 * order rather than counting how many are complete.
 */
export function instrumentationBand(cells: RequirementCell[]): MaturityBand {
  const one = tierComplete(cells, 1);
  if (one && tierComplete(cells, 2) && tierComplete(cells, 3)) return "extensive";
  if (one && tierComplete(cells, 2)) return "established";
  if (one) return "developing";
  return metCount(cells) > 0 ? "minimal" : "unconfigured";
}

/**
 * One rung of the ladder: a tier, its requirements, and how many are met.
 *
 * The readiness page draws these and nothing else. Each rung carries its own
 * cells so the page can render a segment per requirement - which is what makes
 * "3 of 5" checkable at a glance rather than a number to be taken on trust -
 * without also printing the eight fixes that belong on the tabs that own them.
 */
export interface TierSummary {
  tier: Tier;
  name: string;
  unlocks: string;
  cells: RequirementCell[];
  met: number;
  total: number;
  complete: boolean;
  /**
   * True for the tiers the gate depends on. The readiness page draws a rule
   * under the last of them, because "tracing is on" is a position on this
   * ladder rather than a badge beside it.
   */
  gating: boolean;
}

export const TIER_ORDER = [1, 2, 3] as const;

export function tierSummaries(cells: RequirementCell[]): TierSummary[] {
  return TIER_ORDER.map((tier) => {
    const mine = cells.filter((c) => c.tier === tier);
    return {
      tier,
      name: TIERS[tier].name,
      unlocks: TIERS[tier].unlocks,
      cells: mine,
      met: mine.filter((c) => c.state === "met").length,
      total: mine.length,
      complete: mine.every((c) => c.state === "met"),
      gating: tier !== 3,
    };
  });
}

/** How many tiers are complete. The figure the readiness seal strikes. */
export const tiersComplete = (cells: RequirementCell[]): number =>
  tierSummaries(cells).filter((t) => t.complete).length;

/**
 * The gate: whether an in-depth trace will actually have durations in it.
 *
 * Tiers 1 and 2, and deliberately not tier 3. Tier 3 measures tools; tiers 1
 * and 2 are what make a span exist at all, and a trace with spans and no hook
 * is still an in-depth trace. This is the page's headline claim and the one
 * sentence a reader should be able to act on without reading the grid.
 */
export const tracingIsOn = (cells: RequirementCell[]): boolean =>
  tierComplete(cells, 1) && tierComplete(cells, 2);

/**
 * The content branch's own gate: whether a word will actually be sent.
 *
 * One rule, both halves of it checkable on the diagram. The words are
 * attributes hung on records, so tier 1 has to be complete or there is nothing
 * to hang them on; and at least one of the four has to be switched on or there
 * is nothing to hang. Either half alone sends nothing, which is why this is
 * drawn as a terminus fed by both rather than as a count of the four.
 *
 * Tier 1 is not the whole truth and is chosen anyway. Two of the four ride on
 * span events rather than on log records - `RECEIPTS` below says so, and says
 * why neither has a receipt - so with tier 1 complete, tier 2 not, and only
 * those two set, this reads on and nothing arrives. The alternative was a rule
 * per setting: four thresholds, each honest, none of them the same, and a
 * terminus that could no longer say what it meant. This is the trade AGENTS.md
 * calls KISS-then-SOLID, and it is the trade `tracingIsOn` already makes by
 * ignoring tier 3. What is lost is kept on its own line rather than inside the
 * colour: the diagram's off-state says which tier each of the four needs.
 *
 * Deliberately outside `instrumentationBand` and `tiersComplete`: nothing here
 * counts towards the band, and turning all four on must not move it.
 */
export const wordsAreSent = (
  cells: RequirementCell[],
  content: RequirementCell[],
): boolean => tierComplete(cells, 1) && content.some((c) => c.state === "met");

// ---------------------------------------------------------------------------
// Hygiene
// ---------------------------------------------------------------------------

/**
 * Settings that are supported by Claude Code and break something on this end.
 *
 * Not requirements, and they never move the band. An absent requirement and a
 * harmful setting are different findings: one needs adding, the other needs
 * removing, and a single number that mixed them would be able to say neither.
 *
 * Three, not the seven this once held. The four content settings moved out to
 * `CONTENT_SETTINGS`, because calling them harmful was an answer that only
 * held on a machine whose transcripts this app can read - and half the
 * sessions arriving here have none. What stayed is what breaks something
 * whoever is sending it: two that make the numbers wrong, and one that copies
 * the entire message history including the system prompt, implies consent to
 * every other content setting, and is read by nothing here.
 */
export interface HygieneRule {
  key: string;
  /** The value that causes the harm. `truthy` covers the on/off switches. */
  bad: { equals: string } | { truthy: true };
  /** What it breaks, in one sentence. */
  breaks: string;
}

export const HYGIENE: HygieneRule[] = [
  {
    key: "OTEL_METRICS_INCLUDE_SESSION_ID",
    bad: { equals: "false" },
    breaks:
      "session.id is the join key between metrics, events, spans and the transcript. " +
      "Without it nothing lines up with anything and the Trace page can attach no spans.",
  },
  {
    key: "OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE",
    bad: { equals: "cumulative" },
    breaks:
      "The rollup sums the points it stored. Under cumulative each point already " +
      "contains the ones before it, so every metric total counts them twice.",
  },
  {
    key: "OTEL_LOG_RAW_API_BODIES",
    bad: { truthy: true },
    breaks:
      "Whole API requests and responses - system prompt and entire message history - " +
      "in your telemetry. It also implies consent to every content setting on the " +
      "branch beside the run. Nothing here reads them.",
  },
];

export interface HygieneFinding {
  key: string;
  value: string;
  source: string;
  breaks: string;
}

const isBad = (rule: HygieneRule, value: string): boolean =>
  "truthy" in rule.bad ? isTruthy(value) : value === rule.bad.equals;

/** Only what is actually set and actually harmful. An empty list is the norm. */
export function hygieneFindings(scan: SettingsScan): HygieneFinding[] {
  return HYGIENE.flatMap((rule) => {
    const found = scan.env[rule.key];
    if (!found || !isBad(rule, found.value)) return [];
    return [{ key: rule.key, value: found.value, source: found.file, breaks: rule.breaks }];
  });
}

// ---------------------------------------------------------------------------
// The extras, reported beside the grid
// ---------------------------------------------------------------------------

export interface HookExtra {
  event: string;
  what: string;
  registered: boolean;
  source: string | null;
}

export const hookExtras = (scan: SettingsScan): HookExtra[] =>
  EXTRA_HOOK_EVENTS.map(({ event, what }) => {
    const handlers = spoolHandlersFor(scan, event);
    return {
      event,
      what,
      registered: handlers.length > 0,
      source: handlers[0]?.file ?? null,
    };
  });

// ---------------------------------------------------------------------------
// What has actually arrived
// ---------------------------------------------------------------------------

/**
 * What the receiver has recorded, as counts.
 *
 * Lives here rather than beside the query that fills it because the rule
 * table below is what gives these numbers meaning, and that rule is domain:
 * pure, and checkable against the exercise without a database open.
 *
 * Every field is a true zero rather than a missing number. The receiver runs
 * inside this process and the database is open, so "none arrived" is a
 * measurement and not a gap - the distinction AGENTS.md turns on. Only the
 * `lastSeen` pair is nullable, because a time at which nothing ever happened
 * does not exist.
 */
export interface LiveEvidence {
  events: number;
  metrics: number;
  sessions: number;
  spans: number;
  /** Spans the receiver could measure. A null duration is not a zero one. */
  timedSpans: number;
  otelLastSeen: string | null;
  spanLastSeen: string | null;
  toolCalls: number;
  timedToolCalls: number;
  /**
   * Events whose text actually arrived, rather than as `<REDACTED>`.
   *
   * Counted separately from `events` because the content settings do not
   * change how many events arrive - only what is inside them. A user_prompt
   * event turns up either way.
   */
  promptsWithText: number;
  repliesWithText: number;
}

/** Whether one requirement's signal has been seen, and the count behind it. */
export interface Receipt {
  /** True only when something this setting is responsible for actually arrived. */
  receiving: boolean;
  /** The same fact, as a number - what the vessel's water level reads off. */
  count: number;
  /** The count, in words, for the light's title and the panel's line. */
  detail: string;
}

/**
 * Which arrival proves which setting.
 *
 * A rule table rather than a switch, for the reason AGENTS.md gives: a reader
 * can check this against the receiver. Each requirement is answered by the
 * signal it is actually responsible for - the metrics exporter by metric
 * points, the logs exporter by events, the two span settings by spans - so a
 * light that is off names the one thing that did not arrive rather than
 * reporting a general silence.
 *
 * The endpoint, the protocol and the master switch share the same evidence on
 * purpose: any record at all reaching this process proves all three at once,
 * because a record that was decoded got here through the endpoint, in a wire
 * format this receiver understood, from a process with telemetry switched on.
 */
const RECEIPTS: Record<string, (live: LiveEvidence) => Receipt> = {
  CLAUDE_CODE_ENABLE_TELEMETRY: (l) => anyRecord(l),
  OTEL_EXPORTER_OTLP_PROTOCOL: (l) => anyRecord(l),
  OTEL_EXPORTER_OTLP_ENDPOINT: (l) => anyRecord(l),
  OTEL_METRICS_EXPORTER: (l) => count(l.metrics, "metric point"),
  OTEL_LOGS_EXPORTER: (l) => count(l.events, "event"),
  OTEL_TRACES_EXPORTER: (l) => count(l.spans, "span"),
  CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: (l) => count(l.spans, "span"),
  "hooks.PostToolUse": (l) => count(l.timedToolCalls, "timed tool call"),
  OTEL_LOG_USER_PROMPTS: (l) =>
    count(l.promptsWithText, "prompt with its text", "prompts with their text"),
  OTEL_LOG_ASSISTANT_RESPONSES: (l) =>
    count(l.repliesWithText, "reply with its text", "replies with their text"),
  /*
   * OTEL_LOG_TOOL_DETAILS and OTEL_LOG_TOOL_CONTENT have no row here on
   * purpose. Their effect lands on attributes this receiver has never seen
   * arrive - tool content rides on span events, and nothing has sent a span
   * yet - so any count would be a zero that cannot be told apart from a
   * setting that is working. `receiptFor` returns null and the panel draws no
   * Arrived line at all, which is the honest shape.
   */
};

/**
 * `plural` is passed where adding an "s" produces nonsense.
 *
 * "prompt with its text" pluralises to "prompts with their text", not to
 * "prompt with its texts", which is what the naive rule produced.
 */
const count = (n: number, noun: string, plural = `${noun}s`): Receipt => ({
  receiving: n > 0,
  count: n,
  detail: `${n.toLocaleString()} ${n === 1 ? noun : plural} received`,
});

const anyRecord = (live: LiveEvidence): Receipt =>
  count(live.events + live.metrics + live.spans, "record");

/**
 * The Arrived line on one panel.
 *
 * Returns null for a requirement nothing can vouch for, so the page draws
 * no Arrived line rather than an empty one - a row that can only ever say
 * nothing is worse than no row, because a reader cannot tell it apart from a
 * signal that genuinely has not turned up.
 */
export const receiptFor = (cell: RequirementCell, live: LiveEvidence): Receipt | null =>
  RECEIPTS[cell.key]?.(live) ?? null;

/**
 * The file to edit and the line to put in it.
 *
 * Split out from the `fix` sentence because the two are read differently: the
 * sentence tells a reader what is wrong, and this is the thing they copy. A
 * fix they have to retype out of prose is a fix with a typo in it.
 *
 * Returns null for a requirement that is not a settings line - the hook is
 * registered as a command with a matcher, which is a shape this cannot quote.
 */
export function settingSnippet(
  cell: RequirementCell,
  scan: SettingsScan,
): { file: string; json: string } | null {
  const requirement = [...REQUIREMENTS, ...CONTENT_SETTINGS].find((r) => r.key === cell.key);
  if (!requirement || requirement.check.kind === "hook") return null;

  return {
    // Where it should go, not where it was found: a value read from project
    // settings that ought to be user-scope would otherwise send the reader
    // back to the file that already has the wrong answer in it.
    file: cell.source ?? scan.userSettings.path,
    json: `"${requirement.key}": "${wantedValue(requirement, scan)}"`,
  };
}
