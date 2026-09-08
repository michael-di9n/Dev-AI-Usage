/**
 * The assertions that run inside the page, as one script.
 *
 * Kept as a single serialisable function because it is evaluated in the
 * browser: it cannot close over anything from the Node side, and shipping one
 * script rather than eight round-trips keeps a full check under a second.
 *
 * Exported separately from the runner so its logic is unit-testable against a
 * plain DOM without launching a browser.
 */

export interface ProbeFindings {
  hasHeading: boolean;
  scrollsSideways: boolean;
  /** Every visible text node's content, lowercased, for `absent` assertions. */
  visibleText: string;
  linksWithoutText: string[];
  /** Worst contrast found among visible text, and what produced it. */
  worstContrast: { ratio: number; sample: string } | null;
  smallestFontPx: { px: number; sample: string } | null;
  missingSelectors: string[];
  /** Attributes on <html>: how the theme and mode are applied. */
  rootAttributes: Record<string, string>;
}

/** Runs in the browser. `selectors` is passed in because it varies per check. */
export function probeScript(selectors: string[]): ProbeFindings {
  const doc = document;

  const isVisible = (el: Element): boolean => {
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const parseColor = (value: string): [number, number, number] | null => {
    const match = /rgba?\(([^)]+)\)/.exec(value);
    if (!match) return null;
    const parts = match[1]!.split(",").map((p) => parseFloat(p.trim()));
    const [r, g, b, a] = parts;
    if (r === undefined || g === undefined || b === undefined) return null;
    // A fully transparent colour tells us nothing about what is rendered.
    if (a !== undefined && a < 0.95) return null;
    return [r, g, b];
  };

  const relativeLuminance = ([r, g, b]: [number, number, number]): number => {
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };

  const contrast = (fg: [number, number, number], bg: [number, number, number]): number => {
    const a = relativeLuminance(fg);
    const b = relativeLuminance(bg);
    const [light, dark] = a > b ? [a, b] : [b, a];
    return (light + 0.05) / (dark + 0.05);
  };

  /** Walks up for the first ancestor that actually paints a background. */
  const effectiveBackground = (el: Element): [number, number, number] => {
    let node: Element | null = el;
    while (node) {
      const parsed = parseColor(getComputedStyle(node).backgroundColor);
      if (parsed) return parsed;
      node = node.parentElement;
    }
    return [255, 255, 255];
  };

  let worstContrast: ProbeFindings["worstContrast"] = null;
  let smallestFontPx: ProbeFindings["smallestFontPx"] = null;
  const linksWithoutText: string[] = [];

  for (const el of Array.from(doc.querySelectorAll("body *"))) {
    if (!isVisible(el)) continue;

    // Only elements holding their own text; a wrapper's contrast is its
    // children's problem, and counting it produces noise.
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => (n.textContent ?? "").trim())
      .join(" ")
      .trim();

    if (!ownText) continue;

    const style = getComputedStyle(el);
    const px = parseFloat(style.fontSize);
    if (Number.isFinite(px) && (!smallestFontPx || px < smallestFontPx.px)) {
      smallestFontPx = { px, sample: ownText.slice(0, 50) };
    }

    const fg = parseColor(style.color);
    if (!fg) continue;
    const ratio = contrast(fg, effectiveBackground(el));
    if (!worstContrast || ratio < worstContrast.ratio) {
      worstContrast = { ratio: Math.round(ratio * 100) / 100, sample: ownText.slice(0, 50) };
    }
  }

  // Links are checked separately from the visible-text walk above. An anchor
  // with no content collapses to zero size, so a visibility gate would skip
  // the very case that matters: it is still in the accessibility tree and a
  // keyboard user can land on it with nothing announced.
  for (const link of Array.from(doc.querySelectorAll("a[href]"))) {
    const style = getComputedStyle(link);
    // display:none and visibility:hidden do remove it from the a11y tree.
    if (style.display === "none" || style.visibility === "hidden") continue;

    const label =
      (link.textContent ?? "").trim() ||
      link.getAttribute("aria-label") ||
      link.getAttribute("title") ||
      Array.from(link.querySelectorAll("img[alt]"))
        .map((img) => img.getAttribute("alt") ?? "")
        .join("")
        .trim();

    if (!label) linksWithoutText.push(link.outerHTML.slice(0, 80));
  }

  return {
    hasHeading: doc.querySelector("h1, h2") !== null,
    // One pixel of slop: sub-pixel layout rounding is not a horizontal scroll.
    scrollsSideways: doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 1,
    visibleText: (doc.body.innerText ?? "").toLowerCase(),
    linksWithoutText,
    worstContrast,
    smallestFontPx,
    rootAttributes: Object.fromEntries(
      Array.from(doc.documentElement.attributes).map((a) => [a.name, a.value]),
    ),
    missingSelectors: selectors.filter((s) => {
      const el = doc.querySelector(s);
      return el === null || !isVisible(el);
    }),
  };
}
