import {
  instrumentationBand,
  requirementCells,
  tiersComplete,
  tracingIsOn,
} from "../domain/instrumentation";
import {
  MATURITY_TONE,
  maturityBand,
  maturityCount,
  maturityScore,
  type MaturityBand,
} from "../domain/readiness";
import { RepoScanner } from "../ingest/repo/RepoScanner";
import { SettingsScanner } from "../ingest/settings/SettingsScanner";
import { selectedRepo } from "./selected-repo";

/**
 * The two standings that belong to other tabs, read for the Trends page.
 *
 * Trends already carries one of these - the usage band, which ranks how much
 * work this machine does. The other two answer questions of the same shape
 * about the same setup, and a reader who never opens the other tabs had no way
 * to know either had an answer. Three readings side by side is also the first
 * place they can be compared: a machine doing power-user volume with nothing
 * configured is a different situation from the same volume fully instrumented,
 * and neither page could say so alone.
 *
 * Both are scans of the selected repository, and both are cheap - a repo scan
 * measured 1-2ms and a settings scan is three small file reads - so they are
 * taken per render like the pages they come from. Null when nothing can be
 * scanned, which renders as a standing that says so rather than as a figure
 * invented out of nothing.
 */
export interface Standing {
  /** The project these were read from, for the description to name. */
  project: string;
  band: MaturityBand;
  tone: (typeof MATURITY_TONE)[MaturityBand];
  /** The headline word. */
  label: string;
  /** The arithmetic behind it, so the word is checkable. */
  measured: string;
  /** One line saying what the reading is of. */
  what: string;
  href: string;
}

export interface Standings {
  maturity: Standing | null;
  observability: Standing | null;
  /** Why both are missing, when they are. Never an empty row with no reason. */
  problem: string | null;
}

export function standings(receiverOrigin: string): Standings {
  const { path, problem } = selectedRepo();
  if (!path || problem) {
    return {
      maturity: null,
      observability: null,
      problem:
        problem ??
        "No project to scan yet — these read a repository's configuration files, and none has been chosen.",
    };
  }

  return {
    maturity: maturityStanding(path),
    observability: observabilityStanding(path, receiverOrigin),
    problem: null,
  };
}

function maturityStanding(root: string): Standing {
  const scan = new RepoScanner().scan(root);
  const band = maturityBand(maturityScore(scan));
  const count = maturityCount(scan);

  return {
    project: scan.name,
    band,
    tone: MATURITY_TONE[band],
    /* Capitalised here rather than with `text-transform`, which would also
       have turned the observability standing's "Tracing off" into "Tracing
       Off". One of these is a single word and the other is a sentence. */
    label: band[0]!.toUpperCase() + band.slice(1),
    measured: `${count} of ${scan.capabilities.length} configured`,
    what: "How much of Claude Code this repository configures.",
    href: "/static",
  };
}

function observabilityStanding(root: string, receiverOrigin: string): Standing {
  const scan = new SettingsScanner().scan(root, receiverOrigin);
  const cells = requirementCells(scan);
  const band = instrumentationBand(cells);
  const on = tracingIsOn(cells);

  /*
   * The headline is the gate, not the band. On the readiness page the two sit
   * together and the band explains the metal; here there is room for one word,
   * and "tracing on" is the one a reader acts on. The band is still what the
   * tone is read off, so the colour is never saying something the words do not.
   */
  return {
    project: scan.name,
    band,
    tone: MATURITY_TONE[band],
    label: on ? "Tracing on" : "Tracing off",
    measured: `${tiersComplete(cells)} of 3 tiers complete`,
    what: "Whether this machine can record an in-depth trace.",
    href: "/observability",
  };
}

