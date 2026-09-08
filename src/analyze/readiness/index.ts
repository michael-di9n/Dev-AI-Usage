import type { Signal } from "../../domain/types";
import {
  CAPABILITIES,
  CAPABILITY_LABELS,
  MIN_DESCRIPTION,
  capabilityBand,
  definitionFilesOf,
  filesOf,
  maturityBand,
  maturityCount,
  maturityScore,
  presenceOf,
  saysWhenToUse,
  type ArtefactFile,
  type RepoScan,
} from "../../domain/readiness";
import type { Detector } from "../Detector";

/**
 * The readiness rule family: `Detector<RepoScan>`.
 *
 * Two levels, and the split is deliberate. Presence rules answer "is this
 * configured", which is a file-exists question anyone can verify. Quality rules
 * answer "does the configuration have the parts that make it work", which is
 * still arithmetic over a file - a description length, an example count - and
 * still checkable by hand. Neither asks a model anything. The model comes later,
 * behind a button, and it judges; it never counts.
 */
export type ReadinessDetector = Detector<RepoScan>;

const signal = (
  kind: string,
  severity: Signal["severity"],
  scan: RepoScan,
  evidence: Record<string, unknown>,
): Signal => ({
  kind,
  severity,
  scope: "project",
  scopeId: scan.root,
  date: scan.scannedAt.slice(0, 10),
  evidence,
});

// ---------------------------------------------------------------------------
// Level 1 - what exists
// ---------------------------------------------------------------------------

/**
 * One signal per capability, present or not.
 *
 * Emitting a signal for an absence is the point. A capability that is simply
 * missing from the output looks like a capability nobody checked, and the UI
 * could not then say what it looked for.
 */
export class CapabilityPresenceRule implements ReadinessDetector {
  readonly kind = "readiness.capability";
  readonly explanation =
    "Whether the repository configures this part of Claude Code, and which files were found.";

  detect(scan: RepoScan): Signal[] {
    return CAPABILITIES.map((capability) => {
      const p = presenceOf(scan, capability);
      return signal(this.kind, p.present ? "info" : "warn", scan, {
        capability,
        label: CAPABILITY_LABELS[capability].label,
        what: CAPABILITY_LABELS[capability].what,
        present: p.present,
        fileCount: p.files.length,
        files: p.files.map((f) => f.path),
        lookedFor: p.lookedFor,
        lastModified: latest(p.files),
      });
    });
  }
}

/**
 * The headline: how many of the eight, which band each one is in, and a word
 * for the average.
 *
 * The count and the overall band answer different questions and both are
 * kept. The count is checkable by looking in the repository; the average is
 * not, which is why `bands` carries the per-capability figures it was
 * averaged from, each with the instance count that decided it.
 */
export class MaturityRule implements ReadinessDetector {
  readonly kind = "readiness.maturity";
  readonly explanation =
    "How many of the eight capabilities are configured, and what band each one is in: 1 instance is bronze, 2-3 silver, 4 or more gold - and for hooks, whose unit is a matcher rather than a file, 3, 6 and 8. A description of what is there, not a grade.";

  detect(scan: RepoScan): Signal[] {
    const count = maturityCount(scan);
    const score = maturityScore(scan);
    return [
      signal(this.kind, "info", scan, {
        count,
        total: CAPABILITIES.length,
        score: Number(score.toFixed(4)),
        bands: Object.fromEntries(
          CAPABILITIES.map((capability) => {
            // The rule comes along, because a capability can now be
            // configured and still be short of its first band - "none — 2
            // handlers" is not a contradiction, it is 2 against a minimum of
            // 3, and the evidence has to carry the 3.
            const { name, measured, rule } = capabilityBand(scan, capability);
            return [capability, `${name} — ${measured} (${rule})`];
          }),
        ),
        band: maturityBand(score),
        configured: scan.capabilities.filter((c) => c.present).map((c) => c.capability),
        missing: scan.capabilities.filter((c) => !c.present).map((c) => c.capability),
        filesSeen: scan.filesSeen,
        truncated: scan.truncated,
      }),
    ];
  }
}

// ---------------------------------------------------------------------------
// Level 2 - static quality of what exists
// ---------------------------------------------------------------------------

/**
 * A skill or agent is selected by its description, so the description is the
 * load-bearing part of the file. The threshold lives in the domain, because
 * the cell prints the same figure and two copies of the number is how the
 * page and the signals behind it drift apart.
 */
export class DescriptionQualityRule implements ReadinessDetector {
  readonly kind = "readiness.description";
  readonly explanation =
    "Skills, commands and subagents are chosen by their description, so a thin description is why one never fires.";

  detect(scan: RepoScan): Signal[] {
    const out: Signal[] = [];
    for (const capability of ["skills", "agents"] as const) {
      for (const file of definitionFilesOf(scan, capability)) {
        const description = file.frontmatter.description ?? "";
        const name = file.frontmatter.name ?? "";
        const thin = description.length < MIN_DESCRIPTION;
        out.push(
          signal(this.kind, thin ? "warn" : "info", scan, {
            capability,
            path: file.path,
            name,
            hasFrontmatter: Object.keys(file.frontmatter).length > 0,
            hasName: name.length > 0,
            descriptionChars: description.length,
            thinDescription: thin,
            // Only agents use <example>; for skills this reads as 0 and is not
            // held against them.
            examples: file.examples,
            saysWhen: saysWhenToUse(description),
            lastModified: file.modified,
          }),
        );
      }
    }
    return out;
  }
}

/**
 * Memory is read on every single run, so its size is a recurring cost and its
 * structure is what makes it followable. Both bounds are stated in the evidence
 * rather than hidden in a pass/fail.
 */
export class MemoryQualityRule implements ReadinessDetector {
  readonly kind = "readiness.memory";
  readonly explanation =
    "CLAUDE.md is re-read on every run, so its length is a cost paid repeatedly and its headings are what make it followable.";

  detect(scan: RepoScan): Signal[] {
    return filesOf(scan, "memory").map((file) =>
      signal(this.kind, file.lines < 10 || file.bytes > 20_000 ? "warn" : "info", scan, {
        path: file.path,
        lines: file.lines,
        bytes: file.bytes,
        headings: file.headings,
        codeBlocks: file.codeBlocks,
        // An @-import pulls another file in on every run too, so it is part of
        // the same recurring cost.
        imports: /^@\S+/m.test(file.frontmatter.__raw ?? "") ? 1 : 0,
        veryShort: file.lines < 10,
        veryLong: file.bytes > 20_000,
        lastModified: file.modified,
      }),
    );
  }
}

/** How much surface the tool config exposes, which is worth seeing in one place. */
export class ToolSurfaceRule implements ReadinessDetector {
  readonly kind = "readiness.tools";
  readonly explanation =
    "MCP servers and hooks both run outside the model's sandbox, so how many there are is worth stating plainly.";

  detect(scan: RepoScan): Signal[] {
    const out: Signal[] = [];
    for (const file of filesOf(scan, "mcp")) {
      const servers = Number(file.frontmatter.__serverCount ?? 0);
      if (servers > 0) {
        out.push(signal(this.kind, "info", scan, {
          capability: "mcp", path: file.path, servers, lastModified: file.modified,
        }));
      }
    }
    for (const file of filesOf(scan, "hooks")) {
      const events = Number(file.frontmatter.__hookEvents ?? 0);
      if (events > 0) {
        // Both figures, because they answer different questions: how much of
        // the lifecycle is handled, and how many things are wired up under it.
        // The second is what the band counts.
        out.push(signal(this.kind, "info", scan, {
          capability: "hooks",
          path: file.path,
          events,
          handlers: Number(file.frontmatter.__hookMatchers ?? 0),
          lastModified: file.modified,
        }));
      }
    }
    return out;
  }
}

/**
 * Configuration rots quietly. A skill nobody has touched in a year is not
 * necessarily wrong, but it is worth seeing next to one edited yesterday, and
 * it is what the report's date filter is for.
 */
export class StalenessRule implements ReadinessDetector {
  readonly kind = "readiness.staleness";
  readonly explanation =
    "When each part of the configuration was last edited, so a file nobody has touched is visible beside one in active use.";

  detect(scan: RepoScan): Signal[] {
    const all = scan.capabilities.flatMap((c) => c.files);
    if (all.length === 0) return [];
    const newest = latest(all);
    const oldest = all.reduce((a, b) => (a.modified < b.modified ? a : b));
    return [
      signal(this.kind, "info", scan, {
        fileCount: all.length,
        newest,
        oldestPath: oldest.path,
        oldestModified: oldest.modified,
      }),
    ];
  }
}

/**
 * The registry. Adding a rule is a class plus one line here, and nothing else
 * changes - which is the whole reason detect() returns signals instead of
 * writing them.
 */
export const ALL_READINESS_DETECTORS: ReadinessDetector[] = [
  new MaturityRule(),
  new CapabilityPresenceRule(),
  new MemoryQualityRule(),
  new DescriptionQualityRule(),
  new ToolSurfaceRule(),
  new StalenessRule(),
];

export function runReadiness(scan: RepoScan): Signal[] {
  return ALL_READINESS_DETECTORS.flatMap((d) => d.detect(scan));
}

const latest = (files: ArtefactFile[]): string | null =>
  files.length === 0 ? null : files.reduce((a, b) => (a.modified > b.modified ? a : b)).modified;
