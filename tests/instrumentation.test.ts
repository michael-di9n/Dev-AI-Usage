import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_INSTRUMENTATION_DETECTORS,
  runInstrumentation,
} from "../src/analyze/instrumentation/index";
import {
  CONTENT_SETTINGS,
  contentCells,
  receiptFor,
  settingSnippet,
  endpointMatches,
  hookExtras,
  hygieneFindings,
  instrumentationBand,
  metCount,
  requirementCells,
  REQUIREMENTS,
  tierSummaries,
  tiersComplete,
  tracingIsOn,
  wordsAreSent,
  type RequirementCell,
  type SettingsScan,
} from "../src/domain/instrumentation";
import { SettingsScanner } from "../src/ingest/settings/SettingsScanner";

const ORIGIN = "http://localhost:3000";

/** The seven variables exercise 01 tells you to merge, as the scan sees them. */
const FULL_ENV: Record<string, string> = {
  CLAUDE_CODE_ENABLE_TELEMETRY: "1",
  OTEL_METRICS_EXPORTER: "otlp",
  OTEL_LOGS_EXPORTER: "otlp",
  OTEL_TRACES_EXPORTER: "otlp",
  CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: "1",
  OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
  OTEL_EXPORTER_OTLP_ENDPOINT: `${ORIGIN}/api/otlp`,
};

/** Everything tier 1 needs, and nothing tier 2 does. */
const TIER_1_ENV = Object.fromEntries(
  Object.entries(FULL_ENV).filter(
    ([k]) => k !== "OTEL_TRACES_EXPORTER" && k !== "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA",
  ),
);

function scanOf(
  env: Record<string, string> = {},
  hooks: SettingsScan["hooks"] = [],
  over: Partial<SettingsScan> = {},
): SettingsScan {
  return {
    root: "/repo",
    name: "repo",
    scannedAt: "2026-09-06T00:00:00.000Z",
    files: [],
    env: Object.fromEntries(
      Object.entries(env).map(([key, value]) => [
        key,
        { value, layer: "local" as const, file: ".claude/settings.local.json" },
      ]),
    ),
    hooks,
    ignoredUserFile: null,
    userSettings: {
      path: "~/.claude/settings.json",
      source: "home",
      exists: true,
      fallback: "~/.claude/settings.json",
      problem: null,
    },
    receiverOrigin: ORIGIN,
    ...over,
  };
}

const spoolHook = (event: string): SettingsScan["hooks"][number] => ({
  event,
  command: `node /repo/bin/hook-spool.mjs ${event}`,
  layer: "local",
  file: ".claude/settings.local.json",
  spools: true,
});

const cellFor = (cells: RequirementCell[], key: string): RequirementCell => {
  const cell = cells.find((c) => c.key === key);
  expect(cell, `no cell for ${key}`).toBeDefined();
  return cell!;
};

// ---------------------------------------------------------------------------

describe("the band and the gate", () => {
  it("reaches the top band with every requirement met", () => {
    // Arrange
    const scan = scanOf(FULL_ENV, [spoolHook("PostToolUse")]);

    // Act
    const cells = requirementCells(scan);

    // Assert
    expect(instrumentationBand(cells)).toBe("extensive");
    expect(tracingIsOn(cells)).toBe(true);
    expect(metCount(cells)).toBe(REQUIREMENTS.length);
    expect(metCount(cells)).toBe(8);
  });

  it("reads unconfigured with nothing set, and every cell says what to add", () => {
    const cells = requirementCells(scanOf());

    expect(instrumentationBand(cells)).toBe("unconfigured");
    expect(tracingIsOn(cells)).toBe(false);
    expect(metCount(cells)).toBe(0);
    // A finding with no fix beside it moves the problem rather than solving it.
    for (const cell of cells) {
      expect(cell.fix, cell.key).not.toBe("");
      expect(cell.finding, cell.key).not.toBe("");
    }
  });

  it("holds the gate shut when tier 1 is complete but spans are not exported", () => {
    const cells = requirementCells(scanOf(TIER_1_ENV));

    expect(instrumentationBand(cells)).toBe("developing");
    expect(tracingIsOn(cells), "spans are what put durations on the page").toBe(false);
    expect(cellFor(cells, "OTEL_TRACES_EXPORTER").state).toBe("missing");
  });

  it("opens the gate at tier 2, before the PostToolUse hook exists", () => {
    // A trace with spans and no hook is still a trace with real durations in
    // it, so tier 3 must not be part of the gate.
    const cells = requirementCells(scanOf(FULL_ENV));

    expect(instrumentationBand(cells)).toBe("established");
    expect(tracingIsOn(cells)).toBe(true);
    expect(cellFor(cells, "hooks.PostToolUse").state).toBe("missing");
  });

  it("stays at minimal when the span variables are set but nothing can export", () => {
    // Without tier 1 there is no working exporter, so these two are emitting
    // into the void. Counting completed tiers rather than reading them in
    // order would call this established.
    const cells = requirementCells(
      scanOf({ OTEL_TRACES_EXPORTER: "otlp", CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: "1" }),
    );

    expect(instrumentationBand(cells)).toBe("minimal");
    expect(tracingIsOn(cells)).toBe(false);
  });
});

describe("the content branch's own gate", () => {
  /*
   * The second terminus on the diagram. It is drawn like the first and reads
   * like it, so what it must never do is behave like it: none of this moves
   * the band, completes a tier, or changes a single figure anywhere else in
   * the app.
   */
  it("needs both halves - the events to ride on, and something to send", () => {
    const cells = requirementCells(scanOf(TIER_1_ENV));
    const content = contentCells(scanOf({ ...TIER_1_ENV, OTEL_LOG_USER_PROMPTS: "1" }));

    expect(wordsAreSent(cells, content)).toBe(true);
  });

  it("sends nothing with all four set and no exporter under them", () => {
    // The words are attributes on the events. Four switches over a dry run
    // are four switches with nothing to hang on.
    const env = Object.fromEntries(
      CONTENT_SETTINGS.map((setting) => [setting.key, "1"]),
    );

    expect(wordsAreSent(requirementCells(scanOf(env)), contentCells(scanOf(env)))).toBe(false);
  });

  it("sends nothing with the whole run set and none of the four", () => {
    const cells = requirementCells(scanOf(FULL_ENV));

    expect(wordsAreSent(cells, contentCells(scanOf(FULL_ENV)))).toBe(false);
  });

  it("moves neither the band nor the tier count when all four are on", () => {
    const bare = scanOf(FULL_ENV);
    const wordy = scanOf({
      ...FULL_ENV,
      ...Object.fromEntries(CONTENT_SETTINGS.map((setting) => [setting.key, "1"])),
    });

    expect(instrumentationBand(requirementCells(wordy)))
      .toBe(instrumentationBand(requirementCells(bare)));
    expect(tiersComplete(requirementCells(wordy)))
      .toBe(tiersComplete(requirementCells(bare)));
  });
});

describe("the ladder", () => {
  it("splits the eight requirements into three rungs, gating the first two", () => {
    const tiers = tierSummaries(requirementCells(scanOf(FULL_ENV, [spoolHook("PostToolUse")])));

    expect(tiers.map((t) => t.tier)).toEqual([1, 2, 3]);
    expect(tiers.map((t) => t.total)).toEqual([5, 2, 1]);
    expect(tiers.map((t) => t.gating), "the waterline sits under tier 2").toEqual([true, true, false]);
    expect(tiers.every((t) => t.complete)).toBe(true);
  });

  it("counts each rung's met requirements, so the segments can be checked", () => {
    // The fraction printed beside the segments has to be the count of filled
    // ones, or the drawing and the words disagree about the same claim.
    const tiers = tierSummaries(requirementCells(scanOf(TIER_1_ENV)));

    expect(tiers[0]!.met).toBe(5);
    expect(tiers[0]!.complete).toBe(true);
    expect(tiers[1]!.met).toBe(0);
    expect(tiers[1]!.complete).toBe(false);
    for (const tier of tiers) {
      expect(tier.cells.filter((c) => c.state === "met").length, `tier ${tier.tier}`).toBe(tier.met);
      expect(tier.cells).toHaveLength(tier.total);
    }
  });

  it("strikes the seal with tiers complete, not requirements met", () => {
    expect(tiersComplete(requirementCells(scanOf()))).toBe(0);
    expect(tiersComplete(requirementCells(scanOf(TIER_1_ENV)))).toBe(1);
    expect(tiersComplete(requirementCells(scanOf(FULL_ENV)))).toBe(2);
    expect(tiersComplete(requirementCells(scanOf(FULL_ENV, [spoolHook("PostToolUse")])))).toBe(3);
  });

  it("gives every requirement a panel of its own to open", () => {
    /*
     * The fixes came back onto this page when the Telemetry and Hooks tabs
     * were deleted, one shut panel per node. A requirement with no panel would
     * be a node that finds a gap and cannot say how to close it, which is the
     * failure the tabs were supposed to fix and instead moved elsewhere.
     */
    const cells = requirementCells(scanOf());
    const anchors = cells.map((c) => `req-${c.key.replace(/[^\w]/g, "-")}`);

    expect(new Set(anchors).size).toBe(cells.length);
    // A fragment has to survive being put in a URL. `hooks.PostToolUse` is the
    // one key with a character that would not.
    for (const anchor of anchors) expect(anchor).toMatch(/^req-[\w-]+$/);
  });

  it("says what each variable buys in its own words, not its tier's", () => {
    /*
     * The metrics and the logs exporters are the pair this exists for: same
     * tier, same value, side by side in the diagram, and completely different
     * things arrive because of them. While the panel printed the tier's
     * `unlocks`, both said "cost, token and active-time metrics" and neither
     * answered the question a reader opens a panel to ask.
     */
    const cells = requirementCells(scanOf());
    const buys = cells.map((c) => c.buys);

    for (const cell of cells) expect(cell.buys.length, cell.key).toBeGreaterThan(0);
    expect(new Set(buys).size, "two requirements share a description").toBe(cells.length);

    // The two that used to be indistinguishable now name their own records.
    expect(cellFor(cells, "OTEL_METRICS_EXPORTER").buys).toContain("active_time.total");
    expect(cellFor(cells, "OTEL_LOGS_EXPORTER").buys).toContain("tool_result");
  });

  it("offers the content settings as a branch, off every count on the page", () => {
    /*
     * The whole point of the branch: these must never reach the band, the
     * gate, or the "N of 3 tiers complete" figure. A null tier is what
     * guarantees it, because every count filters for a literal rung.
     */
    const all = { ...FULL_ENV, OTEL_LOG_USER_PROMPTS: "1", OTEL_LOG_TOOL_DETAILS: "1" };
    const cells = requirementCells(scanOf(all));
    const content = contentCells(scanOf(all));

    for (const setting of CONTENT_SETTINGS) expect(setting.tier, setting.key).toBeNull();
    expect(content).toHaveLength(4);
    // Setting two of them moves nothing: same band, same gate, same tier count.
    expect(instrumentationBand(cells)).toBe(instrumentationBand(requirementCells(scanOf(FULL_ENV))));
    expect(tiersComplete(cells)).toBe(tiersComplete(requirementCells(scanOf(FULL_ENV))));
    expect(tierSummaries(cells).flatMap((t) => t.cells)).toHaveLength(REQUIREMENTS.length);
  });

  it("counts a content setting as set however it was spelled", () => {
    // 1, true, yes and on are all correct. Calling "true" a wrong value would
    // send someone to change a line that is already right.
    for (const spelling of ["1", "true", "YES", "on"]) {
      const cell = cellFor(contentCells(scanOf({ OTEL_LOG_USER_PROMPTS: spelling })), "OTEL_LOG_USER_PROMPTS");
      expect(cell.state, spelling).toBe("met");
    }
    const off = cellFor(contentCells(scanOf()), "OTEL_LOG_USER_PROMPTS");
    expect(off.state).toBe("missing");
    // Off is the default and not a gap, so there is nothing to "fix" beyond
    // the line that would turn it on.
    expect(off.fix).toContain("OTEL_LOG_USER_PROMPTS");
  });

  it("quotes a settings line for every variable, and none for the hook", () => {
    const scan = scanOf();
    const cells = requirementCells(scan);

    for (const cell of cells) {
      const snippet = settingSnippet(cell, scan);
      if (cell.key.startsWith("hooks.")) {
        // A hook is a command with a matcher, not a key and a value. Quoting
        // one as JSON would be inventing a shape the reader cannot paste.
        expect(snippet, cell.key).toBeNull();
        continue;
      }
      expect(snippet, cell.key).not.toBeNull();
      expect(snippet!.json).toContain(`"${cell.key}"`);
      expect(snippet!.file.length).toBeGreaterThan(0);
    }
  });

  it("quotes this receiver's own address for the endpoint, not a literal", () => {
    // The port is whatever Next settled on at startup. A copyable line with
    // 3000 hard-coded into it is a line that points at another process.
    const scan = scanOf();
    const cell = cellFor(requirementCells(scan), "OTEL_EXPORTER_OTLP_ENDPOINT");

    expect(settingSnippet(cell, scan)!.json).toBe(
      `"OTEL_EXPORTER_OTLP_ENDPOINT": "${scan.receiverOrigin}/api/otlp"`,
    );
  });

  it("lights a requirement only on the signal it is responsible for", () => {
    /*
     * The lamp is the one thing on the page read from the receiver rather than
     * from a settings file, and the two can disagree in the direction that
     * matters: OTel reads its variables at launch and never backfills, so a
     * correct machine is silent until the next session. A lamp wired to a
     * general "something arrived" would go green on the metrics node because
     * an unrelated event turned up.
     */
    const cells = requirementCells(scanOf(FULL_ENV));
    const at = (key: string) => cellFor(cells, key);
    const live = { ...NOTHING_RECEIVED, events: 12 };

    expect(receiptFor(at("OTEL_LOGS_EXPORTER"), live)!.receiving).toBe(true);
    expect(receiptFor(at("OTEL_METRICS_EXPORTER"), live)!.receiving).toBe(false);
    expect(receiptFor(at("OTEL_TRACES_EXPORTER"), live)!.receiving).toBe(false);
    // Any decoded record proves the endpoint, the wire format and the switch
    // at once: it could not have arrived without all three.
    expect(receiptFor(at("OTEL_EXPORTER_OTLP_ENDPOINT"), live)!.receiving).toBe(true);
    expect(receiptFor(at("CLAUDE_CODE_ENABLE_TELEMETRY"), live)!.receiving).toBe(true);
  });

  /**
   * The raw number, not just the sentence built from it - this is what a met
   * vessel's water level reads off (`waterFill` in `ReadinessPipe`'s `Stop`),
   * so `detail` agreeing with `count` in words is not enough on its own.
   */
  it("carries the same number the sentence was built from", () => {
    const cells = requirementCells(scanOf(FULL_ENV));
    const at = (key: string) => cellFor(cells, key);
    const live = { ...NOTHING_RECEIVED, events: 12, metrics: 3, spans: 7 };

    expect(receiptFor(at("OTEL_LOGS_EXPORTER"), live)!.count).toBe(12);
    expect(receiptFor(at("OTEL_METRICS_EXPORTER"), live)!.count).toBe(3);
    expect(receiptFor(at("OTEL_TRACES_EXPORTER"), live)!.count).toBe(7);
    // The switch/protocol/endpoint trio shares one count: every signal that
    // could have arrived, since any of them proves all three.
    expect(receiptFor(at("CLAUDE_CODE_ENABLE_TELEMETRY"), live)!.count).toBe(22);
  });

  it("reports nothing received as a measured zero, never as a gap", () => {
    // The receiver runs in this process and the database is open, so "none"
    // is an answer. The house rule cuts the other way here.
    const cells = requirementCells(scanOf(FULL_ENV));
    for (const cell of cells) {
      const receipt = receiptFor(cell, NOTHING_RECEIVED);
      expect(receipt, cell.key).not.toBeNull();
      expect(receipt!.receiving).toBe(false);
      expect(receipt!.detail).toMatch(/^0 /);
    }
  });
});

/** A receiver that is running and has heard nothing. Every field a true zero. */
const NOTHING_RECEIVED = {
  events: 0,
  metrics: 0,
  sessions: 0,
  spans: 0,
  timedSpans: 0,
  otelLastSeen: null,
  spanLastSeen: null,
  toolCalls: 0,
  timedToolCalls: 0,
  promptsWithText: 0,
  repliesWithText: 0,
};

describe("one requirement, read against a scan", () => {
  it("calls a wrong value wrong, not missing", () => {
    // The reader who set this is certain they have done the exercise. Telling
    // them it is "not set" sends them to add a line that is already there.
    const cells = requirementCells(scanOf({ ...FULL_ENV, OTEL_EXPORTER_OTLP_PROTOCOL: "grpc" }));
    const cell = cellFor(cells, "OTEL_EXPORTER_OTLP_PROTOCOL");

    expect(cell.state).toBe("wrong");
    expect(cell.found).toBe("grpc");
    expect(cell.fix).toContain("http/json");
    expect(instrumentationBand(cells), "a broken tier 1 is not a complete one").toBe("minimal");
  });

  it("accepts ENABLE_ENHANCED_TELEMETRY_BETA as the alias it is", () => {
    const env = { ...FULL_ENV };
    delete env.CLAUDE_CODE_ENHANCED_TELEMETRY_BETA;
    env.ENABLE_ENHANCED_TELEMETRY_BETA = "1";

    const cells = requirementCells(scanOf(env));

    expect(cellFor(cells, "CLAUDE_CODE_ENHANCED_TELEMETRY_BETA").state).toBe("met");
    expect(tracingIsOn(cells)).toBe(true);
  });

  it("names both addresses when the endpoint points somewhere else", () => {
    const cells = requirementCells(
      scanOf({ ...FULL_ENV, OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318/api/otlp" }),
    );
    const cell = cellFor(cells, "OTEL_EXPORTER_OTLP_ENDPOINT");

    expect(cell.state).toBe("wrong");
    // Both, because "wrong" without the address it should be is unactionable.
    expect(cell.finding).toContain("4318");
    expect(cell.finding).toContain(ORIGIN);
  });

  it("treats loopback spellings of the same receiver as the same receiver", () => {
    expect(endpointMatches("http://127.0.0.1:3000/api/otlp", ORIGIN)).toBe(true);
    expect(endpointMatches("http://localhost:3000", ORIGIN)).toBe(true);
    expect(endpointMatches("http://localhost:3001/api/otlp", ORIGIN)).toBe(false);
    expect(endpointMatches("not a url", ORIGIN)).toBe(false);
  });

  it("says a PostToolUse hook that is not ours cannot time anything", () => {
    const formatter = {
      event: "PostToolUse",
      command: "npx prettier --write $FILE_PATH",
      layer: "user" as const,
      file: "~/.claude/settings.json",
      spools: false,
    };
    const cell = cellFor(requirementCells(scanOf(FULL_ENV, [formatter])), "hooks.PostToolUse");

    expect(cell.state, "registered, but not to anything that records a duration").toBe("wrong");
    expect(cell.found).toContain("prettier");
  });

  it("never reports a found value as an empty string when nothing was set", () => {
    // A missing number is never a zero, and a missing value is never "".
    for (const cell of requirementCells(scanOf())) {
      expect(cell.found, cell.key).toBeNull();
      expect(cell.source, cell.key).toBeNull();
    }
    for (const cell of requirementCells(scanOf(FULL_ENV, [spoolHook("PostToolUse")]))) {
      expect(cell.found, cell.key).not.toBeNull();
      expect(cell.fix, "a met requirement has nothing to fix").toBe("");
    }
  });
});

describe("hygiene", () => {
  it("warns about a setting that breaks the join key, without moving the band", () => {
    const scan = scanOf({
      ...FULL_ENV,
      OTEL_METRICS_INCLUDE_SESSION_ID: "false",
    }, [spoolHook("PostToolUse")]);

    const findings = hygieneFindings(scan);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.key).toBe("OTEL_METRICS_INCLUDE_SESSION_ID");
    expect(findings[0]!.breaks).toContain("session.id");
    // A harmful setting needs a line removing; a missing requirement needs one
    // adding. One number that mixed them could say neither.
    expect(instrumentationBand(requirementCells(scan))).toBe("extensive");
  });

  it("reads the on/off switches as switches, not as exact strings", () => {
    expect(hygieneFindings(scanOf({ OTEL_LOG_RAW_API_BODIES: "true" }))).toHaveLength(1);
    expect(hygieneFindings(scanOf({ OTEL_LOG_RAW_API_BODIES: "1" }))).toHaveLength(1);
    expect(hygieneFindings(scanOf({ OTEL_LOG_RAW_API_BODIES: "false" }))).toEqual([]);
  });

  it("no longer calls the content settings harmful", () => {
    /*
     * They were hygiene faults on the argument that the transcript already
     * carries the same text. That argument only holds for an agent running on
     * this machine, and half the sessions arriving at this receiver have no
     * transcript on this disk - for those, these four are the only record of
     * what was said. They are a branch off the run now, not a fault.
     */
    const on = {
      OTEL_LOG_USER_PROMPTS: "1",
      OTEL_LOG_ASSISTANT_RESPONSES: "1",
      OTEL_LOG_TOOL_DETAILS: "1",
      OTEL_LOG_TOOL_CONTENT: "1",
    };
    expect(hygieneFindings(scanOf(on))).toEqual([]);

    // Raw API bodies stayed behind: whole message histories including the
    // system prompt, implying consent to all four above, read by nothing here.
    expect(hygieneFindings(scanOf({ ...on, OTEL_LOG_RAW_API_BODIES: "1" })).map((f) => f.key))
      .toEqual(["OTEL_LOG_RAW_API_BODIES"]);
  });

  it("finds nothing on a clean configuration, which is the ordinary case", () => {
    expect(hygieneFindings(scanOf(FULL_ENV))).toEqual([]);
  });
});

describe("the extra handlers", () => {
  it("reports all four whether or not they are registered", () => {
    const extras = hookExtras(scanOf(FULL_ENV, [spoolHook("SessionEnd")]));

    expect(extras.map((e) => e.event)).toEqual([
      "PermissionDenied", "PreCompact", "SubagentStop", "SessionEnd",
    ]);
    expect(extras.find((e) => e.event === "SessionEnd")!.registered).toBe(true);
    expect(extras.find((e) => e.event === "PreCompact")!.registered).toBe(false);
    expect(extras.find((e) => e.event === "PreCompact")!.source).toBeNull();
  });
});

describe("the rule family", () => {
  it("scopes every signal to the project it scanned", () => {
    for (const s of runInstrumentation(scanOf(FULL_ENV))) {
      expect(s.scope).toBe("project");
      expect(s.scopeId).toBe("/repo");
      expect(s.date).toBe("2026-09-06");
    }
  });

  it("gives every rule a sentence to show beside its finding", () => {
    for (const detector of ALL_INSTRUMENTATION_DETECTORS) {
      expect(detector.kind, "a rule with no kind cannot be found in the list").not.toBe("");
      expect(detector.explanation.length, detector.kind).toBeGreaterThan(20);
    }
  });

  it("emits a requirement signal for every requirement, met or not", () => {
    const signals = runInstrumentation(scanOf()).filter(
      (s) => s.kind === "instrumentation.requirement",
    );
    expect(signals).toHaveLength(REQUIREMENTS.length);
    expect(signals.every((s) => s.severity === "warn")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The scanner, against real directories
// ---------------------------------------------------------------------------

describe("SettingsScanner", () => {
  const write = (root: string, rel: string, body: unknown): void => {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, typeof body === "string" ? body : JSON.stringify(body));
  };

  /** A home and a project, so nothing here can read the real machine's files. */
  const sandbox = (): { home: string; repo: string; clean: () => void } => {
    const base = mkdtempSync(join(tmpdir(), "settings-scan-"));
    const home = join(base, "home");
    const repo = join(base, "repo");
    mkdirSync(home, { recursive: true });
    mkdirSync(repo, { recursive: true });
    return { home, repo, clean: () => rmSync(base, { recursive: true, force: true }) };
  };

  it("reads the env block from a project settings file", () => {
    const { home, repo, clean } = sandbox();
    write(repo, ".claude/settings.json", { env: { OTEL_LOGS_EXPORTER: "otlp" } });

    const scan = new SettingsScanner({}, home).scan(repo, ORIGIN);

    expect(scan.env.OTEL_LOGS_EXPORTER!.value).toBe("otlp");
    expect(scan.env.OTEL_LOGS_EXPORTER!.layer).toBe("project");
    clean();
  });

  it("lets settings.local.json win, and says which file the value came from", () => {
    const { home, repo, clean } = sandbox();
    write(repo, ".claude/settings.json", { env: { OTEL_LOGS_EXPORTER: "console" } });
    write(repo, ".claude/settings.local.json", { env: { OTEL_LOGS_EXPORTER: "otlp" } });

    const scan = new SettingsScanner({}, home).scan(repo, ORIGIN);

    expect(scan.env.OTEL_LOGS_EXPORTER!.value).toBe("otlp");
    expect(scan.env.OTEL_LOGS_EXPORTER!.layer).toBe("local");
    expect(scan.env.OTEL_LOGS_EXPORTER!.file).toContain("settings.local.json");
    clean();
  });

  it("reads ~/.claude/settings.json when CLAUDE_CONFIG_DIR is unset", () => {
    const { home, repo, clean } = sandbox();
    write(home, ".claude/settings.json", { env: { CLAUDE_CODE_ENABLE_TELEMETRY: "1" } });

    const scan = new SettingsScanner({}, home).scan(repo, ORIGIN);

    expect(scan.env.CLAUDE_CODE_ENABLE_TELEMETRY!.layer).toBe("user");
    expect(scan.ignoredUserFile).toBeNull();
    clean();
  });

  it("reads CLAUDE_CONFIG_DIR instead of ~/.claude, and names the file it skipped", () => {
    /*
     * The trap in AGENTS.md and docs/04-troubleshooting.md, asserted directly.
     * Both files exist and disagree; only one of them is what Claude Code
     * loads. Merging them would report a setting as in force that is not, and
     * silently preferring ~/.claude would report the opposite.
     */
    const { home, repo, clean } = sandbox();
    const configDir = join(home, "elsewhere");
    write(home, ".claude/settings.json", { env: { OTEL_LOGS_EXPORTER: "console" } });
    write(configDir, "settings.json", { env: { OTEL_LOGS_EXPORTER: "otlp" } });

    const scan = new SettingsScanner({ CLAUDE_CONFIG_DIR: configDir }, home).scan(repo, ORIGIN);

    expect(scan.env.OTEL_LOGS_EXPORTER!.value).toBe("otlp");
    expect(scan.ignoredUserFile, "the shadowed file has to be named, or nobody finds it")
      .toBe("~/.claude/settings.json");
    clean();
  });

  it("raises no alarm when CLAUDE_CONFIG_DIR just names ~/.claude", () => {
    /*
     * Pointing the variable at the directory that would have been used anyway
     * is common and harmless. Reported against the real machine this was
     * written on, where the alarm fired at the top of the page about the file
     * the scan had just read - and a warning that fires on a correct setup
     * teaches the reader to scroll past the one that matters.
     */
    const { home, repo, clean } = sandbox();
    write(home, ".claude/settings.json", { env: { OTEL_LOGS_EXPORTER: "otlp" } });

    const scan = new SettingsScanner({ CLAUDE_CONFIG_DIR: join(home, ".claude") }, home)
      .scan(repo, ORIGIN);

    expect(scan.env.OTEL_LOGS_EXPORTER!.value, "it is still the file that gets read").toBe("otlp");
    expect(scan.ignoredUserFile, "nothing is being shadowed here").toBeNull();
    clean();
  });

  it("raises no alarm for a trailing slash on CLAUDE_CONFIG_DIR", () => {
    const { home, repo, clean } = sandbox();
    write(home, ".claude/settings.json", { env: {} });

    const scan = new SettingsScanner({ CLAUDE_CONFIG_DIR: join(home, ".claude") + "/" }, home)
      .scan(repo, ORIGIN);

    expect(scan.ignoredUserFile).toBeNull();
    clean();
  });

  it("leaves ignoredUserFile null when the shadowed file does not exist", () => {
    const { home, repo, clean } = sandbox();
    const configDir = join(home, "elsewhere");
    write(configDir, "settings.json", { env: {} });

    const scan = new SettingsScanner({ CLAUDE_CONFIG_DIR: configDir }, home).scan(repo, ORIGIN);

    expect(scan.ignoredUserFile).toBeNull();
    clean();
  });

  it("skips a malformed layer with a sentence, and still reads the others", () => {
    const { home, repo, clean } = sandbox();
    write(repo, ".claude/settings.json", "{ not json");
    write(repo, ".claude/settings.local.json", { env: { OTEL_LOGS_EXPORTER: "otlp" } });

    const scan = new SettingsScanner({}, home).scan(repo, ORIGIN);

    const broken = scan.files.find((f) => f.layer === "project")!;
    expect(broken.problem).toContain("not valid JSON");
    expect(scan.env.OTEL_LOGS_EXPORTER!.value, "one bad file must not lose the others").toBe("otlp");
    clean();
  });

  it("returns an empty scan rather than throwing when no settings file exists", () => {
    const { home, repo, clean } = sandbox();

    const scan = new SettingsScanner({}, home).scan(repo, ORIGIN);

    expect(scan.env).toEqual({});
    expect(scan.hooks).toEqual([]);
    // Absent files are still listed: an absence has to say what would have counted.
    expect(scan.files.map((f) => f.layer)).toEqual(["user", "project", "local"]);
    expect(scan.files.every((f) => !f.exists && f.problem === null)).toBe(true);
    clean();
  });

  it("counts only hook commands that run this tool's spool", () => {
    const { home, repo, clean } = sandbox();
    write(repo, ".claude/settings.json", {
      hooks: {
        PostToolUse: [
          { hooks: [{ type: "command", command: "npx prettier --write $FILE_PATH" }] },
          { hooks: [{ type: "command", command: "node /x/bin/hook-spool.mjs PostToolUse" }] },
        ],
        SessionEnd: [{ hooks: [{ type: "command", command: "echo done" }] }],
      },
    });

    const scan = new SettingsScanner({}, home).scan(repo, ORIGIN);

    expect(scan.hooks).toHaveLength(3);
    expect(scan.hooks.filter((h) => h.spools).map((h) => h.event)).toEqual(["PostToolUse"]);
    expect(cellFor(requirementCells(scan), "hooks.PostToolUse").state).toBe("met");
    clean();
  });

  it("survives a hooks block shaped in a way it does not understand", () => {
    const { home, repo, clean } = sandbox();
    write(repo, ".claude/settings.json", { hooks: { PostToolUse: "node hook-spool.mjs" } });

    const scan = new SettingsScanner({}, home).scan(repo, ORIGIN);

    // Not vouched for, so not counted - the same answer as an absent block.
    expect(scan.hooks).toEqual([]);
    clean();
  });

  it("ignores non-scalar env values rather than stringifying them", () => {
    const { home, repo, clean } = sandbox();
    write(repo, ".claude/settings.json", { env: { GOOD: "1", BAD: { nested: true } } });

    const scan = new SettingsScanner({}, home).scan(repo, ORIGIN);

    expect(scan.env.GOOD!.value).toBe("1");
    expect(scan.env.BAD, "[object Object] would be an invented measurement").toBeUndefined();
    clean();
  });
  /**
   * The escape hatch, and the reason it exists.
   *
   * This server and Claude Code are different processes. `CLAUDE_CONFIG_DIR`
   * exported in a shell profile reaches the terminal Claude Code runs in and
   * not a dev server started from somewhere else, so a machine that is plainly
   * configured can report no user settings at all. A reader looking straight
   * at the file has better information than our environment does.
   */
  it("reads a nominated user-settings file instead of the usual one", () => {
    const { home, repo, clean } = sandbox();
    write(home, ".claude/settings.json", { env: { OTEL_LOGS_EXPORTER: "console" } });
    write(home, "elsewhere/settings.json", { env: { OTEL_LOGS_EXPORTER: "otlp" } });

    const nominated = join(home, "elsewhere/settings.json");
    const scan = new SettingsScanner({}, home, nominated).scan(repo, ORIGIN);

    expect(scan.env.OTEL_LOGS_EXPORTER!.value, "the nominated file wins").toBe("otlp");
    expect(scan.env.OTEL_LOGS_EXPORTER!.layer, "and is still user scope").toBe("user");
    expect(scan.userSettings).toMatchObject({
      path: "~/elsewhere/settings.json",
      source: "nominated",
      exists: true,
      // Populated even while overridden: it is what the page's way back offers.
      fallback: "~/.claude/settings.json",
      problem: null,
    });
    clean();
  });

  it("lets a nominated file outrank CLAUDE_CONFIG_DIR", () => {
    const { home, repo, clean } = sandbox();
    write(home, "cfg/settings.json", { env: { OTEL_LOGS_EXPORTER: "console" } });
    write(home, "elsewhere/settings.json", { env: { OTEL_LOGS_EXPORTER: "otlp" } });

    const scan = new SettingsScanner(
      { CLAUDE_CONFIG_DIR: join(home, "cfg") },
      home,
      join(home, "elsewhere/settings.json"),
    ).scan(repo, ORIGIN);

    expect(scan.env.OTEL_LOGS_EXPORTER!.value).toBe("otlp");
    expect(scan.userSettings.source).toBe("nominated");
    clean();
  });

  /**
   * Both are things a reader hands over when asked where their settings are:
   * one is what they would type, the other is what copying a path out of a
   * file manager gives them. Rejecting the directory rejects a correct answer.
   */
  it("accepts the directory holding the file as well as the file", () => {
    const { home, repo, clean } = sandbox();
    write(home, "elsewhere/settings.json", { env: { OTEL_LOGS_EXPORTER: "otlp" } });

    const scan = new SettingsScanner({}, home, join(home, "elsewhere")).scan(repo, ORIGIN);

    expect(scan.env.OTEL_LOGS_EXPORTER!.value).toBe("otlp");
    expect(scan.userSettings.path).toBe("~/elsewhere/settings.json");
    clean();
  });

  /**
   * A nominated path that does not resolve must not take the page down with
   * it. The project's own layers are still real evidence, and an absence here
   * has to say what was tried - a control whose failure is silent is a control
   * the reader cannot correct.
   */
  it("explains a nominated path that does not resolve, and reads on", () => {
    const { home, repo, clean } = sandbox();
    write(repo, ".claude/settings.json", { env: { OTEL_LOGS_EXPORTER: "otlp" } });

    const scan = new SettingsScanner({}, home, join(home, "typo/settings.json")).scan(repo, ORIGIN);

    expect(scan.userSettings.exists).toBe(false);
    expect(scan.userSettings.problem).toContain("~/typo/settings.json does not exist");
    expect(scan.env.OTEL_LOGS_EXPORTER!.layer, "the project layers still answered").toBe("project");
    clean();
  });

  it("says so when a nominated directory holds no settings.json", () => {
    const { home, repo, clean } = sandbox();
    mkdirSync(join(home, "empty"), { recursive: true });

    const scan = new SettingsScanner({}, home, join(home, "empty")).scan(repo, ORIGIN);

    expect(scan.userSettings.exists).toBe(false);
    // Names both what was asked for and what was looked for, because the two
    // differ and the reader typed only one of them.
    expect(scan.userSettings.problem).toBe(
      "~/empty is a directory with no settings.json in it, so ~/empty/settings.json was not found.",
    );
    clean();
  });

  /** With nothing nominated, nothing about the old resolution changed. */
  it("reports the usual location, and which rule chose it", () => {
    const { home, repo, clean } = sandbox();
    write(home, ".claude/settings.json", { env: { OTEL_LOGS_EXPORTER: "otlp" } });

    expect(new SettingsScanner({}, home).scan(repo, ORIGIN).userSettings).toMatchObject({
      path: "~/.claude/settings.json",
      source: "home",
      exists: true,
      problem: null,
    });

    write(home, "cfg/settings.json", { env: { OTEL_LOGS_EXPORTER: "otlp" } });
    expect(
      new SettingsScanner({ CLAUDE_CONFIG_DIR: join(home, "cfg") }, home).scan(repo, ORIGIN)
        .userSettings,
    ).toMatchObject({ path: "~/cfg/settings.json", source: "config-dir", exists: true });

    // The absence the whole control exists for: the usual place, and nothing in it.
    const { home: bare, repo: bareRepo, clean: cleanBare } = sandbox();
    expect(new SettingsScanner({}, bare).scan(bareRepo, ORIGIN).userSettings).toMatchObject({
      path: "~/.claude/settings.json",
      source: "home",
      exists: false,
      problem: null,
    });
    cleanBare();
    clean();
  });
});
