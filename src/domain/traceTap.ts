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
 * ## Three signals, one window
 *
 * It used to read the log stream alone. Metric points and spans were counted
 * in the tally above the lines and never appeared as lines, so a reader who
 * had just set tier 2 could watch the spans figure tick up and never see a
 * span. Every record is a line now, and every line says which of the three
 * streams it came down - in a word first and a colour second, because a
 * colour is never the only channel here. The cost is volume: a metric export
 * lands ten to thirty points at once, which is why the window has a switch per
 * stream and remembers it.
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

/**
 * The three streams OTLP carries, in the words the window uses.
 *
 * `log` rather than `event`, because the receiver's tally already says
 * "events" for the same rows and one word per thing is the rule - but the
 * column is a signal name, not a row count, and the OpenTelemetry name for the
 * stream is logs. A record's `kind` says which table it came out of, which is
 * the only thing the colour is allowed to mean.
 */
export type TapKind = "log" | "metric" | "span";

/** Every kind, in the order the switches and the legend print them. */
export const TAP_KINDS: readonly TapKind[] = ["log", "metric", "span"];

/** The stream a kind is a tap on, in the spelling `tail` would use. */
export const TAP_STREAM: Record<TapKind, string> = {
  log: "events",
  metric: "metrics",
  span: "spans",
};

/** One record as the database hands it over. */
export interface TapRecord {
  kind: TapKind;
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
  /** Metric points only: what the point measured. */
  value?: number | null;
  /**
   * Spans only. Null when the span arrived without a usable end, which the
   * decoder keeps as null so that it reaches the screen as a dash and never
   * as a zero-millisecond call.
   */
  durationMs?: number | null;
  /** Spans only. */
  status?: string | null;
}

/** One record as a terminal row. */
export interface TapLine {
  kind: TapKind;
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
 * are drawn from: that carries content figures this window has no use for,
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

/** The whole of what the window draws: the tally, the switches, and the lines. */
export interface TraceTap {
  heard: Heard;
  /** Which streams the lines were read from. A stored choice - see `parseTapKinds`. */
  kinds: TapKind[];
  lines: TapLine[];
}

/** How many records the window draws. A window, not an archive. */
export const TAP_LINES = 40;

/**
 * How full a vessel reads, given the count backing it.
 *
 * Two rules, and the first is the one that matters: a vessel that is set
 * never reads emptier than one that is not. The murk in an unset vessel sits
 * at 30% (`.rp-node` in globals.css), so a set vessel starts at 40% - with
 * nothing yet received it still shows a surface, because "set, and waiting for
 * the next session to start" is a state this page has to draw every day and
 * the previous rule drew it as a hairline. One point per hundred records was
 * honest arithmetic and it put every working node on this machine at 1%,
 * lower than a broken one.
 *
 * Above the floor it climbs with the order of magnitude, not the count: a
 * reader comparing two vessels by eye can tell ten from a thousand and cannot
 * tell three hundred from four hundred, so decades are the honest scale.
 * 40% at nothing, 58% at a hundred, 67% at a thousand, and the cap of 76% from
 * ten thousand up - which is the ceiling `.rp-node.met` sets, because the
 * crest hangs 7px above the water line and clips at anything higher.
 *
 * Shared by both termini and every "met" node in the pipe (`Receipt.count`,
 * which is metrics for the metrics node, spans for the spans node, and so on)
 * - one formula, whatever the count means. The termini clamp it from below
 * in the stylesheet (`.rp-end.on .rp-water`), because a word sits in the
 * middle of those two and has to stay under the water line.
 */
export function waterFill(count: number): number {
  const decades = Math.log10(Math.max(0, count) + 1) / 4;
  return FILL_FLOOR + Math.round(Math.min(1, decades) * (FILL_CEILING - FILL_FLOOR));
}

/** A set vessel's dregs: above the 30% murk of an unset one, below the word in a terminus. */
export const FILL_FLOOR = 40;

/** Where the crest still fits inside the vessel - see `.rp-node.met`. */
export const FILL_CEILING = 76;

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
 * The attributes worth the four slots, in the order they take them.
 *
 * Claude Code writes a record's attributes in a fixed order and the ones
 * about the work come last - `tool_parameters` and `tool_input` arrive after
 * `tool_name`, `tool_use_id`, `success` and `duration_ms` on every tool event,
 * so with the slots filled in arrival order the two attributes a reader turned
 * on `OTEL_LOG_TOOL_DETAILS` and `OTEL_LOG_TOOL_CONTENT` to see were folded
 * into `+2 more` on every row they were ever on. That is what "I set it and
 * nothing shows" looked like. Anything not listed here keeps its arrival
 * order behind these.
 *
 * `value` first: it is the whole of what a metric point says.
 */
const FIRST = [
  "value",
  "tool_name",
  "decision",
  "model",
  "duration_ms",
  "cost_usd",
  "prompt",
  "response",
  "tool_parameters",
  "tool_input",
  "tool_output",
];

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
 * Nothing is hidden by it. What is dropped is counted in `more`; the Trace
 * page draws the transcript's own copy of what was said and run.
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
  /* Spans carry their own bookkeeping namespace: `span.type` repeats the
     name, `interaction.sequence` is a counter. */
  "span.",
  "interaction.",
];

/** The same fact, in the spelling the hook's rows use rather than OTLP's. */
const SAID_ELSEWHERE = new Set(["session_id"]);

const constant = (key: string): boolean =>
  SAID_ELSEWHERE.has(key) || CONSTANT_NAMESPACES.some((prefix) => key.startsWith(prefix));

/** A duration nobody measured. Never `0`: a zero-millisecond span is a claim. */
const DASH = "—";

export function tapLines(records: TapRecord[]): TapLine[] {
  return records.map((record) => {
    const own = ownPairs(record);
    const fromAttrs = Object.entries(record.attrs).filter(
      ([key]) => !constant(key) && !own.some(([mine]) => mine === key),
    );
    const pairs = prioritise([...own, ...fromAttrs]).map(
      ([key, value]) => [key, printable(value)] as [string, string],
    );

    return {
      kind: record.kind,
      at: clockOf(record.ts),
      name: record.name,
      session: record.sessionId === null ? null : record.sessionId.slice(0, 8),
      attrs: pairs.slice(0, ATTRS_PER_LINE),
      more: Math.max(0, pairs.length - ATTRS_PER_LINE),
    };
  });
}

/**
 * What a record says that is not in its attribute bag.
 *
 * A metric point's value and a span's measured duration are columns of their
 * own, and both outrank anything in the bag: the value is the whole of what a
 * point says, and the measured duration is the one figure on a span that the
 * transcript could not have told you. A span's own `duration_ms` attribute
 * yields to the measured one - two durations on one row would be a row that
 * disagrees with itself.
 */
function ownPairs(record: TapRecord): [string, unknown][] {
  switch (record.kind) {
    case "metric":
      return [["value", record.value ?? DASH]];
    case "span":
      return [
        ["duration_ms", record.durationMs ?? DASH],
        ...(record.status ? [["status", record.status] as [string, unknown]] : []),
      ];
    default:
      return [];
  }
}

/** `FIRST` in its own order, then everything else as it arrived. */
function prioritise(pairs: [string, unknown][]): [string, unknown][] {
  const rank = (key: string): number => {
    const at = FIRST.indexOf(key);
    return at === -1 ? FIRST.length : at;
  };
  // Stable, so the tail keeps arrival order.
  return [...pairs].sort((a, b) => rank(a[0]) - rank(b[0]));
}

/**
 * One attribute value, on one line.
 *
 * Newlines collapse rather than being kept, because a row of a log that is
 * eleven rows tall is not a row. The count at the end of the row says what was
 * cut; the Trace page has the transcript's own copy of anything said or run.
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

// ---------------------------------------------------------------------------
// The switches
// ---------------------------------------------------------------------------

/**
 * Which streams the window reads, from what `app_state` holds.
 *
 * Fails open, like `parseRange`: a value an older build stored, a hand-edited
 * row, or a list that names no stream this build knows all come back as every
 * stream. Showing more than was asked is a mistake the reader can see; a
 * window that came up empty because its stored switches were nonsense would
 * be one that says the line is dry when it is not.
 */
export function parseTapKinds(stored: string | null): TapKind[] {
  const wanted = (stored ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is TapKind => (TAP_KINDS as readonly string[]).includes(s));
  const kinds = TAP_KINDS.filter((k) => wanted.includes(k));
  return kinds.length > 0 ? kinds : [...TAP_KINDS];
}

export const formatTapKinds = (kinds: readonly TapKind[]): string => kinds.join(",");

/**
 * The switches after one is flipped, in a form the action can store.
 *
 * The last stream on cannot be switched off. A window with nothing to read is
 * not a state a reader can tell apart from a dry line, so the control that
 * would produce it is disabled and this refuses it too - the button being
 * greyed out is a courtesy, the rule is here.
 */
export function toggleTapKind(kinds: readonly TapKind[], kind: TapKind): TapKind[] {
  if (kinds.includes(kind)) {
    return kinds.length === 1 ? [...kinds] : kinds.filter((k) => k !== kind);
  }
  return TAP_KINDS.filter((k) => k === kind || kinds.includes(k));
}

/**
 * The prompt line above the log, honest about what it is tailing.
 *
 * `otel/events` when one stream is on, `otel/{events,spans}` for several - the
 * brace expansion a shell would need to tail two files at once, which is what
 * this window is doing.
 */
export function tapCommand(kinds: readonly TapKind[]): string {
  const streams = TAP_KINDS.filter((k) => kinds.includes(k)).map((k) => TAP_STREAM[k]);
  const target = streams.length === 1 ? streams[0]! : `{${streams.join(",")}}`;
  return `tail -n ${TAP_LINES} otel/${target}`;
}

/**
 * Which of the three things the window has to say.
 *
 * `lines` - records arrived and are printed.
 *
 * `quiet` - something arrived, but nothing on the streams that are switched
 * on. With a switch per stream this is a state the reader can put the window
 * in on purpose - spans only, before the first span - and a window that showed
 * the dry banner there would be telling a reader whose telemetry is working
 * that it is not. The tally above still counts what did arrive.
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
