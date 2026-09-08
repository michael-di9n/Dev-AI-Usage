import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BandChevrons } from "../src/components/BandChevrons";
import { BAND_STEPS, type CapabilityBand } from "../src/domain/readiness";

/**
 * The band chevrons.
 *
 * The glyph is two layers: a scale that never changes, and a fill that counts
 * itself up over the top of it. What these hold is the property that makes
 * animating the second one safe - the scale is always all three positions, the
 * fill is always exactly the band, and the reading is in the accessible name
 * either way. If the fill ever became the only thing drawn, a reader with
 * motion off would be looking at a cell mid-count.
 */
const band = (n: number): CapabilityBand => ({
  band: n,
  name: (["not configured", "bronze", "silver", "gold"] as const)[n] as CapabilityBand["name"],
  instances: n,
  measured: `${n} skills`,
  rule: "2 or 3 is silver",
  next: n === BAND_STEPS ? null : "one more",
});

const render = (n: number) =>
  renderToStaticMarkup(createElement(BandChevrons, { band: band(n), label: "Skills" }));

/** The scale, and the count drawn over it. */
const track = (html: string) => count(section(html, "chev-track"));
const fill = (html: string) => count(section(html, "chev-fill"));

const section = (html: string, cls: string) =>
  html.slice(html.indexOf(`class="${cls}"`), html.indexOf("</g>", html.indexOf(`class="${cls}"`)));
const count = (part: string) => part.match(/<path/g)?.length ?? 0;

describe("BandChevrons", () => {
  it("draws the whole scale at every band, so two cells can be compared", () => {
    for (let n = 0; n <= BAND_STEPS; n += 1) expect(track(render(n))).toBe(BAND_STEPS);
  });

  it("fills exactly the band, and nothing at all when nothing is configured", () => {
    expect(fill(render(0))).toBe(0);
    expect(fill(render(1))).toBe(1);
    expect(fill(render(2))).toBe(2);
    expect(fill(render(3))).toBe(BAND_STEPS);
  });

  it("fills from the bottom up, which is the direction that reads as more", () => {
    // The lowest chevron sits on y=25 and each one above is 8 units higher.
    expect(section(render(1), "chev-fill")).toContain("M3.5 25");
    expect(section(render(1), "chev-fill")).not.toContain("M3.5 17");
    expect(section(render(2), "chev-fill")).toContain("M3.5 17");
  });

  /**
   * The count-up animation is decoration, so the band has to be legible
   * without it - to a screen reader, and to anyone whose first frame is not
   * the finished one.
   */
  it("says the band in words, not only by how many chevrons are lit", () => {
    expect(render(2)).toContain('aria-label="Skills: silver, 2 skills — 2 or 3 is silver"');
    expect(render(0)).toContain('aria-label="Skills: not configured"');
  });

  /**
   * Band 0 is two states, once a capability has a minimum above one - which
   * hooks does, at 3 matchers. Nothing found is "not configured"; two
   * handlers in a settings.json the cell names on the line above is not, and
   * a glyph announcing "not configured" over the top of a path and a count
   * would be the page contradicting itself in adjacent lines.
   */
  it("reads out the count and the minimum when a configured cell is short of bronze", () => {
    const short: CapabilityBand = {
      band: 0,
      name: "none",
      instances: 2,
      measured: "2 handlers",
      rule: "3 handlers is the minimum",
      next: "3 handlers for bronze",
    };
    const html = renderToStaticMarkup(
      createElement(BandChevrons, { band: short, label: "Hooks" }),
    );

    expect(html).toContain('aria-label="Hooks: 2 handlers — 3 handlers is the minimum"');
    expect(html, "there is nothing to light up yet, and the scale still shows it")
      .not.toContain("not configured");
    expect(fill(html)).toBe(0);
    expect(track(html)).toBe(BAND_STEPS);
  });
});
