import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE, MODES, STORAGE_KEY,
  attributesFor, isMode, nextMode, parseAppearance,
} from "../src/components/themes";

/**
 * The appearance logic, tested away from the browser.
 *
 * All of it runs against whatever is in localStorage, which is a value the app
 * does not control: an old build, a hand-edited entry, or a half-written one.
 * So the rule is that anything unrecognised falls back rather than throwing.
 */

describe("modes", () => {
  it("offers system, light and dark, in that order", () => {
    expect(MODES.map((m) => m.id)).toEqual(["system", "light", "dark"]);
  });

  it("defaults to following the system", () => {
    expect(DEFAULT_APPEARANCE).toEqual({ mode: "system" });
  });
});

describe("nextMode", () => {
  it("cycles all three and returns to the start", () => {
    const visited: string[] = [];
    let current = DEFAULT_APPEARANCE.mode;
    for (let i = 0; i < MODES.length; i += 1) {
      visited.push(current);
      current = nextMode(current);
    }
    expect(visited).toEqual(["system", "light", "dark"]);
    // A full lap must land back on the default, or clicking dead-ends.
    expect(current).toBe("system");
  });
});

describe("parseAppearance", () => {
  it("returns the default for nothing stored", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
  });

  it("reads a valid entry", () => {
    expect(parseAppearance('{"mode":"dark"}')).toEqual({ mode: "dark" });
  });

  /**
   * The four-palette version stored a `theme` alongside the mode, and browsers
   * that used it still have one saved. Discarding someone's light/dark choice
   * over a field that no longer exists would be the worse answer.
   */
  it("keeps the mode from an entry written by the four-theme version", () => {
    expect(parseAppearance('{"theme":"abyss","mode":"dark"}')).toEqual({ mode: "dark" });
  });

  it("falls back on a nonsense mode", () => {
    expect(parseAppearance('{"mode":"sideways"}')).toEqual({ mode: "system" });
  });

  it("survives malformed JSON, a bare value, and an empty string", () => {
    for (const raw of ["{not json", "null", "[]", '"dark"', ""]) {
      expect(parseAppearance(raw), raw).toEqual(DEFAULT_APPEARANCE);
    }
  });
});

describe("attributesFor", () => {
  it("sets no attribute for the default, so light-dark() follows the system", () => {
    expect(attributesFor({ mode: "system" })).toEqual({ mode: null });
  });

  it("pins a mode when one was chosen", () => {
    expect(attributesFor({ mode: "dark" })).toEqual({ mode: "dark" });
    expect(attributesFor({ mode: "light" })).toEqual({ mode: "light" });
  });
});

describe("guards", () => {
  it("recognises only real modes", () => {
    expect(isMode("system")).toBe(true);
    expect(isMode("dark")).toBe(true);
    expect(isMode("auto")).toBe(false);
    expect(isMode(7)).toBe(false);
  });
});

describe("storage key", () => {
  it("is namespaced, so it cannot collide with another app on localhost", () => {
    expect(STORAGE_KEY).toContain("dev-ai-usage");
  });
});
