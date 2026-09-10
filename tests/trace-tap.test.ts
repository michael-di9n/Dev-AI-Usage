import { describe, expect, it } from "vitest";
import {
  BANNER_ROWS,
  FILL_CEILING,
  FILL_FLOOR,
  TAP_KINDS,
  banner,
  formatTapKinds,
  glitch,
  parseTapKinds,
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
  it("never lets a set vessel read emptier than the murk in an unset one", () => {
    // The murk sits at 30% (`.rp-node` in globals.css). A set vessel that has
    // heard nothing yet is a working setting waiting for the next session, and
    // it used to draw as a hairline - lower than a broken node.
    expect(FILL_FLOOR).toBeGreaterThan(30);
    expect(waterFill(0)).toBe(FILL_FLOOR);
    expect(waterFill(1)).toBeGreaterThanOrEqual(FILL_FLOOR);
  });

  it("climbs by the order of magnitude, not by the count", () => {
    expect(waterFill(100)).toBe(58);
    expect(waterFill(1_000)).toBe(67);
    // Each decade is worth the same nine points: ten to a hundred moves the
    // water as far as a hundred to a thousand, and a hundred more records on
    // top of three hundred barely move it - which is what a reader comparing
    // two vessels by eye can and cannot tell apart.
    expect(waterFill(100) - waterFill(10)).toBe(waterFill(1_000) - waterFill(100));
    expect(waterFill(400) - waterFill(300)).toBeLessThanOrEqual(1);
  });

  it("never goes down as the count goes up", () => {
    let last = waterFill(0);
    for (const n of [1, 2, 5, 10, 50, 100, 500, 1_000, 5_000, 10_000, 100_000]) {
      expect(waterFill(n)).toBeGreaterThanOrEqual(last);
      last = waterFill(n);
    }
  });

  it("caps where the crest still fits inside the vessel", () => {
    // `.rp-node.met` says the crest clips above 76%; a fill that said 80 would
    // be one the stylesheet cannot draw.
    expect(FILL_CEILING).toBe(76);
    expect(waterFill(9_999)).toBe(FILL_CEILING);
    expect(waterFill(1_000_000)).toBe(FILL_CEILING);
  });
});
