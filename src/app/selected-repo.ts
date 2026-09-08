import { existsSync, statSync } from "node:fs";
import { app } from "./dashboard";
import { SELECTED_REPO } from "./repo-key";

/**
 * Which repository the two scanning pages are looking at.
 *
 * Extracted from `readiness.ts` when Observability became the second page to
 * ask. Both pages resolve the same stored choice the same way and both have to
 * explain the same failures - a repository moved since the transcript that
 * named it was written - so the resolution lives once and the two views differ
 * only in what they then scan.
 */

export interface PickableProject {
  path: string;
  sessions: number;
  exists: boolean;
}

export interface RepoChoice {
  /** Null only when nothing on this machine can be scanned. */
  path: string | null;
  /** Set when a stored choice no longer resolves, so the page can say why. */
  problem: string | null;
  projects: PickableProject[];
}

/**
 * The stored choice, or the busiest project when there is none.
 *
 * With nothing stored, both pages scan rather than showing a picker and
 * waiting. The whole answer on either page is a scan, a scan costs a
 * millisecond and writes nothing, and the paths on offer come from the
 * reader's own transcripts - so an empty page here was a click charged for no
 * decision. The picker stays at the top either way.
 */
export function selectedRepo(): RepoChoice {
  const projects = pickableProjects();
  const stored = app().queries.readState(SELECTED_REPO);
  const path = stored || projects.find((p) => p.exists)?.path || null;

  if (!path) return { path: null, problem: null, projects };
  return { path, problem: pathProblem(path), projects };
}

/** Candidates for the picker, plus whether each still exists on disk. */
export function pickableProjects(): PickableProject[] {
  return app()
    .queries.knownProjects()
    .map((p) => ({ path: p.path, sessions: p.sessions, exists: existsSync(p.path) }));
}

/**
 * Says what is wrong with a stored path, in a sentence.
 *
 * A repository that has been moved or deleted is the ordinary case here - these
 * paths come from transcripts that may be months old - so it has to produce an
 * explanation and a way back to the picker, never an empty page.
 */
export function pathProblem(path: string): string | null {
  if (!existsSync(path)) {
    return `${path} no longer exists. It may have been moved or deleted since Claude Code last ran there.`;
  }
  try {
    if (!statSync(path).isDirectory()) return `${path} is a file, not a directory.`;
  } catch {
    return `${path} could not be read. Check the permissions on it.`;
  }
  return null;
}
