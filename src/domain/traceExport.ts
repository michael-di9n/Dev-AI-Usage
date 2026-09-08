/**
 * One session's trace, as a structured document.
 *
 * Pure, and separate from `traceTree.ts` because it has a different reason to
 * change: that file decides what the shape of a run is, this one decides what
 * a file written out of it promises to whoever reads it next. A field renamed
 * here breaks somebody's script; a field renamed there breaks a page.
 *
 * `format` and `version` are the whole reason this is not `JSON.stringify(tree)`.
 * An export with no name and no version is a shape nobody can write a reader
 * for without guessing, and the first change to the tree silently breaks them.
 */

import type { TraceNode, TraceTree } from "./traceTree";

export const TRACE_FORMAT = "dev-ai-usage.trace";
export const TRACE_FORMAT_VERSION = 1;

export interface ExportedSession {
  id: string;
  /** Absolute, because an export is read off this machine by its owner. */
  projectPath: string | null;
  startedAt: string;
  endedAt: string;
  /** Captured content blocks, which is what the page counts. */
  blocks: number;
}

export interface ExportedNode {
  id: string;
  kind: string;
  label: string;
  /** Null when the only timestamp available was the epoch fallback. */
  at: string | null;
  /**
   * Null means nothing measured this call. It is never 0 for "unknown", and a
   * reader that coalesces it to 0 is inventing a measurement - which is the
   * one thing this whole tool exists not to do.
   */
  durationMs: number | null;
  durationFrom: "otel" | "hook" | null;
  /** The captured text, already capped. Null when this kind carries none. */
  body: string | null;
  /** True length before capping, so a reader knows what it is missing. */
  charLen: number | null;
  /** True when `body` is shorter than `charLen`. Stated, not left to be derived. */
  truncated: boolean;
  /** Order-preserving, because two facts may share a label. */
  facts: { label: string; value: string }[];
  children: ExportedNode[];
}

export interface TraceExport {
  format: typeof TRACE_FORMAT;
  version: typeof TRACE_FORMAT_VERSION;
  exportedAt: string;
  session: ExportedSession;
  summary: {
    spansJoined: number;
    /** Spans that matched no transcript row. Carried, never silently dropped. */
    unjoinedSpans: number;
    truncatedRows: number;
    thinkingRows: number;
    everyDurationMissing: boolean;
  };
  /** The spans nothing claimed, so work that happened does not vanish. */
  unjoined: { name: string; durationMs: number | null }[];
  run: ExportedNode[];
}

export function traceExport(
  session: ExportedSession,
  tree: TraceTree,
  now: Date = new Date(),
): TraceExport {
  return {
    format: TRACE_FORMAT,
    version: TRACE_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    session,
    summary: {
      spansJoined: tree.spansJoined,
      unjoinedSpans: tree.unjoined.length,
      truncatedRows: tree.truncated,
      thinkingRows: tree.thinkingRows,
      everyDurationMissing: tree.everyDurationMissing,
    },
    unjoined: tree.unjoined,
    run: tree.roots.map(exportNode),
  };
}

function exportNode(node: TraceNode): ExportedNode {
  return {
    id: node.id,
    kind: node.kind,
    label: node.label,
    at: node.at,
    durationMs: node.durationMs,
    durationFrom: node.durationFrom,
    body: node.body,
    charLen: node.charLen,
    truncated: node.charLen !== null && node.charLen > (node.body?.length ?? 0),
    facts: node.facts.map(([label, value]) => ({ label, value })),
    children: node.children.map(exportNode),
  };
}

/**
 * A filename someone can find again in a downloads folder.
 *
 * The session id is the handle the trace page shows, so it is what the file is
 * named by - a name built from the project alone would collide the moment a
 * reader exported two runs of the same project, which is the case the run list
 * exists to make easy.
 */
export const traceFilename = (sessionId: string, endedAt: string): string =>
  `trace-${endedAt.slice(0, 10)}-${sessionId.slice(0, 8)}.json`;

// ---------------------------------------------------------------------------
// Many runs, as one file
// ---------------------------------------------------------------------------

export const ARCHIVE_FORMAT = "dev-ai-usage.traces";
export const ARCHIVE_FORMAT_VERSION = 1;

/**
 * The head of an export-all document: what it is, and what it covers.
 *
 * Its own format name rather than a `TraceExport` with an array in it, because
 * a reader written for one run must not silently accept a file of many and
 * report on the first. Two shapes, two names, and a version each.
 *
 * `scope` is the whole point. An export of "everything" that does not say what
 * everything meant is unreadable six months later: the same button gives a
 * different file depending on which project was selected and what the date
 * filter was set to, and nothing inside the file would otherwise record which.
 */
export interface TraceArchiveHead {
  format: typeof ARCHIVE_FORMAT;
  version: typeof ARCHIVE_FORMAT_VERSION;
  exportedAt: string;
  scope: {
    /** Null when the runs' project was never recorded. */
    projectPath: string | null;
    projectName: string;
    /** The date filter as it stood, both ends nullable, and in words. */
    from: string | null;
    to: string | null;
    described: string;
    /** Runs in the file, and what the project has before the filter. */
    runs: number;
    runsInProject: number;
  };
}

export function traceArchiveHead(
  scope: TraceArchiveHead["scope"],
  now: Date = new Date(),
): TraceArchiveHead {
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    scope,
  };
}

/**
 * A filename for a file of many runs.
 *
 * Named for the project and the day it was taken, because that is what
 * distinguishes two of these in a downloads folder - the session id that names
 * a single run has no meaning here, and using the first run's would be a name
 * that lies about the contents.
 */
export const archiveFilename = (projectName: string, now: Date = new Date()): string => {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `traces-${slug || "project"}-${now.toISOString().slice(0, 10)}.json`;
};
