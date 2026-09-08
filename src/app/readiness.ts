import { RepoScanner } from "../ingest/repo/RepoScanner";
import { runReadiness } from "../analyze/readiness/index";
import type { RepoScan } from "../domain/readiness";
import type { Signal } from "../domain/types";
import { selectedRepo, type PickableProject } from "./selected-repo";

export type { PickableProject };

export interface ReadinessView {
  /** Null only when nothing on this machine can be scanned, or the choice broke. */
  scan: RepoScan | null;
  signals: Signal[];
  /** Set when a stored choice no longer resolves, so the page can say why. */
  problem: string | null;
  selectedPath: string | null;
  /** The picker's options, loaded once here rather than twice by the page. */
  projects: PickableProject[];
}

/**
 * Scans on every render rather than storing results.
 *
 * A scan of this repository measures about 2ms, and the busiest directory
 * tree on this machine 15ms, because it opens only the files that configure
 * something. It does list directory names past the root now, for the two
 * capabilities that are read from subdirectories - a monorepo's
 * `packages/api/CLAUDE.md` is loaded when work happens there, and this
 * repository turned out to have five of them the old scan never saw - which
 * is why RepoScanner caps that listing three ways. Caching the result would
 * buy a few milliseconds and would let the page show a file that has since
 * been edited, which is exactly the failure this tool exists to avoid.
 *
 * The choice itself is stored, because it is a choice: it survives leaving the
 * page and coming back, which is what makes the tab worth returning to. It is
 * resolved in `selected-repo.ts`, shared with the Observability page.
 */
export function readinessView(): ReadinessView {
  const { path, problem, projects } = selectedRepo();
  if (!path) return { scan: null, signals: [], problem: null, selectedPath: null, projects };
  if (problem) return { scan: null, signals: [], problem, selectedPath: path, projects };

  const scan = new RepoScanner().scan(path);
  return { scan, signals: runReadiness(scan), problem: null, selectedPath: path, projects };
}
