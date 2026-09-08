/**
 * The vocabulary of AI readiness. Pure: no filesystem, no clock, no database.
 *
 * "Readiness" here means one thing only - how much of Claude Code's
 * configuration surface a repository actually uses. It is a description, not a
 * grade. A repo with one CLAUDE.md and nothing else is not failing; it is a repo
 * where six other capabilities have not been needed yet.
 */

import type { Signal } from "./types";

/**
 * The capabilities a repository can configure, in the order a team usually
 * adopts them. Order matters: it is what the grid in the UI renders.
 */
export const CAPABILITIES = [
  "memory",
  "rules",
  "skills",
  "agents",
  "mcp",
  "hooks",
  "workflows",
  "ci",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** What each capability is, in one line, for the UI to show beside the flag. */
export const CAPABILITY_LABELS: Record<Capability, { label: string; what: string }> = {
  memory: {
    label: "Memory",
    what: "CLAUDE.md or AGENTS.md - the standing instructions read on every run.",
  },
  rules: {
    label: "Rules",
    what: "Editor rule files, read by Cursor and by Claude Code where supported.",
  },
  skills: {
    label: "Skills & commands",
    what:
      "Packaged procedures in .claude/skills and saved prompts in .claude/commands. " +
      "Both are invoked as /name, and both are a repeatable procedure written down once.",
  },
  agents: {
    label: "Subagents",
    what: "Named specialists in .claude/agents, each with its own prompt and tools.",
  },
  mcp: {
    label: "MCP servers",
    what: "External tools the model can call, declared in .mcp.json or settings.",
  },
  hooks: {
    label: "Hooks",
    what: "Commands the harness runs on lifecycle events, from .claude/settings.json.",
  },
  workflows: {
    label: "Workflows",
    what: "Multi-agent scripts in .claude/workflows.",
  },
  ci: {
    label: "CI/CD",
    what:
      "Pipelines that run Claude - the GitHub Action, or the headless CLI in a " +
      "GitLab job. The house rules applied on every merge request rather than " +
      "from a reviewer's memory.",
  },
};

/**
 * The ways a pipeline runs Claude, and what each is called.
 *
 * A table rather than one opaque pattern, because "this pipeline runs Claude"
 * and "this pipeline runs Claude *how*" are different questions and the cell
 * is asked both. Adding a fourth way to do it is adding a row here; nothing
 * else changes.
 *
 * Transcribed from the two integration guides, and each row is checkable with
 * a grep, which is the promise every number on that page makes:
 *
 * - `action`    the official GitHub Action, `anthropics/claude-code-action@v1`
 *               (`-base-action` is its predecessor, still in older workflows).
 * - `headless`  `claude -p`. This is the whole GitLab story - there is no
 *               GitLab action, so the documented job installs the CLI and runs
 *               it non-interactively - and it is also how a script or an npm
 *               task calls Claude anywhere else.
 * - `installed` the CLI put on the runner, by npm or by the official
 *               installer. On its own it is weaker evidence than the other
 *               two, and it is listed because the documented GitLab job
 *               installs in `before_script` and invokes in `script`, so a
 *               reader looking at one half should still see the cell agree.
 */
export const CI_FORMS = [
  { form: "action", label: "GitHub Action", pattern: /anthropics\/claude-code(-base)?-action/i },
  // The gap between `claude` and its flag is deliberate, and bounded. The
  // documented GitLab job folds the command over several YAML lines, and the
  // docs recommend `--bare` in CI, so neither `claude -p` nor `claude\n  -p`
  // nor `claude --bare -p` can be matched by requiring the flag to come next.
  // The lookahead keeps `anthropics/claude-code-action` from matching here:
  // it is the row above, and counting it twice would name two forms where the
  // pipeline uses one.
  { form: "headless", label: "headless CLI", pattern: /\bclaude(?![-\w/])[\s\S]{0,120}?\s--?(?:p|print)\b/i },
  { form: "installed", label: "CLI installed in the job", pattern: /@anthropic-ai\/claude-code|claude\.ai\/install\.sh/i },
] as const;

export type CiForm = (typeof CI_FORMS)[number]["form"];

/** Which of the forms above a pipeline's text uses. Empty means it runs no Claude. */
export function ciFormsIn(text: string): CiForm[] {
  return CI_FORMS.filter((f) => f.pattern.test(text)).map((f) => f.form);
}

/** The labels for a set of form keys, deduplicated and in table order. */
export function ciFormLabels(forms: readonly string[]): string[] {
  return CI_FORMS.filter((f) => forms.includes(f.form)).map((f) => f.label);
}

/** One configuration file found on disk, with the facts a rule can judge. */
export interface ArtefactFile {
  /** Path relative to the repository root, so nothing absolute reaches the UI. */
  path: string;
  capability: Capability;
  bytes: number;
  lines: number;
  /** ISO date. Drives the "changed in the last week" filter. */
  modified: string;
  /** Parsed YAML frontmatter keys and values, when the file has any. */
  frontmatter: Record<string, string>;
  /** Markdown heading count, a cheap proxy for whether a file has structure. */
  headings: number;
  /** Fenced code blocks. */
  codeBlocks: number;
  /** `<example>` blocks, which are what make an agent description fire reliably. */
  examples: number;
}

export interface CapabilityPresence {
  capability: Capability;
  present: boolean;
  /** Every file that contributed. Empty when absent. */
  files: ArtefactFile[];
  /** Where we looked, so an absence can say what would have counted. */
  lookedFor: string[];
}

/**
 * One repository, scanned. This is the context every readiness rule receives.
 */
export interface RepoScan {
  /** Absolute path on this machine. Never rendered raw into a shared surface. */
  root: string;
  /** Last path segment, which is what the UI shows. */
  name: string;
  scannedAt: string;
  capabilities: CapabilityPresence[];
  /** Total files walked, so the UI can say how much was looked at. */
  filesSeen: number;
  /** True when the scan stopped early. A partial scan must never read as a
   *  complete one that found nothing. */
  truncated: boolean;
}

export const presenceOf = (scan: RepoScan, capability: Capability): CapabilityPresence =>
  scan.capabilities.find((c) => c.capability === capability) ?? {
    capability,
    present: false,
    files: [],
    lookedFor: [],
  };

export const filesOf = (scan: RepoScan, capability: Capability): ArtefactFile[] =>
  presenceOf(scan, capability).files;

/** The five bands, in order, so the UI can map each to a distinct treatment. */
export const MATURITY_BANDS = [
  "unconfigured",
  "minimal",
  "developing",
  "established",
  "extensive",
] as const;

export type MaturityBand = (typeof MATURITY_BANDS)[number];

/**
 * How many of the eight are configured. Still the number the badge shows,
 * because it is the one figure on this page a reader can check by looking in
 * the repository, and the band beside it is not.
 */
export const maturityCount = (scan: RepoScan): number =>
  scan.capabilities.filter((c) => c.present).length;

/**
 * A name for how far up the ladders a repository got.
 *
 * Takes the normalised score rather than the count, because two repositories
 * with six capabilities each are not the same repository: one may have six
 * files that exist and nothing more, the other six that carry everything that
 * makes them work.
 *
 * Deliberately descriptive rather than evaluative: the top band is
 * "extensive", not "good". The thresholds are quarters of the score, stated
 * here rather than tuned, so a reader who wants to know why a repo is silver
 * and not gold can work it out from the cells on the page.
 */
export function maturityBand(score: number): MaturityBand {
  if (score <= 0) return "unconfigured";
  if (score < 0.25) return "minimal";
  if (score < 0.5) return "developing";
  if (score < 0.75) return "established";
  return "extensive";
}

/**
 * The tone each band is drawn in.
 *
 * The bands carry a colour now, which needs saying carefully, because a badge
 * that changes colour as a score rises is one step from a grade - and this
 * tool does not grade. The scale is the one already established for the usage
 * tier, whose rule is "tones are volume, not merit": a plain seal for a repo
 * with nothing configured, the app's informational blue for a repo that has
 * started, and then the three metals. Metals rather than a red-to-green ramp
 * on purpose. Red and green would say "wrong" and "right" about a repository
 * where six unused capabilities are usually six capabilities nobody has
 * needed, and the top band would become a target rather than a description.
 *
 * As with the medals elsewhere, the three metals sit at almost the same
 * luminance and are indistinguishable under greyscale or full colour-vision
 * deficiency. That is acceptable here for the same reason: the badge always
 * carries the count inside it and the band's name beside it, so the colour is
 * the third channel and never the only one.
 */
export const MATURITY_TONE: Record<MaturityBand, "plain" | "busy" | "bronze" | "silver" | "gold"> = {
  unconfigured: "plain",
  minimal: "busy",
  developing: "bronze",
  established: "silver",
  extensive: "gold",
};

/**
 * The band the seal shows, which is the score's band with one floor under it.
 *
 * A repository can now be configured and still score zero: hooks' first band
 * starts at 3 matchers, so one handler is a real hooks configuration that has
 * not reached bronze. The average of the eight bands is then 0, and the word
 * "unconfigured" printed immediately before "1 of 8 configured" is the page
 * disagreeing with itself in the same sentence.
 *
 * So the floor is "minimal", which is what it says: something is configured,
 * and none of it has reached a band yet. The count on the seal and the score
 * under it stay exactly what they measured - this changes only the word, and
 * only in the one case where the word would have been false.
 */
export function sealBand(score: number, configured: number): MaturityBand {
  const band = maturityBand(score);
  return band === "unconfigured" && configured > 0 ? "minimal" : band;
}

// ---------------------------------------------------------------------------
// What the quality rules measure
// ---------------------------------------------------------------------------
//
// These thresholds used to decide a capability's band, up a per-capability
// ladder of two or three rungs. They no longer do - see the band rule below -
// but the rules in src/analyze/readiness still report them, because "3 of 4
// skill descriptions are under 40 characters" is a useful thing to be told
// and it is still arithmetic over a file.

/**
 * Under this a description cannot say when to use something, so the thing it
 * describes never gets selected. Stated, not tuned.
 */
export const MIN_DESCRIPTION = 40;

/** Memory's own bounds, shared with MemoryQualityRule so they cannot drift. */
export const MEMORY_MIN_LINES = 10;
export const MEMORY_MAX_BYTES = 20_000;
export const MEMORY_MIN_HEADINGS = 3;

/** Below this a rule file is a line or two, not a set of rules. */
export const RULES_MIN_LINES = 10;

/**
 * Whether a description says when the thing it describes should be used.
 *
 * One definition, used by DescriptionQualityRule, so that rule and anything
 * else asking the same question of a file cannot disagree about the answer.
 *
 * The list of prepositions is wider than it looks like it needs to be, and
 * that is deliberate. It used to be `this|when|whenever|it`, which read "Use
 * after any change under src/billing" as saying nothing about when to use it -
 * a false negative on one of the commonest forms a real description takes.
 * That was survivable while this only tinted a column, and it is the kind of
 * false negative that gets read as the tool being wrong about the file.
 */
export function saysWhenToUse(description: string): boolean {
  return /\buse\s+(this|it|when|whenever|before|after|during|for|if|on|once|to)\b/i.test(description);
}

/**
 * Claude Code's hooks block, counted: how many events it handles, and how
 * many matchers sit under them.
 *
 * Both, because they answer different questions and the cell is asked both. A
 * repository that handles one event nine ways and one that handles nine
 * events once each are not the same configuration, and `Object.keys(hooks)`
 * called them both "1". The matcher is the unit the band counts - it is the
 * individual matching part, an event plus what it fires on - so three events
 * with two matchers each is six.
 *
 * The nesting is not ours and every level of it is optional in practice, so
 * each step is guarded rather than assumed: a shape this cannot read yields
 * zero matchers under the events it can see, which is honest about both.
 *
 * Pure, and here rather than in the scanner, because it is the definition of
 * what a handler is and the tests that pin it should not need a directory.
 */
export function hookCounts(hooks: unknown): { events: number; matchers: number } {
  if (typeof hooks !== "object" || hooks === null || Array.isArray(hooks)) {
    return { events: 0, matchers: 0 };
  }
  const events = Object.entries(hooks as Record<string, unknown>);
  return {
    events: events.length,
    matchers: events.reduce((n, [, groups]) => n + (Array.isArray(groups) ? groups.length : 0), 0),
  };
}

/** Written out so a caller can name the same figure the reader is shown. */
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The definition file for a skill, command or subagent - not its supporting
 * material.
 *
 * A skill is a directory whose SKILL.md is the definition; `style_guide.md`
 * beside it is reference the skill points at. Counting the reference file
 * would say a repository has two skills where it has one, and reading its
 * frontmatter would report a missing description for a file that never has
 * one.
 *
 * A command is the simpler shape: one markdown file, at any depth, because
 * `.claude/commands/db/migrate.md` is the namespaced form of `/db:migrate`.
 * Skills and commands share a cell, so this has to recognise both.
 */
export function definitionFilesOf(
  scan: RepoScan,
  capability: "skills" | "agents",
): ArtefactFile[] {
  const files = filesOf(scan, capability);
  if (capability === "agents") return files.filter((f) => f.path.endsWith(".md"));
  return files.filter((f) => isSkillDefinition(f.path) || isCommandDefinition(f.path));
}

const isSkillDefinition = (path: string): boolean => /(^|\/)SKILL\.md$/i.test(path);
const isCommandDefinition = (path: string): boolean =>
  /(^|\/)\.claude\/commands\//.test(path) && path.toLowerCase().endsWith(".md");

// ---------------------------------------------------------------------------
// The band rule
// ---------------------------------------------------------------------------

/**
 * One rule, three numbers, the same for all eight capabilities.
 *
 * It replaced a per-capability ladder whose rungs differed by capability -
 * Memory was judged on line count and heading count, Skills on description
 * length and whether each said when to use it, Workflows on nothing but
 * existing. Every rung was checkable, and it still could not be read: three
 * ladders of different heights meant "silver" said something different in
 * each cell, and the ceiling had to be printed beside every one to explain
 * why Rules could never reach gold.
 *
 * So the band counts instances, and nothing else. One is bronze, two or three
 * is silver, four or more is gold - in seven of the eight cells. It is a
 * description of how much of a capability a repository uses, and a reader can
 * check any of them by listing a directory.
 *
 * Hooks counts to its own three, for the reason set out on BAND_THRESHOLDS:
 * it is the only one whose unit is not a file, and one of them is nearly
 * free. That is an exception to "the same sentence in all eight cells" and it
 * is why every cell prints its own numbers rather than the page printing them
 * once at the top.
 *
 * What was lost when the ladders went is real and worth naming: the band no
 * longer knows whether those four skills have usable descriptions. That has
 * not stopped being measured - the quality rules above still report it, and
 * the cell still shows it - it has stopped deciding the colour.
 */
export const CAPABILITY_BANDS = { bronze: 1, silver: 2, gold: 4 } as const;

/** The three counts a capability's bands start at. */
export interface BandThresholds {
  bronze: number;
  silver: number;
  gold: number;
}

/**
 * Where a capability counts against its own three numbers.
 *
 * Hooks only, and it is stated here rather than hidden in the rule, because
 * it is a real exception to "the same three numbers in all eight cells" and
 * that property was worth something.
 *
 * The reason it earns one: hooks is the only capability whose unit is not a
 * file, and it is the cheapest of the eight to have one of. A single
 * `settings.json` entry that echoes a string is one handler, and one handler
 * was bronze under the shared numbers - the same band as a repository with a
 * CLAUDE.md somebody maintains. A hooks configuration that is doing work is
 * several events with several matchers under each, so this counts to 3, 6 and
 * 8 instead.
 *
 * What it costs is that "silver" no longer means the same count in every
 * cell. What survives is the part that made the shared table readable: the
 * rule's *shape* is identical everywhere - count instances, compare against
 * three published numbers - and every cell prints its own three, so a reader
 * checking a band never has to know which table it came from.
 */
export const BAND_THRESHOLDS: Partial<Record<Capability, BandThresholds>> = {
  hooks: { bronze: 3, silver: 6, gold: 8 },
};

/** The three numbers this capability is banded against. */
export const bandsFor = (capability?: Capability): BandThresholds =>
  (capability ? BAND_THRESHOLDS[capability] : undefined) ?? CAPABILITY_BANDS;

/** The band names, indexed by band. Index 0 is the unconfigured one. */
export const BAND_NAMES = ["none", "bronze", "silver", "gold"] as const;

/** The tone a single capability's band is drawn in. Index is the band. */
export const TIER_TONE = ["plain", "bronze", "silver", "gold"] as const;

/** How many chevrons a cell shows, and therefore the top band. */
export const BAND_STEPS = 3;

/**
 * What each capability is counted in.
 *
 * Not "files" everywhere, because for two of them the file is not the unit. A
 * settings.json is one file whether it declares one hook or nine, so counting
 * files would put every hooks configuration in the world at bronze.
 */
export const INSTANCE_NOUN: Record<Capability, { one: string; many: string }> = {
  memory: { one: "memory file", many: "memory files" },
  rules: { one: "rule file", many: "rule files" },
  skills: { one: "skill or command", many: "skills or commands" },
  agents: { one: "subagent", many: "subagents" },
  mcp: { one: "server", many: "servers" },
  // One handler is one matcher under one event - see hookCounts. Not the
  // event: three events handled two ways each is six things wired up, and
  // counting the event alone called it three.
  hooks: { one: "handler", many: "handlers" },
  workflows: { one: "workflow", many: "workflows" },
  // Not "workflow": `.claude/workflows/` is the cell above, and two cells that
  // both read "3 workflows" would be two cells nobody can tell apart.
  ci: { one: "CI workflow", many: "CI workflows" },
};

/**
 * How many instances of a capability a repository configures.
 *
 * Zero when the capability is absent, which includes the case where the file
 * exists but configures nothing - a `.claude/settings.json` with hooks and no
 * `mcpServers` block is a candidate path for MCP and zero MCP servers.
 */
const usesClaude = (file: ArtefactFile): boolean => file.frontmatter.__usesClaude === "true";

export function instancesOf(scan: RepoScan, capability: Capability): number {
  const presence = presenceOf(scan, capability);
  if (!presence.present) return 0;

  if (capability === "mcp") return declaredCount(presence.files, "__serverCount");
  // A repository's CI is not the measurement here; the part of it that runs
  // Claude is. Counting every pipeline would put a repo with a lint job and no
  // Claude anywhere near it at gold.
  if (capability === "ci") return presence.files.filter(usesClaude).length;
  if (capability === "hooks") return declaredCount(presence.files, "__hookMatchers");
  if (capability === "skills" || capability === "agents") {
    return definitionFilesOf(scan, capability).length;
  }
  return presence.files.length;
}

/**
 * A count read out of a config file's parsed keys.
 *
 * Falls back to the file count, because a settings.json this scan could not
 * parse is still a settings.json the capability was marked present from, and
 * reporting zero instances for a capability the cell calls configured is the
 * contradiction this page exists to avoid.
 */
function declaredCount(files: ArtefactFile[], key: DeclaredKey): number {
  const declared = declaredSum(files, key);
  return declared > 0 ? declared : files.length;
}

type DeclaredKey = "__serverCount" | "__hookEvents" | "__hookMatchers";

/** The same sum without the floor, for the clauses that may honestly read 0. */
const declaredSum = (files: ArtefactFile[], key: DeclaredKey): number =>
  files.reduce((n, f) => n + Number(f.frontmatter[key] ?? 0), 0);

/**
 * 0 for none, then 1 bronze, 2 silver, 3 gold - against that capability's own
 * three numbers.
 *
 * The capability is optional so a caller asking about the shared numbers can
 * leave it out, which is also what keeps "what do the default thresholds
 * mean" a question the tests can ask directly.
 */
export function bandOf(instances: number, capability?: Capability): number {
  const bands = bandsFor(capability);
  if (instances >= bands.gold) return 3;
  if (instances >= bands.silver) return 2;
  if (instances >= bands.bronze) return 1;
  return 0;
}

/**
 * A capability's band, with the arithmetic that produced it.
 *
 * `rule` and `next` are both sentences rather than numbers, because the whole
 * point of replacing the ladder was that the reader should be able to check
 * the band without being told the ladder's shape first.
 */
export interface CapabilityBand {
  /** 0 to 3. */
  band: number;
  name: (typeof BAND_NAMES)[number];
  instances: number;
  /** "3 skills", for the cell to print beside the chevrons. */
  measured: string;
  /** The rule that put it in this band: "2-3 is silver". */
  rule: string;
  /** What the next band up would take, or null at gold. */
  next: string | null;
}

export function capabilityBand(scan: RepoScan, capability: Capability): CapabilityBand {
  const instances = instancesOf(scan, capability);
  const band = bandOf(instances, capability);
  const bands = bandsFor(capability);
  const noun = INSTANCE_NOUN[capability];
  const unit = (n: number) => plural(n, noun.one, noun.many);
  const target = band === 0 ? bands.bronze : band === 1 ? bands.silver : bands.gold;

  return {
    band,
    name: BAND_NAMES[band]!,
    instances,
    measured: unit(instances),
    // Band 0 is two different states once a capability can have a minimum
    // above one, and they are not the same sentence. Nothing found is
    // "nothing configured"; two handlers in a settings.json the cell names on
    // the line above is not, and printing that there would be the page
    // contradicting itself in two adjacent lines.
    rule:
      band === 0 && instances > 0
        ? `${unit(bands.bronze)} is the minimum`
        : rulesFor(capability)[band]!,
    // Pluralised on the threshold rather than on the band, because the
    // threshold is the number in the sentence: hooks' bronze is "3 handlers
    // for bronze", not "3 handler".
    next: band === 3 ? null : `${unit(target)} for ${BAND_NAMES[band + 1]}`,
  };
}

/**
 * The rule in words, one per band, in that capability's own numbers.
 *
 * A range where the band spans more than one count and a bare number where it
 * does not: the shared bronze is exactly 1, and "1-1 is bronze" is not a
 * sentence anyone can check. It is generated now rather than written out,
 * because two tables of three numbers each cannot be kept in step by hand -
 * and a phrase built from a threshold is exactly as checkable as the
 * threshold, which is the property that mattered.
 */
export function rulesFor(capability: Capability): readonly string[] {
  const bands = bandsFor(capability);
  const span = (from: number, to: number, name: string) =>
    to > from ? `${from}-${to} is ${name}` : `${from} is ${name}`;
  return [
    "nothing configured",
    span(bands.bronze, bands.silver - 1, "bronze"),
    span(bands.silver, bands.gold - 1, "silver"),
    `${bands.gold} or more is gold`,
  ];
}

/**
 * The eight bands, averaged and normalised to 0-1.
 *
 * Every capability has the same three steps - the counts they start at differ
 * for hooks, the number of steps does not - so this is a plain mean and no
 * longer has to normalise each ladder by its own height. It is the figure the
 * seal's band is read off.
 */
export function maturityScore(scan: RepoScan): number {
  const bands = CAPABILITIES.map((capability) =>
    bandOf(instancesOf(scan, capability), capability));
  return bands.reduce((a, b) => a + b, 0) / (bands.length * BAND_STEPS);
}

export interface CapabilityCell {
  capability: Capability;
  label: string;
  /** The one-line explanation, shown where it is useful rather than always. */
  what: string;
  present: boolean;
  /** Null when nothing was found, so the UI can render a dash and never a 0. */
  fileCount: number | null;
  /** The file to name in the cell. Null when absent. */
  firstPath: string | null;
  /** How many more there are beyond `firstPath`. Zero when there are none. */
  moreFiles: number;
  /** Where the scan looked. Populated whether or not anything was found: the
   *  absent cell has nothing else to show, and it must never be blank. */
  lookedFor: string[];
  /**
   * What the quality rules found in the definition files, in one clause, or
   * null where there is nothing of the kind to measure.
   *
   * This is what the band used to be. It is still on the page - a repository
   * with four skills whose descriptions say nothing is worth telling - it just
   * no longer decides the colour. Null rather than an empty string so the UI
   * renders nothing rather than an empty line.
   */
  quality: string | null;
  /** The band, and the arithmetic behind it. */
  band: CapabilityBand;
}

/**
 * The grid, in adoption order.
 *
 * Pure. It no longer needs the signals: the two counts it used to fold in -
 * MCP servers and hook handlers - are now what the band counts, so they are
 * read the same way every other capability's instances are and cannot drift
 * from them. The parameter is kept so the page's call site does not have to
 * change shape, and because the quality clause is the next thing that will
 * want it.
 */
export function capabilityCells(scan: RepoScan, _signals: Signal[] = []): CapabilityCell[] {
  return CAPABILITIES.map((capability) => {
    const presence = presenceOf(scan, capability);
    return {
      capability,
      label: CAPABILITY_LABELS[capability].label,
      what: CAPABILITY_LABELS[capability].what,
      present: presence.present,
      fileCount: presence.files.length > 0 ? presence.files.length : null,
      firstPath: presence.files[0]?.path ?? null,
      moreFiles: Math.max(0, presence.files.length - 1),
      lookedFor: presence.lookedFor,
      quality: qualityOf(scan, capability),
      band: capabilityBand(scan, capability),
    };
  });
}

/**
 * One clause about the quality of what was found, in the same terms the rules
 * report it in.
 *
 * Only for the capabilities where the files expose something beyond their own
 * existence. Memory exposes its size and structure; skills, commands and
 * subagents expose their descriptions; a hooks block exposes how its matchers
 * are spread across events. A server block and a workflow script expose that
 * they exist, and inventing a clause for them so every cell had one would be
 * inventing a measurement.
 */
function qualityOf(scan: RepoScan, capability: Capability): string | null {
  if (!presenceOf(scan, capability).present) return null;

  if (capability === "memory") {
    const files = filesOf(scan, capability);
    const lines = files.reduce((n, f) => n + f.lines, 0);
    const headings = files.reduce((n, f) => n + f.headings, 0);
    return `${plural(lines, "line")}, ${plural(headings, "heading")}`;
  }

  if (capability === "ci") {
    const files = filesOf(scan, capability);
    const claude = files.filter(usesClaude).length;
    // The verb agrees with the denominator, which is what `plural` just
    // counted: "1 of 1 pipeline runs Claude", "2 of 3 pipelines run Claude".
    const verb = files.length === 1 ? "runs" : "run";
    const counted = `${claude} of ${plural(files.length, "pipeline")} ${verb} Claude`;
    // Which way they do it, when the scan recorded it. Named rather than left
    // implicit because "runs Claude" is the same sentence for a workflow that
    // waits on @claude and a GitLab job that runs the CLI headless, and those
    // are the two things a reader configuring this needs to tell apart.
    const forms = ciFormLabels(
      files.flatMap((f) => (f.frontmatter.__claudeForms ?? "").split(",").filter(Boolean)),
    );
    return forms.length > 0 ? `${counted} - ${forms.join(", ")}` : counted;
  }

  if (capability === "hooks") {
    // The two figures the matcher count was folded out of. A band of 6 is
    // three events handled two ways or one event handled six, and those are
    // different configurations - so the cell says which, on the line whose
    // job is to hold what the band stopped carrying.
    const files = filesOf(scan, capability);
    const events = declaredSum(files, "__hookEvents");
    const matchers = declaredSum(files, "__hookMatchers");
    // Nothing to add for a hooks block with an event key and nothing under
    // it: the band's floor calls that 1 handler, and printing "0 matchers"
    // directly beneath "1 handler" is two adjacent lines of the same cell
    // disagreeing. The count above it is the honest half.
    if (events === 0 || matchers === 0) return null;
    return `${plural(events, "event")}, ${plural(matchers, "matcher")}`;
  }

  if (capability === "rules") {
    return plural(filesOf(scan, capability).reduce((n, f) => n + f.lines, 0), "line");
  }

  if (capability === "skills" || capability === "agents") {
    const definitions = definitionFilesOf(scan, capability);
    if (definitions.length === 0) return null;
    const thin = definitions.filter(
      (f) => (f.frontmatter.description ?? "").length < MIN_DESCRIPTION,
    ).length;
    if (thin > 0) return `${thin} of ${definitions.length} described in under ${MIN_DESCRIPTION} characters`;

    if (capability === "agents") {
      const withExamples = definitions.filter((f) => f.examples > 0).length;
      return `${withExamples} of ${definitions.length} carry an <example> block`;
    }
    const saysWhen = definitions.filter((f) =>
      saysWhenToUse(f.frontmatter.description ?? ""),
    ).length;
    return `${saysWhen} of ${definitions.length} say when to use them`;
  }

  return null;
}
