import { basename } from "node:path";
import { costSplit, type CostSplit, type ModelUsageRow } from "../domain/costSplit";
import { DEFAULT_BANDS, parseBands, type RunBands } from "../domain/runBands";
import { DEFAULT_ORDER, parseOrder, sortRuns, type RunOrder } from "../domain/runOrder";
import { NO_RANGE, describeRange, parseRange, runsInRange, type DateRange } from "../domain/traceDates";
import { buildPath, freshSteps, pathStepsOf, type TracePath } from "../domain/tracePath";
import { buildTrace, type TraceTree, capTree, traceRowsOf } from "../domain/traceTree";
import type { SessionUsageRow, TraceableSession } from "../db/QueryRepository";
import { sync } from "./background-sync";
import { app } from "./dashboard";
import { SELECTED_REPO } from "./repo-key";
import {
  SELECTED_SESSION,
  TRACE_OTEL_ONLY,
  TRACE_PATH_STEPS,
  TRACE_ROW_LIMIT, TRACE_RUNS_OPEN, TRACE_RUNS_ORDER, TRACE_RUNS_RANGE, TRACE_RUN_BANDS,
} from "./trace-key";

/**
 * What the trace page needs, assembled in one place.
 *
 * The page stays presentational and this decides everything: which project is
 * scoped, which of its runs is being shown, whether the stored choices still
 * resolve, and what the two charts are drawn from. Same split as
 * `readiness.ts`.
 */

/**
 * How many recorded runs the picker offers.
 *
 * Well above what any project has, because the list is filtered to one project
 * now and a cap that bit would silently hide a project's older runs - which is
 * the one thing the run list exists to show. Exported because
 * `/api/trace/[sessionId]` has to agree about which sessions exist, or the
 * export button on a visible row 404s.
 */
export const TRACEABLE_LIMIT = 500;

/** One project that has at least one run with captured trace text. */
export interface TraceProject {
  /** Null for sessions whose project was never recorded. */
  path: string | null;
  /** What the picker shows: the last segment, or a stated unknown. */
  name: string;
  runs: number;
}

/** What the badge above the tree and the attribution chart both read. */
export interface RunCost {
  split: CostSplit;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface TraceView {
  projects: TraceProject[];
  /** The project scoped, or null when nothing can be scoped. */
  project: TraceProject | null;
  /** That project's runs, newest first. The list on the left. */
  sessions: TraceableSession[];
  selected: TraceableSession | null;
  tree: TraceTree | null;
  /**
   * How much of that tree the page draws, and how much there is.
   *
   * Both stated so the page can say "500 of 47,628 rows". A row not drawn is a
   * row we chose to hold back, never a row that does not exist, and the only
   * way to keep those apart on screen is to print both numbers.
   */
  rows: { shown: number; total: number };
  /**
   * The same run as one line of steps, or null when no run is selected.
   *
   * Built from the WHOLE tree, deliberately, while `tree` above it is capped.
   * A summary of the first 500 of 47,628 rows would be a summary of the scroll
   * position - it would say "62 steps" about a run that took six hundred - and
   * the strip says so on its own caption.
   */
  path: TracePath | null;
  /**
   * How many of the drawn steps arrived with the last `+N more`.
   *
   * The strip animates those and nothing else, so an expansion reads as new
   * steps attaching to a list rather than the whole strip redrawing.
   */
  freshSteps: number;
  /**
   * The date range the list is filtered to, and how many runs it hid.
   *
   * `total` is what the project has before filtering. A filtered list that
   * cannot say what it is a subset of lets the reader count what is on screen
   * and believe it is everything.
   */
  range: DateRange;
  total: number;
  /** Null when no run is selected. */
  cost: RunCost | null;
  /** How the run list is drawn, all three of them stored choices. */
  order: RunOrder;
  bands: RunBands;
  runsOpen: boolean;
  /** Whether the list is narrowed to runs with at least one OTEL span. */
  otelOnly: boolean;
  /**
   * Set when a stored choice no longer resolves. A sentence naming what
   * happened, never an empty page.
   */
  problem: string | null;
  /**
   * True when no session anywhere has captured text. A different state from
   * "nothing imported", and it needs a different sentence: someone with 267
   * imported sessions told to run the importer is being sent to fix the wrong
   * thing.
   */
  nothingCaptured: boolean;
}

/**
 * Which runs are in scope: one project, narrowed by the date filter.
 *
 * Exported because two things now answer for it - the page, and the export-all
 * route - and they must never disagree. "Export all" that quietly ignored the
 * filter the reader had just set would hand them a file about runs the page
 * had told them were hidden, which is worse than not offering the button.
 *
 * The route calls this rather than `traceView`, which would also build a tree
 * and price a run it has no use for.
 */
export interface ExportScope {
  project: TraceProject | null;
  range: DateRange;
  /** The project's runs inside the range, newest first unless re-sorted. */
  sessions: TraceableSession[];
  /** What the project has before the filter, so a subset can say so. */
  total: number;
}

export function exportScope(): ExportScope {
  const queries = app().queries;
  const all = queries.traceableSessions(TRACEABLE_LIMIT);
  const range = parseRange(queries.readState(TRACE_RUNS_RANGE));

  if (all.length === 0) return { project: null, range: NO_RANGE, sessions: [], total: 0 };

  const projects = projectsOf(all);
  const stored = queries.readState(SELECTED_REPO);
  const project = projects.find((p) => p.path === stored) ?? projects[0]!;

  const otelOnly = queries.readState(TRACE_OTEL_ONLY) === "true";
  const mine = all
    .filter((session) => session.projectPath === project.path)
    .filter((session) => !otelOnly || session.otelSpans > 0);
  // Filtered, then sorted - the same order as the page, so the file reads in
  // the order the list did.
  const order = parseOrder(queries.readState(TRACE_RUNS_ORDER));
  return {
    project,
    range,
    sessions: sortRuns(runsInRange(mine, range), order),
    total: mine.length,
  };
}

export function traceView(now: Date = new Date()): TraceView {
  // Not awaited - see the same call in `observability.ts`. A run just
  // finished elsewhere can already have blocks and spans on disk that this
  // page cannot show until the importer has read them in.
  void sync();

  const queries = app().queries;
  const all = queries.traceableSessions(TRACEABLE_LIMIT);
  const range = parseRange(queries.readState(TRACE_RUNS_RANGE));

  if (all.length === 0) {
    return {
      projects: [], project: null, sessions: [], selected: null, tree: null,
      rows: { shown: 0, total: 0 }, path: null, freshSteps: 0,
      range: NO_RANGE, total: 0, cost: null, problem: null,
      order: DEFAULT_ORDER, bands: DEFAULT_BANDS, runsOpen: true,
      otelOnly: queries.readState(TRACE_OTEL_ONLY) === "true",
      nothingCaptured: queries.traceBlockCount() === 0,
    };
  }

  const projects = projectsOf(all);
  const storedProject = queries.readState(SELECTED_REPO);

  /*
   * The stored project only scopes this page if it actually has a trace. A
   * project chosen on AI maturity - which offers any directory on disk -
   * usually does not, and silently showing another project's runs under its
   * name would be worse than saying so.
   */
  const match = projects.find((p) => p.path === storedProject) ?? null;
  const project = match ?? projects[0]!;
  const wrongProject =
    storedProject && !match
      ? `${basename(storedProject) || storedProject} has no recorded trace, so this is showing ${project.name} instead. Trace text is only kept for transcripts still on disk when they were read.`
      : null;

  /*
   * Ordered by the reader's stored choice, not by the query's. The query hands
   * them over newest first, which is the default and also the tie-break: a
   * stable sort on equal costs leaves them in the order they arrived.
   */
  const order = parseOrder(queries.readState(TRACE_RUNS_ORDER));
  const otelOnly = queries.readState(TRACE_OTEL_ONLY) === "true";
  const byProject = all.filter((s) => s.projectPath === project.path);
  const mine = byProject.filter((s) => !otelOnly || s.otelSpans > 0);
  // Filtered, then sorted. The other way round sorts rows that are about to be
  // thrown away, which is the same answer and more of it.
  const sessions = sortRuns(runsInRange(mine, range), order);
  const storedSession = queries.readState(SELECTED_SESSION);
  const chosen = storedSession ? sessions.find((s) => s.sessionId === storedSession) ?? null : null;

  /*
   * With nothing stored, open the run at the top of the list rather than an
   * empty frame. The reader opened a trace viewer; something has to be in it,
   * and the list is right beside it.
   *
   * The top of the list, not the newest run - and those stopped being the same
   * thing when the columns became sortable. Sorting by cost and landing on the
   * dearest run is the better answer, not a worse one: a reader who has just
   * ordered the list by what things cost is asking about cost. The rule is
   * "the row you are looking at first", which holds whichever column is in
   * force.
   */
  const shape = {
    projects, project, sessions, range, order,
    total: mine.length,
    bands: parseBands(queries.readState(TRACE_RUN_BANDS)),
    // Open unless it was closed. Nothing stored is a reader who has never
    // touched the control, and the list is the page's index.
    runsOpen: queries.readState(TRACE_RUNS_OPEN) !== "false",
    otelOnly,
    nothingCaptured: false,
  };

  /*
   * The filter can hide every run, and that is a real answer rather than an
   * error. There is no run to open, so there is no tree and no cost - all
   * three are null, not empty, because "no run is selected" is not the same
   * claim as "the selected run did nothing". The list says what it is filtered
   * to and the reader can widen it from the same control they narrowed it
   * with.
   */
  if (sessions.length === 0) {
    return {
      ...shape,
      selected: null,
      tree: null,
      rows: { shown: 0, total: 0 },
      path: null,
      freshSteps: 0,
      cost: null,
      problem:
        wrongProject ??
        (otelOnly && mine.length === 0
          ? `No run in ${project.name} has an OTEL span. ` +
            `${byProject.length.toLocaleString()} run${byProject.length === 1 ? " is" : "s are"} hidden by the OTEL-only filter.`
          : `No run in ${project.name} ended ${describeRange(range) ?? "in this range"}` +
            `${otelOnly ? " with an OTEL span" : ""}. ` +
            `${mine.length.toLocaleString()} run${mine.length === 1 ? " is" : "s are"} hidden by the date filter.`),
    };
  }

  const selected = chosen ?? sessions[0]!;

  const staleSession =
    storedSession && !chosen && sessions.length > 0
      ? `Session ${storedSession.slice(0, 8)} is not in this project, so its most recent run is shown instead.`
      : null;

  /*
   * Built whole, then capped for drawing. The build is cheap now - 50ms on the
   * largest run here - and the export needs every node, so the saving that
   * matters is in what gets rendered rather than in what gets built.
   */
  const full = buildTrace(queries.traceRows(selected.sessionId));
  const limited = capTree(full.roots, traceRowsOf(queries.readState(TRACE_ROW_LIMIT)));
  const capped = {
    tree: { ...full, roots: limited.roots },
    shown: limited.shown,
    total: limited.total,
  };

  /*
   * The strip gets its own budget, read from its own key. Built from the WHOLE
   * tree while the tree above it is capped - see the caption the strip prints,
   * and `buildPath`.
   */
  const path = buildPath(full.roots, pathStepsOf(queries.readState(TRACE_PATH_STEPS)));
  const pathAndFresh = { path, fresh: freshSteps(path.steps.length) };

  return {
    ...shape,
    selected,
    tree: capped.tree,
    rows: { shown: capped.shown, total: capped.total },
    path: pathAndFresh.path,
    freshSteps: pathAndFresh.fresh,
    cost: runCost(selected.sessionId),
    problem: wrongProject ?? staleSession,
  };
}

/**
 * The projects with a trace, ordered by their newest run.
 *
 * `sessions` arrives newest first and a Map keeps insertion order, so the
 * project at the top of the picker is the one worked in most recently. A
 * session whose project was never recorded gets its own entry with a stated
 * name rather than being dropped or folded into another project's - a run
 * filed under the wrong project is worse than one filed under an honest
 * unknown.
 */
function projectsOf(sessions: TraceableSession[]): TraceProject[] {
  const projects = new Map<string, TraceProject>();

  for (const session of sessions) {
    const key = session.projectPath ?? "";
    const existing = projects.get(key);
    if (existing) {
      existing.runs += 1;
      continue;
    }
    projects.set(key, {
      path: session.projectPath,
      name: session.projectPath
        ? basename(session.projectPath) || session.projectPath
        : "Project not recorded",
      runs: 1,
    });
  }

  return [...projects.values()];
}

/**
 * What one run cost, split by token class.
 *
 * Priced here rather than in SQL because the split has to come from the same
 * `costOf` that produced the totals everywhere else - see `costSplit`. The
 * tool call count comes along because the badge shows both and two queries for
 * one row of figures is two chances to disagree about which run they describe.
 */
/** One usage row in the shape `costSplit` prices. */
function toUsage(r: SessionUsageRow): ModelUsageRow {
  return {
    model: r.model,
    usage: {
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cacheReadTokens: r.cacheReadTokens,
      cacheCreate5mTokens: r.cacheCreate5mTokens,
      cacheCreate1hTokens: r.cacheCreate1hTokens,
      thinkingTokens: r.thinkingTokens,
    },
  };
}

function runCost(sessionId: string): RunCost {
  const application = app();
  const rows = application.queries.sessionUsage(sessionId);

  return {
    split: costSplit(rows.map(toUsage), application.costs),
    toolCalls: application.queries.sessionToolCalls(sessionId),
    inputTokens: rows.reduce((n, r) => n + r.inputTokens + r.cacheReadTokens, 0),
    outputTokens: rows.reduce((n, r) => n + r.outputTokens, 0),
  };
}
