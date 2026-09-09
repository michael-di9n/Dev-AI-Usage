import { describe, expect, it } from "vitest";
import {
  BANNER_ROWS,
  banner,
  glitch,
  tapLines,
  tapState,
  waterFill,
  type TapLine,
  type TapRecord,
} from "../src/domain/traceTap";
import { localTime } from "../src/domain/localClock";

/**
 * The window on the trace terminus.
 *
 * Three things here are worth a test and the drawing is not. Whether a row
 * misreports a record, whether the empty state can call a working receiver
 * dead, and whether the sign stays legible - the first two are correctness and
 * the third is the only reason the sign is generated rather than typed out.
 */

const FIXTURE_TS = "2026-09-08T04:12:33.481Z";

const record = (over: Partial<TapRecord> = {}): TapRecord => ({
  ts: FIXTURE_TS,
  name: "user_prompt",
  sessionId: "2dd3fbcc-9f21-4a1e-b0f1-0c9a77f2e311",
  attrs: { model: "claude-opus-5", prompt: "hello" },
  ...over,
});

const line = (over: Partial<TapLine> = {}): TapLine => ({
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
   * The split that stops the window lying. Metrics set and logs not is a real
   * and common configuration, and a receiver holding 40,000 metric points is
   * not a receiver that has heard nothing - telling that reader their setup is
   * dead, above a tally counting what arrived, would be the page contradicting
   * itself.
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
  it("is 1% for anything under a hundred, including zero", () => {
    expect(waterFill(0)).toBe(1);
    expect(waterFill(1)).toBe(1);
    expect(waterFill(99)).toBe(1);
  });

  it("adds one point per hundred after that", () => {
    expect(waterFill(100)).toBe(2);
    expect(waterFill(199)).toBe(2);
    expect(waterFill(200)).toBe(3);
    expect(waterFill(1_000)).toBe(11);
  });

  it("caps at 80, whatever the count", () => {
    expect(waterFill(7_900)).toBe(80);
    expect(waterFill(50_000)).toBe(80);
  });
});
