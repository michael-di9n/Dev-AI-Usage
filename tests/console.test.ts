import { describe, expect, it } from "vitest";
import { BANDS, BYTES, COUNT, KNOB_ANGLE, bandOf, bytes, ruleOf } from "../src/domain/console";

/**
 * The Setup dials.
 *
 * Two things are being pinned here. The first is the project's pair of rules
 * meeting on one instrument: a measured zero points at NONE, an unmeasured
 * figure has no pointer at all. Those are one line apart in the code and mean
 * opposite things, and a dial cannot show the difference by accident.
 *
 * The second is that there are two tables and not four. The AI maturity bands
 * were a ladder per capability once and had to be torn out for it, so the
 * moment "files kept" and "files expired" stop sharing a scale, this fails.
 */

describe("a measured zero and a missing figure are different readings", () => {
  it("bands a measured zero as none", () => {
    expect(bandOf(0, COUNT)).toBe("none");
    expect(bandOf(0, BYTES)).toBe("none");
  });

  it("gives an unmeasured figure no band at all", () => {
    expect(bandOf(null, COUNT)).toBeNull();
    expect(bandOf(Number.NaN, COUNT)).toBeNull();
  });
});

describe("the count table", () => {
  it("puts anything above zero and under a hundred in low", () => {
    expect(bandOf(1, COUNT)).toBe("low");
    expect(bandOf(99, COUNT)).toBe("low");
  });

  it("starts medium at its own threshold, not one past it", () => {
    expect(bandOf(100, COUNT)).toBe("medium");
    expect(bandOf(999, COUNT)).toBe("medium");
  });

  it("starts high at a thousand and stays there", () => {
    expect(bandOf(1_000, COUNT)).toBe("high");
    expect(bandOf(4_500_000, COUNT)).toBe("high");
  });
});

describe("the byte table", () => {
  const MB = 1024 * 1024;

  it("bands by size, on its own thresholds", () => {
    expect(bandOf(400, BYTES)).toBe("low");
    expect(bandOf(10 * MB - 1, BYTES)).toBe("low");
    expect(bandOf(10 * MB, BYTES)).toBe("medium");
    expect(bandOf(250 * MB - 1, BYTES)).toBe("medium");
    expect(bandOf(250 * MB, BYTES)).toBe("high");
  });

  it("writes a size a reader can hold", () => {
    expect(bytes(512)).toBe("512 B");
    expect(bytes(2 * 1024)).toBe("2 kB");
    expect(bytes(40_500_000)).toBe("38.6 MB");
    expect(bytes(3 * 1024 * MB)).toBe("3.00 GB");
  });
});

describe("the rule is printable", () => {
  /**
   * The dials print this beside them. A band named without the arithmetic it
   * was read off is a grade, and the panel gives readings.
   */
  it("names where each band starts", () => {
    expect(ruleOf(COUNT)).toBe("low under 100 · medium under 1,000 · high 1,000 and over");
    expect(ruleOf(BYTES)).toBe("low under 10.0 MB · medium under 250.0 MB · high 250.0 MB and over");
  });

  it("bands every count the same way, whatever the dial is counting", () => {
    // Transcripts kept and transcripts expired are both counts. If a second
    // count scale appears, this is the line that says so.
    expect(COUNT.medium).toBe(100);
    expect(COUNT.high).toBe(1_000);
  });
});

describe("the pointer", () => {
  it("has a detent for every band, and they are in order round the dial", () => {
    const angles = BANDS.map((b) => KNOB_ANGLE[b]);
    expect(angles).toHaveLength(BANDS.length);
    expect([...angles].sort((a, b) => a - b)).toEqual(angles);
  });

  it("leaves the bottom of the dial empty, so up is unambiguous", () => {
    const span = KNOB_ANGLE.high - KNOB_ANGLE.none;
    expect(span).toBeLessThan(360);
    expect(span).toBe(270);
  });
});
