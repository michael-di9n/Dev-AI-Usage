import { runInstrumentation } from "../analyze/instrumentation/index";
import type { LiveEvidence, SettingsScan } from "../domain/instrumentation";
import { TAP_LINES, tapLines, type TraceTap } from "../domain/traceTap";
import type { Signal } from "../domain/types";
import { SettingsScanner } from "../ingest/settings/SettingsScanner";
import { sync } from "./background-sync";
import { app } from "./dashboard";
import { selectedRepo, type PickableProject } from "./selected-repo";
import { USER_SETTINGS_PATH } from "./user-settings-key";

/**
 * What the Observability readiness page needs, assembled in one place.
 *
 * Two readings, kept apart on purpose.
 *
 * `scan` is the static one: what the settings files say, which a reader can
 * change by editing a file and re-loading this page. It is the band.
 *
 * `live` is what actually arrived. The two can disagree in the one direction
 * that matters, and it is the commonest confusion this page exists to clear
 * up: OpenTelemetry reads its variables at launch and never backfills, so a
 * perfectly configured machine reports nothing received until the next session
 * starts. Merging them into one verdict would make a correct configuration
 * look broken for an hour. Reporting only the static half would let the page
 * go silver while the Trace page stayed full of em dashes.
 */
export interface ObservabilityView {
  /** Null only when nothing on this machine can be scanned, or the choice broke. */
  scan: SettingsScan | null;
  signals: Signal[];
  problem: string | null;
  selectedPath: string | null;
  projects: PickableProject[];
  live: LiveEvidence;
  /**
   * What the terminus opens: the same arrival, as records rather than counts.
   *
   * Read here beside `live` and not inside it, because the two answer
   * different questions. `live` is evidence for a requirement - each figure
   * vouches for one setting, which is what the panels print. This is the
   * stream itself, and its only reader is the window on the terminus.
   */
  tap: TraceTap;
}

/**
 * Scans on every render, for the same reason `readinessView` does: it is three
 * small file reads, and a cached answer could name a settings file that has
 * since been edited.
 *
 * `receiverOrigin` is passed in rather than assumed. The port is whatever Next
 * settled on at startup - if another dev server already had 3000, this app
 * moved - so the only honest way to check that an exporter is pointed here is
 * to compare against the address this request actually arrived on.
 */
export function observabilityView(receiverOrigin: string): ObservabilityView {
  // Not awaited. A brand-new session's OTLP traffic can already be sitting
  // in `otel_event`, invisible to this page only because nothing has yet
  // linked its session to a project - see `live-bus.ts`. Firing a pass here
  // means opening this page is what closes that gap, rather than whatever
  // background timer happens to run next; `sync()` is already the timer's
  // own function; deduplicated, so this never runs two at once.
  void sync();

  const { path, problem, projects } = selectedRepo();
  const live = liveEvidence(path);
  const tap = traceTap(live, path);

  if (!path) return { scan: null, signals: [], problem: null, selectedPath: null, projects, live, tap };
  if (problem) return { scan: null, signals: [], problem, selectedPath: path, projects, live, tap };

  // The nominated user-settings file, when the reader has named one. Read here
  // rather than in the scanner: the scanner's job is to read files, and giving
  // it the database as well would be a second reason for it to change.
  const nominated = app().queries.readState(USER_SETTINGS_PATH) || null;
  const scan = new SettingsScanner(process.env, undefined, nominated).scan(path, receiverOrigin);
  return {
    scan,
    signals: runInstrumentation(scan),
    problem: null,
    selectedPath: path,
    projects,
    live,
    tap,
  };
}

/**
 * The tally and the lines, from the counts already read.
 *
 * The four counts come off `live` rather than being queried again: they are
 * the same four numbers, and asking twice is how a window ends up disagreeing
 * with the page it opened from. Only the records themselves need a query.
 */
function traceTap(live: LiveEvidence, projectPath: string | null): TraceTap {
  return {
    heard: {
      events: live.events,
      metrics: live.metrics,
      spans: live.spans,
      sessions: live.sessions,
      lastSeen: live.otelLastSeen,
    },
    lines: tapLines(app().queries.otelRecentEvents(TAP_LINES, projectPath)),
  };
}

function liveEvidence(projectPath: string | null): LiveEvidence {
  const queries = app().queries;
  const otel = queries.otelSummary(projectPath);
  const spans = queries.otelSpanSummary(projectPath);
  const tools = queries.toolDurationCoverage(projectPath);
  const content = queries.contentReceived(projectPath);

  return {
    events: otel.events,
    metrics: otel.metrics,
    sessions: otel.sessions,
    otelLastSeen: otel.lastSeen,
    spans: spans.spans,
    timedSpans: spans.timed,
    spanLastSeen: spans.lastSeen,
    toolCalls: tools.total,
    timedToolCalls: tools.timed,
    promptsWithText: content.prompts,
    repliesWithText: content.replies,
  };
}
