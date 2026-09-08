import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CoinStack } from "../src/components/CoinStack";

/**
 * The coin stack.
 *
 * A unit chart always rounds down, so the cases that matter are the ones where
 * it could round in silence: a figure that is not yet one coin, a figure past
 * the cap, and no figure at all. Each has to state what it did not draw.
 */

const render = (amountUsd: number | null) =>
  renderToStaticMarkup(createElement(CoinStack, { amountUsd }));

/** One <g> per coin, so counting the solid faces counts the coins. */
const coinsIn = (html: string) => html.match(/var\(--coin\)/g)?.length ?? 0;

describe("CoinStack", () => {
  it("draws one coin per $100 and names the change", () => {
    const html = render(2463.11);

    expect(coinsIn(html)).toBe(24);
    expect(html).toContain("24 coins");
    expect(html).toContain("$100 a coin");
    // The $63.11 that did not become a coin is stated, never dropped - and
    // named as what it is. It was labelled "short of the next" for a while,
    // which is the complement of it: this total is $36.89 short of coin 25.
    expect(html).toContain("$63.11 beyond the last");
    expect(html).not.toContain("short of the next");
  });

  it("says one coin, not one coins", () => {
    expect(render(100)).toContain("1 coin ");
  });

  /**
   * The rule the whole project turns on. A null cost is "no source could
   * answer", which must not draw the same picture as "you spent under $100".
   */
  it("draws no coins and claims no zero when there is no cost figure", () => {
    const html = render(null);

    expect(coinsIn(html)).toBe(0);
    expect(html).toContain("No cost figure for this period");
    expect(html).not.toContain("$0.00");
    expect(html).not.toContain("0 coins");
  });

  it("still states the unit before the first coin is earned", () => {
    const html = render(99.4);

    expect(coinsIn(html)).toBe(0);
    expect(html).toContain("Not yet one coin");
    expect(html).toContain("$99.40 so far");
    // The outlined placeholder, so the unit is visible rather than implied.
    expect(html).toContain("stroke-dasharray");
  });

  /** Past the cap the stack stops being countable, so the number takes over. */
  it("never truncates in silence", () => {
    const html = render(15_600);

    expect(coinsIn(html)).toBe(100);
    expect(html).toContain("100 of 156 coins");
    expect(html).toContain("the stack stops at $10,000");
  });

  /**
   * The SVG carries no accessible name because the caption below it already
   * says the count in words. Announcing both reads the same fact twice.
   */
  it("leaves the count to the caption rather than to the picture", () => {
    const html = render(2463.11);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("<figcaption>");
  });

  /**
   * A ten-column stack is 380 units wide. It must scale rather than push the
   * page sideways, so the viewBox has to be the only place a width is fixed
   * in absolute terms - the stylesheet caps it at 100%.
   */
  it("scales with a viewBox rather than a hard pixel width", () => {
    expect(render(15_600)).toContain('viewBox="0 0 380 96"');
  });

  /**
   * The drop.
   *
   * The delays are data - they depend on how many coins there were - so they
   * are written here rather than in the stylesheet, and that makes them
   * something to hold: the budget is fixed, so the animation cannot quietly
   * become a slow way of saying the figure is large.
   */
  describe("dropping into the stack", () => {
    it("lands them in stacking order, bottom coin first", () => {
      expect(delaysIn(render(350))).toEqual([0, 310, 620]);
    });

    it("takes the same time however many coins there are", () => {
      const few = delaysIn(render(350));
      const many = delaysIn(render(15_600));

      expect(many).toHaveLength(100);
      expect(last(many)).toBe(last(few));
      // Strictly increasing, so no two coins land on the same spot at once.
      expect([...many].sort((a, b) => a - b)).toEqual(many);
    });

    it("does not drop the one coin that was never earned", () => {
      // The outlined placeholder is the shape of a coin, not a coin: dropping
      // it into the stack would animate money that is not there.
      expect(render(99.4)).not.toContain('class="coin"');
      expect(render(null)).not.toContain('class="coin"');
    });
  });
});

/** `--drop:310ms` -> 310. One per coin, in the order the stack was built. */
const delaysIn = (html: string) =>
  [...html.matchAll(/--drop:(\d+)ms/g)].map((m) => Number(m[1]));

const last = (ns: number[]) => ns[ns.length - 1];
