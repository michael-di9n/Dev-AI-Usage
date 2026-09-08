import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  MATURITY_TONE,
  MATURITY_BANDS,
  CAPABILITY_BANDS,
  BAND_THRESHOLDS,
  MIN_DESCRIPTION,
  bandOf,
  bandsFor,
  hookCounts,
  capabilityBand,
  capabilityCells,
  ciFormLabels,
  ciFormsIn,
  maturityBand,
  maturityScore,
  sealBand,
  saysWhenToUse,
  type ArtefactFile,
  type Capability,
  type CapabilityPresence,
  type RepoScan,
} from "../src/domain/readiness";
import { RepoScanner } from "../src/ingest/repo/RepoScanner";
import { ToolSurfaceRule, StalenessRule } from "../src/analyze/readiness/index";
import type { Signal } from "../src/domain/types";

/**
 * `capabilityCells` is what the AI maturity grid renders, and it exists
 * because the page used to derive the same figures inline from three signal
 * families. That is how the MCP server count came to be displayed twice - once
 * beside the file and once again in a section of tiles - and how a config file
 * declaring no servers at all could still render a confident `0`.
 *
 * The tool-surface counts are produced here by running the real rule rather
 * than by hand-writing its signals, because the contract under test is that
 * the cell and the rule agree.
 */

const file = (over: Partial<ArtefactFile> & { path: string; capability: Capability }): ArtefactFile => ({
  bytes: 400,
  lines: 20,
  modified: "2026-01-05",
  frontmatter: {},
  headings: 2,
  codeBlocks: 0,
  examples: 0,
  ...over,
});

/**
 * A scan where only the named capabilities have files.
 *
 * `present` is passed separately from `files` for the one case where they
 * differ: RepoScanner attributes `.claude/settings.json` to both MCP and
 * Hooks, then only marks MCP present if the file actually declares servers.
 */
function scanOf(
  present: Partial<Record<Capability, ArtefactFile[]>>,
  seenButNotPresent: Partial<Record<Capability, ArtefactFile[]>> = {},
): RepoScan {
  const capabilities: CapabilityPresence[] = CAPABILITIES.map((capability) => {
    const files = present[capability] ?? seenButNotPresent[capability] ?? [];
    return {
      capability,
      present: (present[capability] ?? []).length > 0,
      files,
      lookedFor: [`.claude/${capability}/`],
    };
  });
  return {
    root: "/tmp/repo",
    name: "repo",
    scannedAt: "2026-02-01T00:00:00.000Z",
    capabilities,
    filesSeen: Object.values(present).flat().length,
    truncated: false,
  };
}

const cellFor = (cells: ReturnType<typeof capabilityCells>, capability: Capability) =>
  cells.find((c) => c.capability === capability)!;

describe("capabilityCells", () => {
  it("returns all eight in adoption order, even when nothing is configured", () => {
    const cells = capabilityCells(scanOf({}), []);
    expect(cells.map((c) => c.capability)).toEqual([...CAPABILITIES]);
    expect(cells.every((c) => !c.present)).toBe(true);
  });

  it("reports the file count and the file to name", () => {
    const cells = capabilityCells(
      scanOf({
        memory: [
          file({ path: "CLAUDE.md", capability: "memory" }),
          file({ path: "AGENTS.md", capability: "memory" }),
        ],
      }),
      [],
    );
    const memory = cellFor(cells, "memory");
    expect(memory.present).toBe(true);
    expect(memory.fileCount).toBe(2);
    expect(memory.firstPath).toBe("CLAUDE.md");
    expect(memory.moreFiles).toBe(1);
  });

  it("gives an absence something to say, so it never renders blank", () => {
    const cells = capabilityCells(scanOf({}), []);
    for (const cell of cells) {
      expect(cell.firstPath).toBeNull();
      expect(cell.fileCount).toBeNull();
      expect(cell.lookedFor.length).toBeGreaterThan(0);
      expect(cell.what.length).toBeGreaterThan(0);
    }
  });

  /**
   * The two capabilities whose unit is not the file.
   *
   * A `.claude/settings.json` is one file whether it declares one hook or
   * nine, so counting files would put every hooks configuration ever written
   * at bronze. The band counts what the file declares instead, read the same
   * way for both - which is also why the cell no longer needs the tool
   * surface rule's signals to say the same figure a second time.
   */
  it("counts declared servers and handlers rather than the file they are in", () => {
    const scan = scanOf({
      mcp: [file({
        path: ".mcp.json",
        capability: "mcp",
        frontmatter: { __serverCount: "3" },
      })],
      hooks: [file({
        path: ".claude/settings.json",
        capability: "hooks",
        frontmatter: { __hookEvents: "3", __hookMatchers: "5" },
      })],
    });
    const cells = capabilityCells(scan);

    expect(cellFor(cells, "mcp").band).toMatchObject({ instances: 3, name: "silver" });
    // Five matchers is silver on hooks' own numbers, not gold: 6 is its middle
    // band. The count is the same figure either way, which is the point.
    expect(cellFor(cells, "hooks").band).toMatchObject({ instances: 5, name: "bronze" });
    expect(cellFor(cells, "mcp").band.measured).toBe("3 servers");
    expect(cellFor(cells, "hooks").band.measured).toBe("5 handlers");
  });

  /**
   * A config file this scan could not parse is still a config file the
   * capability was marked present from. Reporting zero instances for a
   * capability the same cell calls configured is the contradiction the page
   * exists to avoid, so the file count is the floor.
   */
  it("never reports zero instances for a capability it calls configured", () => {
    const scan = scanOf({
      mcp: [file({ path: ".mcp.json", capability: "mcp", frontmatter: {} })],
    });
    const mcp = cellFor(capabilityCells(scan), "mcp");

    expect(mcp.present).toBe(true);
    expect(mcp.band.instances).toBe(1);
    expect(mcp.band.name).toBe("bronze");
  });
});

describe("the scan headline", () => {
  /**
   * The grid's "last edited" fact comes from the staleness rule, which emits
   * nothing when there are no files. The date has to stay absent through that:
   * falling back to the scan time would put today's date under a heading that
   * says a file was edited.
   */
  it("has no last-edited date on a repository with no configuration", () => {
    const signals: Signal[] = new StalenessRule().detect(scanOf({}));
    expect(signals).toEqual([]);
  });

  it("reports the newest file once there is one", () => {
    const scan = scanOf({
      memory: [file({ path: "CLAUDE.md", capability: "memory", modified: "2026-01-05" })],
      skills: [file({ path: ".claude/skills/a/SKILL.md", capability: "skills", modified: "2026-01-30" })],
    });
    const [signal] = new StalenessRule().detect(scan);
    expect(signal!.evidence.newest).toBe("2026-01-30");
    expect(signal!.evidence.oldestModified).toBe("2026-01-05");
  });
});


/**
 * The band rule.
 *
 * This is the one place this tool comes close to grading, so the tests are
 * written as the promises that keep it a description: the band is a count
 * compared with a stated constant, the same three constants for all eight
 * capabilities, and every band arrives with the count and the rule beside it.
 */
describe("the band rule", () => {
  const workflows = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      file({ path: `.claude/workflows/w${i}.js`, capability: "workflows" }));

  it("bands on the count, at the stated thresholds", () => {
    for (const [n, name] of [[0, "none"], [1, "bronze"], [2, "silver"], [3, "silver"], [4, "gold"], [40, "gold"]] as const) {
      const scan = scanOf(n === 0 ? {} : { workflows: workflows(n) });
      expect(capabilityBand(scan, "workflows").name, `${n} workflows`).toBe(name);
    }
  });

  /**
   * One rule *shape* everywhere, and one table of numbers with one stated
   * exception.
   *
   * This test used to assert the stronger promise - the same three numbers in
   * all eight cells - and that promise is gone on purpose: hooks counts
   * matchers, and one matcher is nearly free, so one of them was buying the
   * same band as a maintained CLAUDE.md. What has to survive is that every
   * capability is banded by comparing a count against exactly three published
   * numbers, and that the exception is in a table rather than in a branch
   * somewhere.
   */
  it("bands every capability against three numbers, and names the one exception", () => {
    for (const capability of CAPABILITIES) {
      const bands = bandsFor(capability);
      expect(bandOf(bands.gold, capability), capability).toBe(3);
      expect(bandOf(bands.silver, capability), capability).toBe(2);
      expect(bandOf(bands.bronze, capability), capability).toBe(1);
      expect(bandOf(bands.bronze - 1, capability), capability).toBe(0);
      expect(bandOf(0, capability), capability).toBe(0);
    }

    // Seven share the table; hooks is the only entry that overrides it, and
    // its numbers are the ones the page prints.
    expect(Object.keys(BAND_THRESHOLDS)).toEqual(["hooks"]);
    expect(BAND_THRESHOLDS.hooks).toEqual({ bronze: 3, silver: 6, gold: 8 });
    for (const capability of CAPABILITIES) {
      if (capability === "hooks") continue;
      expect(bandsFor(capability), capability).toEqual(CAPABILITY_BANDS);
    }
  });

  /**
   * Hooks' own three, at every boundary, because this is the cell where the
   * numbers are not the ones printed at the top of the page.
   */
  it("bands hooks on matchers, at 3, 6 and 8", () => {
    const hooks = (matchers: number, events = 1) =>
      scanOf({
        hooks: [file({
          path: ".claude/settings.json",
          capability: "hooks",
          frontmatter: { __hookEvents: String(events), __hookMatchers: String(matchers) },
        })],
      });

    for (const [matchers, name] of [
      [1, "none"], [2, "none"], [3, "bronze"], [5, "bronze"],
      [6, "silver"], [7, "silver"], [8, "gold"], [20, "gold"],
    ] as const) {
      expect(capabilityBand(hooks(matchers), "hooks").name, `${matchers} matchers`).toBe(name);
    }

    // The user's worked example: three events, two matchers under each.
    const worked = capabilityBand(hooks(6, 3), "hooks");
    expect(worked.instances).toBe(6);
    expect(worked.measured).toBe("6 handlers");
    expect(worked.rule).toBe("6-7 is silver");
    expect(worked.next).toBe("8 handlers for gold");
    // And both halves of it stay visible beside the band, because 6 as three
    // events handled twice and 6 as one event handled six times are different
    // configurations.
    expect(cellFor(capabilityCells(hooks(6, 3)), "hooks").quality).toBe("3 events, 6 matchers");
  });

  /**
   * The state that only exists once a capability has a minimum above one: a
   * cell that names a file, counts what is in it, and has not reached bronze.
   *
   * It must not say "nothing configured" - the line above it is a path - and
   * it must not print a threshold in the singular.
   */
  it("says what the minimum is when a configured capability has not reached it", () => {
    const scan = scanOf({
      hooks: [file({
        path: ".claude/settings.json",
        capability: "hooks",
        frontmatter: { __hookEvents: "1", __hookMatchers: "2" },
      })],
    });
    const cell = cellFor(capabilityCells(scan), "hooks");

    expect(cell.present, "the file configures hooks; it just configures two").toBe(true);
    expect(cell.band).toMatchObject({ band: 0, instances: 2, measured: "2 handlers" });
    expect(cell.band.rule).toBe("3 handlers is the minimum");
    expect(cell.band.next).toBe("3 handlers for bronze");
    expect(cell.quality).toBe("1 event, 2 matchers");
  });

  /**
   * What a handler is, defined once in the domain so the scanner and the cell
   * cannot disagree about it. The event alone was the old count, and it called
   * a repository handling three events six ways "3".
   */
  it("counts a hooks block as events and the matchers under them", () => {
    expect(hookCounts({
      PreToolUse: [{ matcher: "Bash" }, { matcher: "Edit" }],
      PostToolUse: [{ matcher: "Bash" }, { matcher: "Edit" }],
      Stop: [{ hooks: [{ command: "a" }] }, { hooks: [{ command: "b" }] }],
    })).toEqual({ events: 3, matchers: 6 });

    // A matcher wiring several commands is still one matching part.
    expect(hookCounts({
      PreToolUse: [{ matcher: "Bash", hooks: [{ command: "a" }, { command: "b" }] }],
    })).toEqual({ events: 1, matchers: 1 });

    // Shapes this cannot read: the events it can see, and no matchers under
    // them, rather than a crash or a number it cannot vouch for.
    expect(hookCounts({ Stop: [] })).toEqual({ events: 1, matchers: 0 });
    // And that shape says nothing on the quality line rather than printing a
    // 0 under the floor's "1 handler".
    expect(cellFor(capabilityCells(scanOf({
      hooks: [file({
        path: ".claude/settings.json",
        capability: "hooks",
        frontmatter: { __hookEvents: "1", __hookMatchers: "0" },
      })],
    })), "hooks").quality).toBeNull();
    expect(hookCounts({ Stop: "every-time" })).toEqual({ events: 1, matchers: 0 });
    expect(hookCounts(undefined)).toEqual({ events: 0, matchers: 0 });
    expect(hookCounts([])).toEqual({ events: 0, matchers: 0 });
  });

  it("carries the count and the rule, so a band is never a bare colour", () => {
    const band = capabilityBand(scanOf({ workflows: workflows(3) }), "workflows");

    expect(band.measured).toBe("3 workflows");
    expect(band.rule).toBe("2-3 is silver");
    expect(band.next).toBe("4 workflows for gold");
  });

  it("has no next band at gold, rather than an unreachable one", () => {
    const band = capabilityBand(scanOf({ workflows: workflows(9) }), "workflows");
    expect(band.next).toBeNull();
    expect(band.rule).toBe("4 or more is gold");
  });

  it("names the unit each capability is counted in, singular and plural", () => {
    expect(capabilityBand(scanOf({ workflows: workflows(1) }), "workflows").measured).toBe("1 workflow");
    expect(capabilityBand(scanOf({ workflows: workflows(2) }), "workflows").measured).toBe("2 workflows");
  });

  it("counts only a skill's SKILL.md, not the reference files beside it", () => {
    const scan = scanOf({
      skills: [
        file({ path: ".claude/skills/a/SKILL.md", capability: "skills" }),
        // Reference material the skill points at. Counting it would say this
        // repository has two skills where it has one.
        file({ path: ".claude/skills/a/style_guide.md", capability: "skills" }),
      ],
    });
    expect(capabilityBand(scan, "skills").measured).toBe("1 skill or command");
  });

  /**
   * Skills and commands are one cell, because they are one practice: a
   * procedure written down once and invoked as /name. A repository with three
   * commands and one skill has four of them, not "bronze, and bronze".
   */
  it("counts skills and commands in the same cell", () => {
    const scan = scanOf({
      skills: [
        file({ path: ".claude/skills/review/SKILL.md", capability: "skills" }),
        file({ path: ".claude/commands/ship.md", capability: "skills" }),
        // Namespaced: `/db:migrate`. A command at depth is still a command.
        file({ path: ".claude/commands/db/migrate.md", capability: "skills" }),
        // Reference material beside a skill counts as neither.
        file({ path: ".claude/skills/review/checklist.md", capability: "skills" }),
      ],
    });

    const band = capabilityBand(scan, "skills");
    expect(band.instances).toBe(3);
    expect(band.measured).toBe("3 skills or commands");
    expect(band.name).toBe("silver");
  });

  /**
   * CI is the cell where "present" and "exists" differ most. Every repository
   * with a test job has `.github/workflows/`, and a pipeline that never runs
   * Claude is not what this page is counting.
   */
  it("counts only the pipelines that run Claude, and says how many did not", () => {
    const pipeline = (name: string, claude: boolean) =>
      file({
        path: `.github/workflows/${name}.yml`,
        capability: "ci",
        frontmatter: { __usesClaude: String(claude) },
      });
    const scan = scanOf({
      ci: [pipeline("house-rules", true), pipeline("claude", true), pipeline("ci", false)],
    });

    expect(capabilityBand(scan, "ci")).toMatchObject({
      instances: 2,
      measured: "2 CI workflows",
      name: "silver",
    });
    // The lint job is still worth naming: it is the denominator that makes
    // "2" mean something other than "2 files exist".
    expect(cellFor(capabilityCells(scan), "ci").quality).toBe("2 of 3 pipelines run Claude");
  });

  /**
   * The three documented ways to run Claude in a pipeline, each taken verbatim
   * from the shape the integration guides print.
   *
   * The two GitLab rows are the reason this is a table rather than one
   * pattern. There is no GitLab action, so the documented job installs the CLI
   * and invokes it headless, folded across several YAML lines - and the docs
   * recommend `--bare` in CI, which puts a flag between `claude` and `-p`.
   * Requiring the flag to come immediately after `claude` matched neither, so
   * a GitLab repository configured exactly as documented read as no CI at all.
   */
  it("recognises each documented way a pipeline runs Claude", () => {
    const gitlab =
      "  before_script:\n" +
      "    - curl -fsSL https://claude.ai/install.sh | bash\n" +
      "  script:\n" +
      "    - >\n" +
      "      claude\n" +
      '      -p "${AI_FLOW_INPUT:-\'Review this MR\'}"\n' +
      "      --permission-mode acceptEdits\n";

    expect(ciFormsIn(gitlab), "the documented GitLab job both installs and runs").toEqual([
      "headless",
      "installed",
    ]);
    expect(ciFormsIn('    - claude --bare -p "Summarize README.md"\n'), "--bare is the recommended CI form")
      .toEqual(["headless"]);
    expect(ciFormsIn("    - git diff main | claude -p 'typo linter'\n")).toEqual(["headless"]);
    expect(ciFormsIn('    - claude --print "hello"\n')).toEqual(["headless"]);
    expect(ciFormsIn("      - uses: anthropics/claude-code-action@v1\n")).toEqual(["action"]);
    expect(ciFormsIn("      - uses: anthropics/claude-code-base-action@beta\n")).toEqual(["action"]);
    expect(ciFormsIn("    - npm i -g @anthropic-ai/claude-code\n")).toEqual(["installed"]);
  });

  /**
   * The false positive worth naming: `anthropics/claude-code-action` contains
   * the word `claude`, and a `claude_args` line beside it is full of flags. If
   * the headless pattern reached across that, every action workflow in the
   * world would claim to use two forms where it uses one.
   */
  it("does not read an action step as a headless invocation", () => {
    const action =
      "      - uses: anthropics/claude-code-action@v1\n" +
      "        with:\n" +
      '          prompt: "review this"\n' +
      '          claude_args: "--mcp-config /path --max-turns 5 --model claude-sonnet-5"\n';

    expect(ciFormsIn(action)).toEqual(["action"]);
    expect(ciFormsIn("on: [push]\njobs:\n  check:\n    steps:\n      - run: npm test\n")).toEqual([]);
  });

  /**
   * "Runs Claude" is the same sentence for a workflow that waits on `@claude`
   * and a GitLab job that runs the CLI headless, and those are the two things
   * a reader configuring this has to tell apart. So the cell names the form.
   */
  it("names which form each pipeline uses, deduplicated and in table order", () => {
    const pipeline = (path: string, forms: string) =>
      file({
        path,
        capability: "ci",
        frontmatter: { __usesClaude: String(forms.length > 0), __claudeForms: forms },
      });
    const scan = scanOf({
      ci: [
        pipeline(".github/workflows/claude.yml", "action"),
        pipeline(".gitlab-ci.yml", "headless,installed"),
        pipeline(".github/workflows/ci.yml", ""),
      ],
    });

    expect(cellFor(capabilityCells(scan), "ci").quality).toBe(
      "2 of 3 pipelines run Claude - GitHub Action, headless CLI, CLI installed in the job",
    );
    expect(ciFormLabels(["installed", "action"]), "table order, not the order asked for")
      .toEqual(["GitHub Action", "CLI installed in the job"]);
  });

  /**
   * The bug this guards, in its new form: a settings.json with hooks and no
   * mcpServers is a candidate path for MCP, not an MCP configuration, and the
   * band has to agree with the words in the same cell.
   */
  it("asks the scanner's question, not just whether a candidate file exists", () => {
    const settings = file({
      path: ".claude/settings.json",
      capability: "hooks",
      frontmatter: { __hookEvents: "2", __hookMatchers: "3" },
    });
    const scan = scanOf({ hooks: [settings] }, { mcp: [settings] });

    expect(capabilityBand(scan, "mcp")).toMatchObject({ band: 0, instances: 0, name: "none" });
    // The same file is a real hooks configuration, and is banded on it.
    expect(capabilityBand(scan, "hooks")).toMatchObject({ band: 1, instances: 3 });
  });

  it("scores an empty repository at zero and a gold in all eight at one", () => {
    expect(maturityScore(scanOf({}))).toBe(0);

    const four = (capability: Capability, path: (i: number) => string) =>
      Array.from({ length: 4 }, (_, i) => file({ path: path(i), capability }));

    const complete = scanOf({
      memory: four("memory", (i) => `CLAUDE${i}.md`),
      rules: four("rules", (i) => `.cursor/rules/r${i}.mdc`),
      // Two skills and two commands: one cell, four instances, gold.
      skills: [
        ...Array.from({ length: 2 }, (_, i) =>
          file({ path: `.claude/skills/s${i}/SKILL.md`, capability: "skills" })),
        ...Array.from({ length: 2 }, (_, i) =>
          file({ path: `.claude/commands/c${i}.md`, capability: "skills" })),
      ],
      agents: four("agents", (i) => `.claude/agents/a${i}.md`),
      mcp: [file({ path: ".mcp.json", capability: "mcp", frontmatter: { __serverCount: "4" } })],
      // Eight matchers, because hooks' gold is 8 and the whole point of this
      // test is that a repository at the top of every cell scores 1.
      hooks: [file({
        path: ".claude/settings.json",
        capability: "hooks",
        frontmatter: { __hookEvents: "4", __hookMatchers: "8" },
      })],
      workflows: workflows(4),
      ci: Array.from({ length: 4 }, (_, i) =>
        file({
          path: `.github/workflows/w${i}.yml`,
          capability: "ci",
          frontmatter: { __usesClaude: "true" },
        })),
    });
    expect(maturityScore(complete)).toBe(1);
    expect(maturityBand(maturityScore(complete))).toBe("extensive");
  });

  it("weights all eight equally, now that they all have three steps", () => {
    // One gold and seven absent is 3 of 24.
    const one = scanOf({ workflows: workflows(4) });
    expect(maturityScore(one)).toBeCloseTo(3 / 24, 5);
  });

  /**
   * What the band stopped deciding, and the page did not stop showing. Four
   * skills is gold whether or not their descriptions work; the cell says
   * which, on its own line.
   */
  it("still reports description quality, beside the band rather than inside it", () => {
    const scan = scanOf({
      skills: [
        file({
          path: ".claude/skills/a/SKILL.md",
          capability: "skills",
          frontmatter: { description: "x" },
        }),
      ],
    });
    const cell = cellFor(capabilityCells(scan), "skills");

    expect(cell.band.name).toBe("bronze");
    expect(cell.quality).toContain(`under ${MIN_DESCRIPTION} characters`);
  });

  it("says when a description states when to use it, once every one is long enough", () => {
    const scan = scanOf({
      skills: [
        file({
          path: ".claude/skills/a/SKILL.md",
          capability: "skills",
          frontmatter: { description: "Checks a deploy is safe. Use before any production release." },
        }),
      ],
    });
    expect(cellFor(capabilityCells(scan), "skills").quality).toBe("1 of 1 say when to use them");
  });

  /**
   * The regression that the widened predicate exists for. "Use before any
   * production deploy" is one of the commonest shapes a real description
   * takes, and reading it as saying nothing about when to use it was read as
   * the tool being wrong about the file.
   */
  it("reads the ordinary imperative forms as stating when to use something", () => {
    for (const form of [
      "Checks a deploy is safe. Use before any production release.",
      "Reviews money handling. Use after any change under src/billing.",
      "Triages the queue. Use when a customer escalates.",
      "Migrates the schema. Use this for any column change.",
    ]) {
      expect(saysWhenToUse(form), form).toBe(true);
    }
    expect(saysWhenToUse("Database helper.")).toBe(false);
    expect(saysWhenToUse("Reviews a diff for correctness.")).toBe(false);
  });

  it("gives every overall band a tone, so a band can never render uncoloured", () => {
    for (const band of MATURITY_BANDS) expect(MATURITY_TONE[band]).toBeTruthy();
  });

  /**
   * The headline's own contradiction, which only exists because one
   * capability's first band starts above 1: a repository with a single hook
   * handler is configured, scores 0, and had the seal calling it
   * "unconfigured" one word before "1 of 8 configured".
   */
  it("never calls a repository unconfigured while the count beside it is not zero", () => {
    expect(sealBand(0, 0)).toBe("unconfigured");
    expect(sealBand(0, 1)).toBe("minimal");
    // A floor, not an override: every other band is the score's own.
    expect(sealBand(0.3, 4)).toBe(maturityBand(0.3));
    expect(sealBand(1, 8)).toBe("extensive");
  });

  it("bands the score at stated quarters", () => {
    expect(maturityBand(0)).toBe("unconfigured");
    expect(maturityBand(0.2)).toBe("minimal");
    expect(maturityBand(0.25)).toBe("developing");
    expect(maturityBand(0.5)).toBe("established");
    expect(maturityBand(0.75)).toBe("extensive");
    expect(maturityBand(1)).toBe("extensive");
  });

  it("puts a band on every cell the grid renders, absent ones included", () => {
    const cells = capabilityCells(scanOf({}));
    expect(cells).toHaveLength(CAPABILITIES.length);
    for (const cell of cells) {
      expect(cell.band.band, cell.capability).toBe(0);
      expect(cell.band.name, cell.capability).toBe("none");
      expect(cell.band.measured, cell.capability).toBeTruthy();
      // An unconfigured capability still has to say what would count.
      expect(cell.band.next, cell.capability).toContain("bronze");
      expect(cell.quality, cell.capability).toBeNull();
    }
  });
});

/**
 * The scanner itself, against real directories.
 *
 * Everything above this point hand-builds a `RepoScan`, which is why the
 * capability rules were right about workflows while the page reported "0
 * workflows" for a repository that had three: the factory wrote
 * `.claude/workflows/a.js`, and nothing tested that the scanner would ever
 * produce such a file. It would not - one extension filter, written for
 * markdown and config, was applied to every capability, and workflow scripts
 * are JavaScript. A wrong number is worse than a missing one, so the scanner
 * gets its own directory.
 */
describe("RepoScanner", () => {
  const write = (root: string, rel: string, text = "x\n") => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };

  const tempRepo = (): string => mkdtempSync(join(tmpdir(), "repo-scan-"));

  const found = (scan: RepoScan, capability: Capability) =>
    scan.capabilities.find((c) => c.capability === capability)!;

  it("counts a JavaScript workflow script", () => {
    const root = tempRepo();
    write(root, ".claude/workflows/review-changes.js", "export const meta = {}\n");
    write(root, ".claude/workflows/survey.mjs", "export const meta = {}\n");

    const workflows = found(new RepoScanner().scan(root), "workflows");
    expect(workflows.present).toBe(true);
    expect(workflows.files.map((f) => f.path).sort()).toEqual([
      ".claude/workflows/review-changes.js",
      ".claude/workflows/survey.mjs",
    ]);

    rmSync(root, { recursive: true, force: true });
  });

  it("still counts a README beside the scripts, and reports none when the directory is empty", () => {
    const root = tempRepo();
    write(root, ".claude/workflows/README.md", "# how these run\n");
    expect(found(new RepoScanner().scan(root), "workflows").files).toHaveLength(1);

    const bare = tempRepo();
    mkdirSync(join(bare, ".claude/workflows"), { recursive: true });
    const empty = found(new RepoScanner().scan(bare), "workflows");
    expect(empty.present).toBe(false);
    expect(empty.files).toHaveLength(0);
    // An absence has to say where we looked, or it reads as a check nobody ran.
    expect(empty.lookedFor).toContain(".claude/workflows/");

    rmSync(root, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  });

  it("does not let the script extensions leak into the prose capabilities", () => {
    const root = tempRepo();
    write(root, ".claude/skills/page-1to1/SKILL.md", "---\nname: page\n---\n# page\n");
    write(root, ".claude/skills/page-1to1/scripts/push.js", "console.log(1)\n");

    const skills = found(new RepoScanner().scan(root), "skills");
    // A skill's helper script is not a second skill. Counting it would inflate
    // the file count in the cell and say the repo configured more than it did.
    expect(skills.files.map((f) => f.path)).toEqual([".claude/skills/page-1to1/SKILL.md"]);

    rmSync(root, { recursive: true, force: true });
  });

  it("walks both directories the skills cell covers", () => {
    const root = tempRepo();
    write(root, ".claude/skills/review/SKILL.md", "---\nname: review\n---\n# review\n");
    write(root, ".claude/commands/ship.md", "---\nname: ship\n---\n# ship\n");
    write(root, ".claude/commands/db/migrate.md", "---\nname: migrate\n---\n# migrate\n");

    const scan = new RepoScanner().scan(root);
    const skills = found(scan, "skills");
    expect(skills.present).toBe(true);
    // Both paths are named, so an empty cell can say where it looked.
    expect(skills.lookedFor).toEqual([".claude/skills/", ".claude/commands/"]);
    expect(capabilityBand(scan, "skills").measured).toBe("3 skills or commands");

    rmSync(root, { recursive: true, force: true });
  });

  it("reads a pipeline for the action that runs Claude, not for existing", () => {
    const root = tempRepo();
    write(root, ".github/workflows/ci.yml", "on: [push]\njobs:\n  check:\n    steps:\n      - run: npm test\n");
    const bare = found(new RepoScanner().scan(root), "ci");
    // Seen, so the absence can name it - but a test job is not this cell.
    expect(bare.files).toHaveLength(1);
    expect(bare.present).toBe(false);

    write(root, ".github/workflows/house-rules.yml",
      "on:\n  pull_request:\njobs:\n  rules:\n    steps:\n      - uses: anthropics/claude-code-action@v1\n");
    const scan = new RepoScanner().scan(root);
    expect(found(scan, "ci").present).toBe(true);
    expect(capabilityBand(scan, "ci").measured).toBe("1 CI workflow");

    rmSync(root, { recursive: true, force: true });
  });

  /**
   * GitLab, in both the shapes it comes in.
   *
   * The root file is one job; splitting jobs into `.gitlab/ci/` and pulling
   * them in with `include:` is ordinary practice, and reading only the root
   * file reported "no CI" for a repository whose Claude job was one include
   * away. The cell has to be able to find it, and to say where it looked.
   */
  it("finds a GitLab job in the root file and in an included one", () => {
    const root = tempRepo();
    write(root, ".gitlab-ci.yml", "stages:\n  - ai\ninclude:\n  - local: .gitlab/ci/claude.yml\n");
    write(root, ".gitlab/ci/claude.yml",
      "claude:\n  image: node:24-alpine3.21\n  before_script:\n" +
      "    - curl -fsSL https://claude.ai/install.sh | bash\n  script:\n" +
      "    - >\n      claude\n      -p \"Review this MR\"\n      --permission-mode acceptEdits\n");

    const scan = new RepoScanner().scan(root);
    const ci = found(scan, "ci");
    expect(ci.present, "the included job is the one that runs Claude").toBe(true);
    expect(capabilityBand(scan, "ci").measured).toBe("1 CI workflow");
    expect(ci.lookedFor, "an absence has to be able to name both hosts").toEqual([
      ".gitlab-ci.yml",
      ".github/workflows/",
      ".gitlab/ci/",
    ]);
    expect(cellFor(capabilityCells(scan), "ci").quality).toBe(
      "1 of 2 pipelines run Claude - headless CLI, CLI installed in the job",
    );

    rmSync(root, { recursive: true, force: true });
  });

  /**
   * A README beside the workflows is not a pipeline. It used to be counted,
   * because this capability shared the prose file filter with the other seven,
   * and it landed in the denominator of "2 of 3 pipelines run Claude" - the
   * one number in that cell whose whole job is to say what the 2 is out of.
   */
  it("does not count prose beside the workflows as a pipeline", () => {
    const root = tempRepo();
    write(root, ".github/workflows/README.md", "# How our CI works\n");
    write(root, ".github/workflows/claude.yml",
      "on:\n  issue_comment:\njobs:\n  claude:\n    steps:\n      - uses: anthropics/claude-code-action@v1\n");

    const scan = new RepoScanner().scan(root);
    expect(found(scan, "ci").files.map((f) => f.path)).toEqual([".github/workflows/claude.yml"]);
    expect(cellFor(capabilityCells(scan), "ci").quality).toBe(
      "1 of 1 pipeline runs Claude - GitHub Action",
    );

    rmSync(root, { recursive: true, force: true });
  });

  /**
   * Memory is not only a root file, and reading it as one reported "no
   * memory" for a monorepo that keeps its standing instructions next to the
   * code they govern. Claude Code loads `packages/api/CLAUDE.md` when work
   * happens under `packages/api`, so the scan has to see it.
   */
  it("finds memory in a subdirectory, including a package's own .claude", () => {
    const root = tempRepo();
    write(root, "CLAUDE.md", "# root\n");
    write(root, "packages/api/CLAUDE.md", "# api\n");
    write(root, "packages/api/AGENTS.md", "# api agents\n");
    write(root, "services/web/.claude/CLAUDE.md", "# web\n");
    // Somebody else's, in a tree that is never descended into. Counting a
    // vendored CLAUDE.md as this repository's configuration is a wrong number,
    // and a wrong number is worse than a missing one.
    write(root, "node_modules/some-pkg/CLAUDE.md", "# theirs\n");
    write(root, "dist/CLAUDE.md", "# built\n");

    const scan = new RepoScanner().scan(root);
    const memory = found(scan, "memory");
    expect(memory.files.map((f) => f.path).sort()).toEqual([
      "CLAUDE.md",
      "packages/api/AGENTS.md",
      "packages/api/CLAUDE.md",
      "services/web/.claude/CLAUDE.md",
    ]);
    expect(capabilityBand(scan, "memory").measured).toBe("4 memory files");
    // The root file is reachable from the root pass and from nothing else, but
    // the guard is what keeps that true as the bases grow.
    expect(memory.files.filter((f) => f.path === "CLAUDE.md")).toHaveLength(1);
    // An absence has to be able to say the subdirectory form counted too.
    // `**/`, not `*/`: the search goes three deep, and a reader checking the
    // page by typing the one-level glob would not find what it found.
    expect(memory.lookedFor).toEqual([
      "CLAUDE.md",
      "AGENTS.md",
      ".claude/CLAUDE.md",
      "**/CLAUDE.md",
      "**/AGENTS.md",
      "**/.claude/CLAUDE.md",
    ]);

    rmSync(root, { recursive: true, force: true });
  });

  /** The same for rules: a nested `.cursor/rules/` governs its own subtree. */
  it("finds rules in a subdirectory as well as at the root", () => {
    const root = tempRepo();
    write(root, ".cursor/rules/house.mdc", "---\ndescription: house\n---\nx\n");
    write(root, "packages/api/.cursor/rules/api.mdc", "---\ndescription: api\n---\nx\n");
    write(root, "services/worker/.claude/rules/worker.md", "# worker\n");
    write(root, "node_modules/some-pkg/.cursor/rules/theirs.mdc", "x\n");

    const scan = new RepoScanner().scan(root);
    expect(found(scan, "rules").files.map((f) => f.path).sort()).toEqual([
      ".cursor/rules/house.mdc",
      "packages/api/.cursor/rules/api.mdc",
      "services/worker/.claude/rules/worker.md",
    ]);
    expect(found(scan, "rules").lookedFor).toContain("**/.cursor/rules/");

    rmSync(root, { recursive: true, force: true });
  });

  /**
   * The subdirectory search costs a readdir per directory whether or not
   * anything matches, so it is capped - and a search that stopped early must
   * never read as one that finished and found nothing.
   */
  it("says so when the subdirectory search stopped early", () => {
    const root = tempRepo();
    write(root, "CLAUDE.md", "# root\n");
    for (let i = 0; i < 420; i += 1) mkdirSync(join(root, `pkg-${i}`), { recursive: true });

    const scan = new RepoScanner().scan(root);
    expect(scan.truncated).toBe(true);
    // Truncated is not empty: what it did read is still reported.
    expect(found(scan, "memory").present).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });

  /**
   * Hooks, end to end from a real settings.json, because the count is the one
   * figure on that cell a reader checks by opening the file. Three events with
   * two matchers under each is six handlers.
   */
  it("counts a settings.json by its events and the matchers under them", () => {
    const root = tempRepo();
    const group = (matcher: string, command: string) =>
      ({ matcher, hooks: [{ type: "command", command }] });
    write(root, ".claude/settings.json", JSON.stringify({
      hooks: {
        PreToolUse: [group("Bash", "guard.sh"), group("Edit", "guard.sh")],
        PostToolUse: [group("Bash", "spool.mjs"), group("Edit", "spool.mjs")],
        // Two commands under one matcher is still one matching part.
        Stop: [{ hooks: [{ command: "say.sh" }, { command: "log.sh" }] }, group("*", "tidy.sh")],
      },
    }));

    const scan = new RepoScanner().scan(root);
    expect(found(scan, "hooks").present).toBe(true);
    expect(capabilityBand(scan, "hooks")).toMatchObject({
      instances: 6,
      measured: "6 handlers",
      name: "silver",
      rule: "6-7 is silver",
    });
    expect(cellFor(capabilityCells(scan), "hooks").quality).toBe("3 events, 6 matchers");

    rmSync(root, { recursive: true, force: true });
  });

  it("keeps MCP and Hooks disagreeing about the same settings.json", () => {
    const root = tempRepo();
    write(root, ".claude/settings.json", JSON.stringify({ hooks: { Stop: [] } }));

    const scan = new RepoScanner().scan(root);
    // Both look at the file; only the one it actually configures is present.
    expect(found(scan, "hooks").present).toBe(true);
    expect(found(scan, "mcp").present).toBe(false);
    expect(found(scan, "mcp").files).toHaveLength(1);

    rmSync(root, { recursive: true, force: true });
  });
});
