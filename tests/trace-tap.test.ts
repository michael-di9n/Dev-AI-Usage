import { describe, expect, it } from "vitest";
import {
  BANNER_ROWS,
  FILL_CEILING,
  TAP_KINDS,
  banner,
  formatTapKinds,
  glitch,
  linesFor,
  parseTapKinds,
  TAP_LINES,
  tapCommand,
  tapLines,
  tapState,
  toggleTapKind,
  waterFill,
  type TapLine,
  type TapRecord,
} from "../src/domain/traceTap";
import { localTime } from "../src/domain/localClock";

/**
 * The window on the trace terminus.
 *
 * Four things here are worth a test and the drawing is not. Whether a row
 * misreports a record, whether the empty state can call a working receiver
 * dead, whether the switches can leave the window with nothing to read, and
 * whether the sign stays legible - the first three are correctness and the
 * fourth is the only reason the sign is generated rather than typed out.
 */

const FIXTURE_TS = "2026-09-08T04:12:33.481Z";

const record = (over: Partial<TapRecord> = {}): TapRecord => ({
  kind: "log",
  ts: FIXTURE_TS,
  name: "user_prompt",
  sessionId: "2dd3fbcc-9f21-4a1e-b0f1-0c9a77f2e311",
  attrs: { model: "claude-opus-5", prompt: "hello" },
  ...over,
});

const line = (over: Partial<TapLine> = {}): TapLine => ({
  kind: "log",
  // The reader's own zone, not the fixture's UTC one - whichever machine
  // runs this test, so the assertion below holds without pinning a TZ.
  at: localTime(FIXTURE_TS),
  name: "user_prompt",
  session: "2dd3fbcc",
  attrs: [],
  more: 0,
  detail: [],
  ...over,
});

describe("tapLines", () => {
  it("prints the clock, not the date, and shortens the session", () => {
    const [row] = tapLines([record()]);
    expect(row?.at).toBe(localTime(FIXTURE_TS));
    expect(row?.session).toBe("2dd3fbcc");
  });

  it("leaves a timestamp it does not recognise exactly as it arrived", () => {
    // A clock cut at the wrong offset is a clock that lies, and this is the
    // one field a reader uses to tell "just now" from "last Tuesday".
    expect(tapLines([record({ ts: "whenever" })])[0]?.at).toBe("whenever");
  });

  it("says which stream every line came down", () => {
    expect(tapLines([record()])[0]?.kind).toBe("log");
    expect(tapLines([record({ kind: "span", durationMs: 3 })])[0]?.kind).toBe("span");
  });

  it("keeps the prompt itself while dropping the id of it", () => {
    // The rule is drawn at the dot: `prompt.id` is a correlation id and
    // `prompt` is the thing a reader opened the window to read.
    const [row] = tapLines([record({ attrs: { "prompt.id": "abc", prompt: "hello" } })]);
    expect(row?.attrs).toEqual([["prompt", "hello"]]);
  });

  it("keeps a missing session id missing", () => {
    expect(tapLines([record({ sessionId: null })])[0]?.session).toBeNull();
  });

  it("stringifies an attribute the wire format sent as a number", () => {
    // The column is JSON and JSON.parse is unchecked, whatever the query's
    // return type says. This is the crash that would otherwise reach the page.
    const [row] = tapLines([record({ attrs: { duration_ms: 1420 } })]);
    expect(row?.attrs).toEqual([["duration_ms", "1420"]]);
  });

  it("flattens a value that arrived with newlines in it", () => {
    const [row] = tapLines([record({ attrs: { prompt: "one\n\ntwo   three" } })]);
    expect(row?.attrs[0]?.[1]).toBe("one two three");
  });

  it("clips a long value and marks that it was clipped", () => {
    const [row] = tapLines([record({ attrs: { prompt: "x".repeat(200) } })]);
    const value = row!.attrs[0]![1];
    expect(value.length).toBe(48);
    expect(value.endsWith("…")).toBe(true);
  });

  it("counts the attributes that did not fit rather than dropping them", () => {
    const attrs = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [`a${n}`, String(n)]));
    const [row] = tapLines([record({ attrs })]);
    expect(row?.attrs).toHaveLength(4);
    expect(row?.more).toBe(3);
  });

  /**
   * The complaint this fixes, on a record exactly as the receiver stored it:
   * with `OTEL_LOG_TOOL_DETAILS` and `OTEL_LOG_TOOL_CONTENT` on, the two
   * attributes they add arrive after four the row already prints, so in
   * arrival order they were folded into `+2 more` on every row and the
   * settings looked as if they did nothing.
   */
  it("puts the attributes a content setting adds inside the four slots", () => {
    const [row] = tapLines([record({
      name: "tool_result",
      attrs: {
        tool_name: "Bash",
        tool_use_id: "toolu_01P8riJxYZUsDbN2Cr2j17jA",
        success: "true",
        duration_ms: "21",
        tool_parameters: '{"bash_command":"git","full_command":"git status --short"}',
        tool_input: '{"command":"git status --short"}',
        tool_input_size_bytes: "135",
        tool_result_size_bytes: "111",
      },
    })]);

    expect(row?.attrs.map(([key]) => key)).toEqual([
      "tool_name", "duration_ms", "tool_parameters", "tool_input",
    ]);
    // Still counted: four printed of eight kept.
    expect(row?.more).toBe(4);
  });

  it("keeps arrival order for everything the priority list does not name", () => {
    const [row] = tapLines([record({ attrs: { zebra: "1", apple: "2", model: "m" } })]);
    expect(row?.attrs.map(([key]) => key)).toEqual(["model", "zebra", "apple"]);
  });

  it("prints a metric point's value first, whatever else it carries", () => {
    const [row] = tapLines([record({
      kind: "metric", name: "claude_code.token.usage", value: 1_532,
      attrs: { model: "claude-opus-5", type: "input" },
    })]);
    expect(row?.attrs).toEqual([["value", "1532"], ["model", "claude-opus-5"], ["type", "input"]]);
  });

  it("prints a span's measured duration, and a dash when it has none", () => {
    const [timed, untimed] = tapLines([
      record({ kind: "span", name: "claude_code.llm_request", durationMs: 9_614, status: "STATUS_CODE_OK", attrs: { model: "m", duration_ms: "9000" } }),
      record({ kind: "span", name: "claude_code.tool", durationMs: null, status: null, attrs: {} }),
    ]);
    // The measured figure wins over the span's own attribute of the same name:
    // one duration per row.
    expect(timed?.attrs).toEqual([
      ["model", "m"], ["duration_ms", "9614"], ["status", "STATUS_CODE_OK"],
    ]);
    // A duration nobody measured is a dash, never a zero.
    expect(untimed?.attrs).toEqual([["duration_ms", "—"]]);
  });

  it("drops a span's own bookkeeping namespaces along with the machine's", () => {
    const [row] = tapLines([record({
      kind: "span", durationMs: 1,
      attrs: { "span.type": "interaction", "interaction.sequence": "2", user_prompt: "hi" },
    })]);
    expect(row?.attrs).toEqual([["duration_ms", "1"], ["user_prompt", "hi"]]);
  });

  /**
   * The rule that decides whether this window says anything.
   *
   * Claude Code sends the machine's and the account's attributes first and the
   * work's attributes after them, so a row that kept the constants spent its
   * whole four-attribute budget on `host.arch`, `os.type` and `os.version` -
   * the same three facts on every line, none of them why anyone opened the
   * window.
   */
  it("drops what is identical on every record and keeps what is not", () => {
    const [row] = tapLines([record({
      attrs: {
        "host.arch": "amd64",
        "os.type": "linux",
        "service.name": "claude-code",
        "user.email": "someone@example.com",
        "organization.id": "org_1",
        "terminal.type": "tmux",
        "session.id": "abc",
        session_id: "abc",
        "event.name": "tool_result",
        "event.timestamp": "2026-09-08T04:12:33Z",
        "prompt.id": "a8fdee84-6e30-4eeb-ab4c-05679486a2f3",
        "message.uuid": "9f21-4a1e",
        tool_name: "Bash",
        duration_ms: 1420,
      },
    })]);

    expect(row?.attrs).toEqual([["tool_name", "Bash"], ["duration_ms", "1420"]]);
    // Counted, not hidden: nothing dropped here is dropped in silence.
    expect(row?.more).toBe(0);
  });
});

describe("tapState", () => {
  const heard = { events: 0, metrics: 0, spans: 0 };

  it("prints the lines when there are lines", () => {
    expect(tapState({ ...heard, events: 1 }, [line()])).toBe("lines");
  });

  /**
   * The split that stops the window lying. With a switch per stream a reader
   * can put the window on spans alone before the first span has arrived, and
   * a receiver holding 40,000 metric points is not a receiver that has heard
   * nothing - telling that reader their setup is dead, above a tally counting
   * what arrived, would be the page contradicting itself.
   */
  it("does not call a receiver dark when metric points have arrived", () => {
    expect(tapState({ ...heard, metrics: 40_000 }, [])).toBe("quiet");
  });

  it("does not call a receiver dark when spans have arrived", () => {
    expect(tapState({ ...heard, spans: 12 }, [])).toBe("quiet");
  });

  it("is dark only when nothing at all has ever arrived", () => {
    expect(tapState(heard, [])).toBe("dark");
  });
});

describe("the detail a row's count opens", () => {
  /*
   * The row is a tail: four attributes and a count of what did not fit. The
   * count is a control, and these pin what it has to be able to show - the
   * whole record, because a detail window that showed the same cut values as
   * the row would be a second copy of the row.
   */

  it("carries the attributes the row printed and the ones it only counted", () => {
    const [row] = tapLines([
      record({ attrs: { tool_name: "Bash", model: "m", decision: "accept", cost_usd: "1", duration_ms: "2", extra: "3" } }),
    ]);

    expect(row!.attrs).toHaveLength(4);
    expect(row!.more).toBe(2);

    // Everything on the row is in here, and so is everything it counted: the
    // six attributes, in the order the row ranked them, and then the session
    // id the row only prints the first eight characters of.
    const keys = row!.detail.map(([k]) => k);
    expect(keys.slice(0, 4)).toEqual(row!.attrs.map(([k]) => k));
    expect(keys.slice(0, 6).sort()).toEqual(
      ["cost_usd", "decision", "duration_ms", "extra", "model", "tool_name"],
    );
    expect(keys.slice(6)).toEqual(["session_id"]);
  });

  /** The reason to open it at all. */
  it("does not cut a value to the width of a line", () => {
    const long = "x".repeat(400);
    const [row] = tapLines([record({ attrs: { prompt: long } })]);

    expect(row!.attrs[0]![1]).toContain("…");
    expect(row!.attrs[0]![1].length).toBeLessThan(60);
    expect(Object.fromEntries(row!.detail).prompt).toBe(long);
  });

  /** A value that arrived with newlines reads as the lines it was written in;
   *  the row collapses them because a row eleven lines tall is not a row. */
  it("keeps the newlines the row collapses", () => {
    const [row] = tapLines([record({ attrs: { prompt: "first\nsecond" } })]);

    expect(row!.attrs[0]![1]).toBe("first second");
    expect(Object.fromEntries(row!.detail).prompt).toBe("first\nsecond");
  });

  /**
   * The attributes the row drops for being identical on every record - the
   * machine, the account, the correlation ids. They are exactly what a reader
   * opening one record wants and exactly what forty rows of them say nothing
   * about, so they belong here and nowhere else.
   */
  it("carries the constants the row drops", () => {
    const [row] = tapLines([
      record({ attrs: { tool_name: "Bash", "host.arch": "x86", "user.id": "u1" } }),
    ]);

    expect(row!.attrs.map(([k]) => k)).not.toContain("host.arch");
    expect(Object.fromEntries(row!.detail)["host.arch"]).toBe("x86");
    expect(Object.fromEntries(row!.detail)["user.id"]).toBe("u1");
  });

  /** The row prints the first eight characters; correlating against anything
   *  else needs the whole thing, and this is the only place it appears. */
  it("carries the session id unshortened", () => {
    const [row] = tapLines([record()]);

    expect(row!.session).toBe("2dd3fbcc");
    expect(Object.fromEntries(row!.detail).session_id)
      .toBe("2dd3fbcc-9f21-4a1e-b0f1-0c9a77f2e311");
  });

  /** A record whose attrs also carry `session_id` must not print it twice. */
  it("names every attribute once", () => {
    const [row] = tapLines([
      record({ attrs: { session_id: "2dd3fbcc-9f21-4a1e-b0f1-0c9a77f2e311", tool_name: "Bash" } }),
    ]);

    const keys = row!.detail.map(([k]) => k);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /** No count on the row is not nothing to show - it is a whole record that
   *  happened to fit, plus the constants and the full session id. */
  it("is still the whole record when the row fitted everything", () => {
    const [row] = tapLines([record({ attrs: { tool_name: "Bash" } })]);

    expect(row!.more).toBe(0);
    expect(Object.fromEntries(row!.detail).tool_name).toBe("Bash");
    expect(Object.fromEntries(row!.detail).session_id).toContain("2dd3fbcc");
  });

  /** A metric point's value and a span's measured duration are columns rather
   *  than attributes, and they outrank the bag on the row - so they lead here
   *  too, or the window would disagree with the row about what matters. */
  it("keeps the row's order for what the row showed", () => {
    const [row] = tapLines([
      record({ kind: "metric", value: 12, attrs: { model: "m", "host.arch": "x86" } }),
    ]);

    expect(row!.detail[0]![0]).toBe("value");
    // The constants come after everything the row would have ranked.
    expect(row!.detail.at(-1)![0]).toBe("host.arch");
  });
});

describe("linesFor", () => {
  /*
   * The narrowing that lets a switch move the log without a round trip. It is
   * given every stream's own window and hands back the switched-on ones,
   * which is the same set the query would have returned for that selection.
   */
  const at = (kind: "log" | "metric" | "span", n: number) =>
    line({ kind, name: `${kind}-${n}`, at: String(n).padStart(2, "0") });

  /**
   * The whole reason the page reads every stream rather than the newest forty
   * overall. Ten spans have arrived on this machine against twelve thousand
   * events, so the newest forty records contain no span at all - narrowing
   * *those* would show a working spans stream as empty, and `tapState` would
   * then call a live receiver quiet. This is the case that catches it.
   */
  it("returns a stream's own rows, not just the ones that were newest overall", () => {
    const lines = [
      ...Array.from({ length: 40 }, (_, i) => at("log", 100 - i)),
      at("span", 1),
    ];

    expect(linesFor(lines, ["span"])).toEqual([at("span", 1)]);
  });

  it("keeps every switched-on stream and drops the rest", () => {
    const lines = [at("log", 3), at("metric", 2), at("span", 1)];

    expect(linesFor(lines, ["log", "span"]).map((l) => l.kind)).toEqual(["log", "span"]);
  });

  it("narrowing to every stream is the window itself", () => {
    const lines = Array.from({ length: 10 }, (_, i) => at("log", 10 - i));

    expect(linesFor(lines, TAP_KINDS)).toEqual(lines);
  });

  /** A window, not an archive - the same bound the query is given. */
  it("never returns more than the window holds", () => {
    const lines = Array.from({ length: TAP_LINES * 3 }, (_, i) => at("log", i));

    expect(linesFor(lines, ["log"])).toHaveLength(TAP_LINES);
  });

  it("keeps the order it was given, which is newest first", () => {
    const lines = [at("log", 9), at("metric", 8), at("log", 7)];

    expect(linesFor(lines, ["log", "metric"]).map((l) => l.name))
      .toEqual(["log-9", "metric-8", "log-7"]);
  });

  /**
   * The two halves meeting: a reader who switches to spans alone before a
   * span has arrived must be told the stream is quiet, not that the receiver
   * is dead - the tally beside it is counting events.
   */
  it("leaves tapState able to tell a quiet stream from a dead receiver", () => {
    const heard = { events: 12_000, metrics: 0, spans: 0 };
    const lines = [at("log", 1)];

    expect(tapState(heard, linesFor(lines, ["span"]))).toBe("quiet");
    expect(tapState(heard, linesFor(lines, ["log"]))).toBe("lines");
  });
});

describe("the switches", () => {
  it("read every stream when nothing is stored, or nonsense is", () => {
    expect(parseTapKinds(null)).toEqual([...TAP_KINDS]);
    expect(parseTapKinds("")).toEqual([...TAP_KINDS]);
    expect(parseTapKinds("traces,logs")).toEqual([...TAP_KINDS]);
  });

  it("round-trip a stored choice, in a fixed order, ignoring what they do not know", () => {
    expect(parseTapKinds("span,log")).toEqual(["log", "span"]);
    expect(parseTapKinds(" metric , bogus ")).toEqual(["metric"]);
    expect(parseTapKinds(formatTapKinds(["span", "metric"]))).toEqual(["metric", "span"]);
  });

  it("flip one stream and keep the others", () => {
    expect(toggleTapKind(["log", "metric", "span"], "metric")).toEqual(["log", "span"]);
    expect(toggleTapKind(["log"], "span")).toEqual(["log", "span"]);
  });

  it("refuse to switch off the last stream", () => {
    // A window reading nothing is a window that says the line is dry when it
    // is not; the button is disabled and the rule is here as well.
    expect(toggleTapKind(["span"], "span")).toEqual(["span"]);
  });

  it("say on the prompt line which files are being tailed", () => {
    expect(tapCommand(["log"])).toBe("tail -n 40 otel/events");
    expect(tapCommand(["span", "log"])).toBe("tail -n 40 otel/{events,spans}");
    expect(tapCommand([...TAP_KINDS])).toBe("tail -n 40 otel/{events,metrics,spans}");
  });
});

describe("the banner", () => {
  it("is as tall as a glyph and every row is the same width", () => {
    const rows = banner("NO OTEL");
    expect(rows).toHaveLength(BANNER_ROWS);
    expect(new Set(rows.map((r) => r.length)).size).toBe(1);
  });

  it("stays narrow enough to read on a phone", () => {
    // The sign sits in a box that scrolls sideways, so a wide banner is not a
    // broken page - but a reader who has to scroll to find out that OTEL is
    // not flowing has been told nothing at a glance.
    for (const word of ["NO OTEL", "FLOWING"]) {
      expect(banner(word)[0]!.length).toBeLessThanOrEqual(44);
    }
  });

  it("draws a space as a gap rather than a missing letter", () => {
    expect(banner("NO OTEL")[0]).toContain("   ");
  });

  it("refuses a character it has no glyph for", () => {
    // Better a build that stops than a sign that silently loses its N.
    expect(() => banner("NO OTEL?")).toThrow(/no glyph/);
  });
});

describe("glitch", () => {
  const rows = banner("NO");

  it("never touches a space, so the words keep their shape", () => {
    const out = glitch(rows, 1, () => 0);
    for (const [i, row] of out.entries()) {
      expect([...row].map((c, at) => (c === " " ? at : -1))).toEqual(
        [...rows[i]!].map((c, at) => (c === " " ? at : -1)),
      );
    }
  });

  it("leaves every row the same length, whatever it replaces", () => {
    const out = glitch(rows, 1, () => 0.999999);
    expect(out.map((r) => r.length)).toEqual(rows.map((r) => r.length));
  });

  it("rewrites nothing at a rate of zero", () => {
    expect(glitch(rows, 0, () => 0.5)).toEqual(rows);
  });

  it("replaces the ink with something that is not the ink", () => {
    const out = glitch(rows, 1, () => 0);
    expect(out.join("")).not.toContain("#");
  });
});

describe("waterFill", () => {
  /* One point per hundred records, and nothing on top of it. The reading is
     meant to be arithmetic a reader can do off the tally beside it. */

  it("is one point per hundred records", () => {
    expect(waterFill(0)).toBe(1);
    expect(waterFill(100)).toBe(2);
    expect(waterFill(1_000)).toBe(11);
    expect(waterFill(5_000)).toBe(51);
  });

  it("moves by the count, not by the order of magnitude", () => {
    // The thing the logarithmic version could not do: the same hundred
    // records move the water the same distance wherever it already is.
    expect(waterFill(400) - waterFill(300)).toBe(1);
    expect(waterFill(5_400) - waterFill(5_300)).toBe(1);
  });

  it("never goes down as the count goes up", () => {
    let last = waterFill(0);
    for (const n of [1, 2, 5, 10, 50, 100, 500, 1_000, 5_000, 10_000, 100_000]) {
      expect(waterFill(n)).toBeGreaterThanOrEqual(last);
      last = waterFill(n);
    }
  });

  it("caps at 80", () => {
    expect(FILL_CEILING).toBe(80);
    expect(waterFill(7_900)).toBe(FILL_CEILING);
    expect(waterFill(1_000_000)).toBe(FILL_CEILING);
  });

  /**
   * Pinned because it is a deliberate trade and not an oversight.
   *
   * An unset vessel's murk is 30% and a wrong one is 40% (`globals.css`), so
   * a set vessel with a few hundred records on it draws emptier than a broken
   * one. That was the reason this rule was replaced once; it is back because
   * a water level that means "about this many records" is worth more here
   * than one that is always above the murk. The tag under every node says the
   * state in words, which is what stops the drawing being the only channel.
   *
   * If this ever has to read right at a glance, move the murk down - do not
   * put a floor back on the arithmetic.
   */
  it("reads below the murk at the counts this machine actually has", () => {
    expect(waterFill(266)).toBeLessThan(30);
    expect(waterFill(2_800)).toBeLessThan(30);
    // 2,900 records is where a working vessel finally draws level with an
    // unset one, and 3,900 with a broken one.
    expect(waterFill(2_900)).toBe(30);
    expect(waterFill(3_900)).toBe(40);
  });
});
