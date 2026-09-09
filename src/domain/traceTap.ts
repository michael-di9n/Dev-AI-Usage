/**
 * The tap on the trace line: what the receiver actually heard, as lines.
 *
 * The Observability pipe ends in one vessel that says whether in-depth tracing
 * is on, and until now that was the whole of the answer - a word, `on` or
 * `off`, computed from settings files. A reader who has just set seven
 * variables and wants to know whether anything is coming out of the pipe had
 * nowhere to look: the panels each report a count for the one setting they are
 * about, and the counts are the only evidence on the page that the receiver
 * exists.
 *
 * This is that evidence, shaped for a terminal rather than for prose: the last
 * few records with their attributes, in the order the query hands them over -
 * newest first, which is the one thing about it the window has to say out
 * loud. Pure - the query is in the app layer and the drawing is in the
 * component, and neither of those is the part worth testing.
 *
 * ## Why a zero here is a measurement
 *
 * The receiver is in this process, and the rows it wrote are in front of the
 * query. So `0 events` is not "we could not ask" - it is the answer, and
 * AGENTS.md is explicit that a measured zero must not be drawn as a dash.
 * What is genuinely unanswerable is narrower and `tapState` is where it is
 * decided: with nothing at all received, the honest thing on screen is not a
 * row of zeroes but a statement that the line is dry and the name of the
 * setting that would fill it.
 */

import { localTime } from "./localClock";

/** One record as the database hands it over. */
export interface TapRecord {
  ts: string;
  name: string;
  sessionId: string | null;
  /**
   * `unknown` rather than `string`, deliberately. The column is JSON and
   * `JSON.parse` is unchecked, so a number in the wire format arrives here as
   * a number however the query's return type is written. Everything that
   * reaches the screen goes through `String()` below.
   */
  attrs: Record<string, unknown>;
}

/** One record as a terminal row. */
export interface TapLine {
  /** Clock time to the second. The date is said once, on the tally. */
  at: string;
  name: string;
  /** Shortened the way the run list shortens a session id. */
  session: string | null;
  attrs: [string, string][];
  /** Attributes that did not fit. Counted rather than dropped in silence. */
  more: number;
}

/**
 * What the receiver has heard, in total.
 *
 * Deliberately not `LiveEvidence`, which is the shape the requirement panels
 * are drawn from: that carries two content figures this window has no use for,
 * and it is keyed by which setting each number vouches for rather than by what
 * arrived. Four counts and a clock is the whole of what a tally row needs, and
 * a component that asked for more would be a component that could print more
 * than it means to.
 */
export interface Heard {
  events: number;
  metrics: number;
  spans: number;
  sessions: number;
  /** The newest record's timestamp. Null means nothing has ever arrived. */
  lastSeen: string | null;
}

/** The whole of what the window draws: the tally, and the lines under it. */
export interface TraceTap {
  heard: Heard;
  lines: TapLine[];
}

/** How many records the window draws. A window, not an archive. */
export const TAP_LINES = 40;

/**
 * How full a vessel reads, given the count backing it.
 *
 * One point per hundred: a vessel that has heard a dozen records and one that
 * has heard eighty read the same, at 1%, because a reader comparing two
 * vessels by eye cannot tell twelve from eighty apart anyway, and both are
 * true zeroes of the question this fill answers - "is this vessel worth
 * calling full". Every hundred after that earns another point, plainly,
 * rather than in named steps a reader has to have learned first.
 *
 * Capped at 80, matching `--fill`'s ceiling everywhere else in this diagram -
 * see `.rp-node.met` in globals.css - so a receiver that has heard a great
 * deal still reads as "there is a surface here", never as the one brimming,
 * finished-looking vessel among vessels that never are.
 *
 * Shared by the Trace terminus (`tap.heard.events`) and every "met" node in
 * the pipe (`Receipt.count`, which is metrics for the metrics node, spans for
 * the spans node, and so on) - one formula, whatever the count means.
 */
export function waterFill(count: number): number {
  return Math.min(80, 1 + Math.floor(count / 100));
}

/**
 * Four per row, and a count of the rest.
 *
 * A `user_prompt` event carries a dozen attributes and one of them is the
 * whole prompt, so printing all of them turns every row into a paragraph and
 * the log stops being scannable. Four is what fits on one line at laptop width
 * with the timestamp and the name in front of it.
 */
const ATTRS_PER_LINE = 4;

/** Long enough for a model id or a decision word; short enough to stay a row. */
const VALUE_CHARS = 48;

/**
 * The namespaces that say nothing about the work, and are therefore dropped.
 *
 * One rule, drawn at the dot so it can be checked mechanically: a key with one
 * of these namespaces in front of it describes the machine, the account, or
 * the row's own bookkeeping - never what happened. `host.arch`, `os.version`,
 * `service.name`, `user.email`, `organization.id`, `terminal.type` and
 * `session.id` are identical on all 8,010 events this receiver holds;
 * `event.name` and `event.timestamp` are the two columns the row already
 * prints in front of them; and `prompt.id` and `message.uuid` are correlation
 * ids whose only job is to join records to each other, printed the same on
 * every row of a turn and 36 characters wide.
 *
 * Everything left is spelled without a namespace - `tool_name`, `model`,
 * `duration_ms`, `cost_usd`, `decision`, `prompt`, `response` - which is not a
 * coincidence this rule relies on but is why the line falls in a usable place.
 *
 * It matters more than tidiness. The interesting attributes - `tool_name`,
 * `model`, `duration_ms`, `cost_usd`, `decision`, the token counts - arrive
 * after the constants in the JSON, so with these kept every row in the window
 * spent its whole budget printing the same three facts about this laptop and
 * the log said nothing at all. Measured, not guessed: that is what the first
 * draft of this window looked like.
 *
 * Nothing is hidden by it. What is dropped is counted in `more` and named on
 * the Trace page, which prints a row's attributes in full.
 */
const CONSTANT_NAMESPACES = [
  "host.",
  "os.",
  "service.",
  "user.",
  "organization.",
  "terminal.",
  "session.",
  "event.",
  "prompt.",
  "message.",
];

/** The same fact, in the spelling the hook's rows use rather than OTLP's. */
const SAID_ELSEWHERE = new Set(["session_id"]);

const constant = (key: string): boolean =>
  SAID_ELSEWHERE.has(key) || CONSTANT_NAMESPACES.some((prefix) => key.startsWith(prefix));

export function tapLines(records: TapRecord[]): TapLine[] {
  return records.map((record) => {
    const pairs = Object.entries(record.attrs)
      .filter(([key]) => !constant(key))
      .map(([key, value]) => [key, printable(value)] as [string, string]);

    return {
      at: clockOf(record.ts),
      name: record.name,
      session: record.sessionId === null ? null : record.sessionId.slice(0, 8),
      attrs: pairs.slice(0, ATTRS_PER_LINE),
      more: Math.max(0, pairs.length - ATTRS_PER_LINE),
    };
  });
}

/**
 * One attribute value, on one line.
 *
 * Newlines collapse rather than being kept, because a row of a log that is
 * eleven rows tall is not a row. The full text of anything cut here is on the
 * Trace page, which is what that page is for.
 */
function printable(value: unknown): string {
  const flat = String(value).replace(/\s+/g, " ").trim();
  return flat.length > VALUE_CHARS ? `${flat.slice(0, VALUE_CHARS - 1)}…` : flat;
}

/**
 * `2026-09-08T04:12:33.481Z` -> `14:12:33` on a UTC+10 machine.
 *
 * In the reader's own timezone, not the stored one - see `localClock.ts`.
 * This is the one field a reader uses to tell "just now" from "last Tuesday",
 * and a clock that is honestly ten hours wrong reads as far more wrong than
 * one that is merely unparsed.
 */
const clockOf = localTime;

/**
 * Which of the three things the window has to say.
 *
 * `lines` - records arrived and are printed.
 *
 * `quiet` - something arrived, but no events, so there is nothing with a line
 * in it to print. Metric points and spans are not log records; a window that
 * showed the dry banner here would be telling a reader whose telemetry is
 * working that it is not. The split exists because that is a real and common
 * configuration: `OTEL_METRICS_EXPORTER` set and `OTEL_LOGS_EXPORTER` not.
 *
 * `dark` - nothing at all has been received. The one genuine absence, and the
 * only state that gets the banner.
 */
export type TapState = "lines" | "quiet" | "dark";

/* The three counts and nothing else, which is the whole of what this decides
   on: `Heard` satisfies it, and so does a test that only has to name what
   arrived. */
export function tapState(
  heard: Pick<Heard, "events" | "metrics" | "spans">,
  lines: TapLine[],
): TapState {
  if (lines.length > 0) return "lines";
  return heard.events + heard.metrics + heard.spans > 0 ? "quiet" : "dark";
}

// ---------------------------------------------------------------------------
// The banner
// ---------------------------------------------------------------------------

/**
 * Block capitals, five rows of five columns each.
 *
 * Drawn rather than written out as finished lines because the assembly is
 * where the mistakes are: a hand-aligned banner is fifteen strings that all
 * have to agree on their padding, and the first edit to one of them makes a
 * letter lean. Here the padding is arithmetic and `tests/trace-tap.test.ts`
 * pins every row to the same width.
 *
 * Only the letters the two words use. A glyph for a letter nothing prints is a
 * glyph nobody would ever see fail.
 */
const GLYPHS: Record<string, string[]> = {
  N: ["#   #", "##  #", "# # #", "#  ##", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", " ### "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  "],
  E: ["#####", "#    ", "#### ", "#    ", "#####"],
  L: ["#    ", "#    ", "#    ", "#    ", "#####"],
  F: ["#####", "#    ", "#### ", "#    ", "#    "],
  W: ["#   #", "#   #", "# # #", "## ##", "#   #"],
  I: ["#####", "  #  ", "  #  ", "  #  ", "#####"],
  G: [" ####", "#    ", "#  ##", "#   #", " ### "],
};

/** Every glyph is this tall, which is what lets the rows be zipped. */
export const BANNER_ROWS = 5;

/**
 * One line of block capitals, as five strings.
 *
 * A space in the text is a gap of its own rather than a missing glyph, so
 * `NO OTEL` reads as two words. An unsupported character would be a hole in
 * the middle of a word, so it throws instead: the text is a constant in this
 * repo, and a banner that silently loses its N is worse than a build that
 * stops.
 */
export function banner(text: string): string[] {
  const rows = Array.from({ length: BANNER_ROWS }, () => "");

  for (const [i, char] of [...text.toUpperCase()].entries()) {
    const glyph = char === " " ? Array.from({ length: BANNER_ROWS }, () => "   ") : GLYPHS[char];
    if (!glyph) throw new Error(`banner(): no glyph for ${JSON.stringify(char)}`);

    for (let row = 0; row < BANNER_ROWS; row += 1) {
      rows[row] = i === 0 ? glyph[row]! : `${rows[row]!} ${glyph[row]!}`;
    }
  }

  return rows;
}

/** What the ink turns into. Never `#`, or a flicker would sometimes do nothing. */
const GLITCH = [..."%&@$*+=~/\\|<>?!"];

/**
 * The banner, with some of its ink replaced.
 *
 * The animation is a script rather than CSS because what moves is the text
 * itself, and no stylesheet can rewrite a character. It is a pure function of
 * a random source for exactly that reason: the component owns the clock and
 * the `prefers-reduced-motion` question, and a test can hand this a counter
 * and get the same picture twice.
 *
 * Spaces are left alone. Flickering them would make the sign wider than the
 * letters and the words would stop being words.
 */
export function glitch(rows: string[], rate: number, rand: () => number): string[] {
  return rows.map((row) =>
    [...row]
      .map((char) => (char !== " " && rand() < rate ? symbol(rand()) : char))
      .join(""),
  );
}

/** Clamped, so a random source that can return exactly 1 cannot pick nothing. */
const symbol = (r: number): string =>
  GLITCH[Math.min(GLITCH.length - 1, Math.floor(r * GLITCH.length))]!;
