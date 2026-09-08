import type { Detector } from "../Detector";
import {
  hookExtras,
  hygieneFindings,
  instrumentationBand,
  metCount,
  requirementCells,
  tierComplete,
  tracingIsOn,
  TIERS,
  type SettingsScan,
} from "../../domain/instrumentation";
import type { Signal } from "../../domain/types";

/**
 * The instrumentation rule family: is this machine configured to produce an
 * in-depth trace, and if not, which line is missing.
 *
 * Its context is a `SettingsScan` rather than a `RepoScan`, which is exactly
 * the case `Detector` is generic for. Everything else follows the readiness
 * family: a rule is a class, adding one means adding it to the array below,
 * and nothing here writes.
 */
export type InstrumentationDetector = Detector<SettingsScan>;

const signal = (
  kind: string,
  severity: Signal["severity"],
  scan: SettingsScan,
  evidence: Record<string, unknown>,
): Signal => ({
  kind,
  severity,
  scope: "project",
  scopeId: scan.root,
  date: scan.scannedAt.slice(0, 10),
  evidence,
});

/**
 * One signal per requirement, including the ones that are not met.
 *
 * Absences are emitted rather than skipped for the same reason
 * `CapabilityPresenceRule` emits them: a requirement nobody has set is the
 * finding, and a family that reported only what was already true would have
 * nothing to say to the reader who most needs it.
 */
export class RequirementRule implements InstrumentationDetector {
  readonly kind = "instrumentation.requirement";
  readonly explanation =
    "Whether one setting an in-depth trace needs is present and correct, where it was read from, and the line to add or change if not.";

  detect(scan: SettingsScan): Signal[] {
    return requirementCells(scan).map((cell) =>
      signal(this.kind, SEVERITY[cell.state], scan, {
        key: cell.key,
        tier: cell.tier,
        label: cell.label,
        state: cell.state,
        found: cell.found,
        source: cell.source,
        finding: cell.finding,
        fix: cell.fix,
      }),
    );
  }
}

/** A wrong value is worse than a missing one: it looks configured and is not. */
const SEVERITY = { met: "info", missing: "warn", wrong: "high" } as const;

/**
 * The page's headline: which tier was reached, and whether tracing is on.
 *
 * `tracingOn` is stated as its own fact rather than left to be inferred from
 * the band, because it is the one thing on this page a reader acts on. It is
 * tiers 1 and 2 - a trace with spans and no PostToolUse hook is still a trace
 * with real durations in it.
 */
export class TierRule implements InstrumentationDetector {
  readonly kind = "instrumentation.tier";
  readonly explanation =
    "How far up the three tiers this configuration reached: events and metrics, then spans, then tool wall-clock. Tracing is on once the first two are complete.";

  detect(scan: SettingsScan): Signal[] {
    const cells = requirementCells(scan);
    const complete = ([1, 2, 3] as const).filter((tier) => tierComplete(cells, tier));

    return [
      signal(this.kind, tracingIsOn(cells) ? "info" : "warn", scan, {
        band: instrumentationBand(cells),
        tracingOn: tracingIsOn(cells),
        met: metCount(cells),
        total: cells.length,
        tiersComplete: complete,
        tiersRemaining: ([1, 2, 3] as const)
          .filter((tier) => !complete.includes(tier))
          .map((tier) => `${tier}. ${TIERS[tier].name} — ${TIERS[tier].unlocks}`),
      }),
    ];
  }
}

/**
 * Settings that are supported by Claude Code and break something here.
 *
 * Always `high`, and deliberately separate from the requirements: these are not
 * gaps to fill but lines to remove, and they never move the band. Emits nothing
 * when there is nothing wrong, which is the ordinary case.
 */
export class HarmfulSettingRule implements InstrumentationDetector {
  readonly kind = "instrumentation.harmful";
  readonly explanation =
    "A setting that is valid for Claude Code but breaks something this receiver depends on, and what it breaks.";

  detect(scan: SettingsScan): Signal[] {
    return hygieneFindings(scan).map((finding) =>
      signal(this.kind, "high", scan, { ...finding }),
    );
  }
}

/**
 * The four handlers beyond PostToolUse.
 *
 * Reported, never banded. Each adds something real, and none of them is needed
 * for a trace to carry durations - folding them into the tier would move the
 * gate for a reason that has nothing to do with tracing.
 */
export class HookCoverageRule implements InstrumentationDetector {
  readonly kind = "instrumentation.hooks";
  readonly explanation =
    "The lifecycle hooks beyond PostToolUse. Each records something no other source has, but none of them is required for a trace to have durations in it.";

  detect(scan: SettingsScan): Signal[] {
    // Always info, registered or not. These are extras by definition, and a
    // warning about an optional handler would compete with the warnings about
    // the requirements that actually gate the page.
    return hookExtras(scan).map((extra) => signal(this.kind, "info", scan, { ...extra }));
  }
}

/**
 * Which settings files were read, which could not be, and which was skipped.
 *
 * The last of those is the point. When `CLAUDE_CONFIG_DIR` is set, a populated
 * `~/.claude/settings.json` is never loaded, and a reader who edited it sees a
 * valid file and no effect. That is the likeliest reason this page reads
 * unconfigured for someone who is sure they configured it, so it is a finding
 * rather than a footnote.
 */
export class SettingsLayerRule implements InstrumentationDetector {
  readonly kind = "instrumentation.settings";
  readonly explanation =
    "The settings files this scan read, in precedence order, and any that exist but are not being read.";

  detect(scan: SettingsScan): Signal[] {
    const out: Signal[] = scan.files.map((file) =>
      signal(this.kind, file.problem ? "high" : "info", scan, {
        layer: file.layer,
        path: file.path,
        exists: file.exists,
        problem: file.problem,
      }),
    );

    if (scan.ignoredUserFile) {
      out.push(
        signal(this.kind, "warn", scan, {
          layer: "user",
          path: scan.ignoredUserFile,
          exists: true,
          problem:
            "exists but is never read, because CLAUDE_CONFIG_DIR points somewhere else. A setting added here is valid and has no effect.",
        }),
      );
    }
    return out;
  }
}

export const ALL_INSTRUMENTATION_DETECTORS: InstrumentationDetector[] = [
  new TierRule(),
  new RequirementRule(),
  new HarmfulSettingRule(),
  new HookCoverageRule(),
  new SettingsLayerRule(),
];

export function runInstrumentation(scan: SettingsScan): Signal[] {
  return ALL_INSTRUMENTATION_DETECTORS.flatMap((d) => d.detect(scan));
}
