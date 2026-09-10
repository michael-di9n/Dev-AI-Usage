import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The stylesheet's own tests.
 *
 * Two jobs. First, catch what CSS cannot: `var(--gone)` does not error, it
 * silently resolves to nothing, so a renamed token turns a chart grey while the
 * build stays green. That happened, which is why these exist.
 *
 * Second, hold the contrast floor for every theme at author time. The UI checks
 * re-measure it in a real browser, but that needs a running server and only
 * covers the pages it visits. This covers every pair in every theme, in both
 * modes, in a few milliseconds.
 */

const CSS_PATH = "src/app/globals.css";
const css = () => readFileSync(CSS_PATH, "utf8");

const styleSources = () => [...globSync("src/**/*.css"), ...globSync("src/**/*.tsx")];

/** Tokens that carry colour and must therefore be defined by the palette. */
const THEMED_TOKENS = [
  "--ground", "--panel", "--shade", "--line", "--line-soft",
  "--text", "--muted",
  "--accent", "--accent-deep", "--accent-tint", "--accent-strong", "--rail",
  "--ok-fg", "--ok-bg", "--busy-fg", "--busy-bg",
  "--warn-fg", "--warn-bg", "--high-fg", "--high-bg",
  "--gold-fg", "--gold-bg", "--silver-fg", "--silver-bg",
  "--bronze-fg", "--bronze-bg", "--murk",
  "--coin", "--coin-edge", "--coin-line",
  "--term-bg", "--term-line", "--term-fg", "--term-dim", "--term-key",
  "--term-metric", "--term-span",
  "--decode",
  "--fascia", "--fascia-edge", "--engrave", "--engrave-dim",
  "--knob-face", "--knob-rim", "--pointer", "--recess",
  "--sheet", "--sheet-ink", "--sheet-rule",
  "--mix-1", "--mix-2", "--mix-3", "--mix-4",
  "--ink-1", "--ink-2", "--ink-3", "--ink-4",
  "--step-user", "--step-tool", "--step-mcp", "--step-skill", "--step-subagent",
];

/** Sizing rather than colour, so exempt from the light/dark pair requirement. */
const SHARED_TOKENS = new Set(["--radius", "--rail-w"]);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * The palette block: the first `:root {` that declares a colour token.
 *
 * There is one palette now, so this is looked up by content rather than by a
 * selector naming it. The second `:root {` in the file carries sizing and
 * `color-scheme`, which is why the search is for a colour token and not just
 * for the selector.
 */
function paletteBlock(): string {
  const text = css();
  const start = text.indexOf(":root {\n  --ground");
  expect(start, "no :root block declaring --ground").toBeGreaterThan(-1);
  return text.slice(start, text.indexOf("\n}", start));
}

/** `light-dark(#aaa, #bbb)` -> the two hex values. */
function pairsIn(block: string): Map<string, [string, string]> {
  const pairs = new Map<string, [string, string]>();
  for (const m of block.matchAll(
    /(--[a-z0-9-]+)\s*:\s*light-dark\(\s*(#[0-9a-fA-F]{3,8})\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g,
  )) {
    pairs.set(m[1]!, [m[2]!, m[3]!]);
  }
  return pairs;
}

const definedTokens = (): Set<string> =>
  new Set([...css().matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));

function usedTokens(): Map<string, string[]> {
  const uses = new Map<string, string[]>();
  for (const file of styleSources()) {
    for (const m of readFileSync(file, "utf8").matchAll(/var\((--[a-z0-9-]+)/g)) {
      uses.set(m[1]!, [...(uses.get(m[1]!) ?? []), file]);
    }
  }
  return uses;
}

// ---------------------------------------------------------------------------
// Contrast
// ---------------------------------------------------------------------------

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * sRGB -> OKLab.
 *
 * Contrast is the wrong tool for two categorical slices: it measures lightness
 * only, so the blue and the teal that started this - identical in luminance
 * and 9.6 apart to the eye - scored a perfect 1.00:1 against each other and
 * passed every check in this file. OKLab is perceptually uniform, so plain
 * euclidean distance in it is a usable stand-in for "can a reader tell these
 * apart", which is the thing a categorical palette has to promise.
 */
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Perceptual distance, x100 so the numbers read like the dE everyone quotes. */
function perceptualDistance(a: string, b: string): number {
  const [al, aa, ab] = oklab(a);
  const [bl, ba, bb] = oklab(b);
  return Math.hypot(al - bl, aa - ba, ab - bb) * 100;
}

/** WCAG AA for body text. Every pair below is body-sized somewhere in the UI. */
const AA = 4.5;

/** [foreground, background] token pairs that appear together on screen. */
const PAIRS: [string, string][] = [
  ["--text", "--ground"], ["--text", "--panel"], ["--text", "--shade"],
  ["--muted", "--ground"], ["--muted", "--panel"], ["--muted", "--shade"],
  ["--accent", "--ground"], ["--accent", "--panel"],
  ["--accent-strong", "--accent-tint"],
  ["--ok-fg", "--ok-bg"], ["--busy-fg", "--busy-bg"],
  ["--warn-fg", "--warn-bg"], ["--high-fg", "--high-bg"],
  // The usage band's three medals, each on its own chip.
  ["--gold-fg", "--gold-bg"], ["--silver-fg", "--silver-bg"],
  ["--bronze-fg", "--bronze-bg"],
  // The same two metals again, this time as the delta arrow. It is body text
  // on a panel or a tile, so it owes the full text floor on both surfaces -
  // the medal chips it shares a token with prove nothing about these.
  ["--gold-fg", "--panel"], ["--gold-fg", "--shade"],
  ["--bronze-fg", "--panel"], ["--bronze-fg", "--shade"],
  // A figure part-way through decoding itself in. It is body text, briefly
  // unreadable would be a real cost, and the chips it appears on wear --shade
  // rather than --panel - which is the tighter of the two pairs.
  ["--decode", "--shade"], ["--decode", "--panel"],
  // The cost chips print their class's figure, not just a glyph in it, so each
  // ink owes the text floor on the surface a chip wears.
  ["--ink-1", "--shade"], ["--ink-2", "--shade"],
  ["--ink-3", "--shade"], ["--ink-4", "--shade"],
  // The stale-figures warning, which sits in the top bar on the page ground.
  ["--warn-fg", "--ground"], ["--warn-fg", "--panel"],
  // The lapsed-cache figure: a 29px number on a tile, and the same token
  // drawing its chart. Body-sized nowhere, but it is the one red thing on the
  // dashboard and a red nobody can read states nothing at all.
  ["--high-fg", "--shade"], ["--high-fg", "--panel"],
  // The maturity band, written beside its seal on the page ground. The seal
  // proves nothing about these: it is a shape on its own tinted face and owes
  // only the graphic floor, while the word is body text on --ground. It is
  // also the only channel that survives greyscale, so it is the one that has
  // to be legible.
  // (--muted on --ground is already above; the metals were not.)
  ["--busy-fg", "--ground"], ["--gold-fg", "--ground"],
  ["--silver-fg", "--ground"], ["--bronze-fg", "--ground"],
  // The Setup fascia. Every word silkscreened on the plate, and every word
  // typed on the sheet slipped into it.
  //
  // --engrave-dim is the reason this block exists rather than reusing --muted
  // for the plate's quiet lines: --muted on --fascia measures 4.23:1 in light
  // mode, under AA, and it would have looked correct to anyone writing it.
  ["--engrave", "--fascia"], ["--engrave-dim", "--fascia"],
  // The recess: the appearance selector's track, and the chip a path or a
  // command is set in. A key's legend and a filename both sit on it.
  ["--engrave", "--recess"], ["--engrave-dim", "--recess"],
  ["--sheet-ink", "--sheet"],
  // The lamp's state is written beside the bulb, so the word owes the text
  // floor on the plate even though the bulb only owes the graphic one.
  ["--ok-fg", "--fascia"],
  // The trace-tap's three inks, each the name of a record on the terminal's
  // own ground. Body-sized rows, and the word is what a colour-blind reader
  // gets, so all three owe the text floor there - the key already did.
  ["--term-key", "--term-bg"], ["--term-metric", "--term-bg"], ["--term-span", "--term-bg"],
  // The word in a lit terminus: the panel's colour on the accent water, which
  // is also what the word paints behind itself for the browser probe.
  ["--panel", "--accent"],
];

/**
 * WCAG's floor for a meaningful graphic, which is what the coin stack is.
 *
 * Lower than the text floor because a shape needs less separation than a
 * letterform to be identified - but it is still a floor, not an exemption. A
 * stack you cannot count is a stack that does nothing.
 */
const NON_TEXT = 3;

/** Graphic parts, and the surface they are drawn on. */
const GRAPHIC_PAIRS: [string, string][] = [
  ["--coin", "--panel"], ["--coin-edge", "--panel"], ["--coin-line", "--panel"],
  // The lapsed-cache trend line, drawn on the panel it sits in.
  ["--high-fg", "--panel"],
  // The model mix. Each slice is a bar segment on the hero card and the same
  // token colours that model's glyph in the rows below it. The palette comment
  // claimed this file measured them; until it appeared here, it did not.
  ["--mix-1", "--panel"], ["--mix-2", "--panel"],
  ["--mix-3", "--panel"], ["--mix-4", "--panel"],
  // The trace path's five step kinds. Each colours a glyph and a chip edge on
  // the panel, which is a meaningful graphic and owes the same floor.
  ["--step-user", "--panel"], ["--step-tool", "--panel"], ["--step-mcp", "--panel"],
  ["--step-skill", "--panel"], ["--step-subagent", "--panel"],
];

/**
 * The separation two categorical neighbours need, as OKLab dE x100.
 *
 * Below this a reader with full colour vision cannot reliably tell two slices
 * apart, which makes the hue decorative rather than an encoding. The mix
 * carries a glyph and a written name as well, so colour is never the only
 * channel here - but a channel that does not work is not worth the ink, and
 * the first version of these four sat at 9.6 in dark mode.
 */
const CATEGORICAL_DE = 15;

/**
 * How far a chip's ink may sit from the segment colour it stands for.
 *
 * Below the 15 two neighbouring slices need to be told apart, on purpose: this
 * is the distance at which two marks still read as the same colour, not the
 * distance at which they read as different ones.
 */
const INK_DRIFT = 12;

/**
 * The five step kinds, and the floors their palette comment claims.
 *
 * Separate from the mix because the two are asked different questions. A mix
 * slice is drawn in a fixed order and only ever touches its neighbours, so
 * adjacent pairs are the honest pairlist. A step chip's neighbour is whatever
 * the run did next, so any two of the five can end up side by side and every
 * pair has to separate.
 */
const STEP_TOKENS = [
  "--step-user", "--step-tool", "--step-mcp", "--step-skill", "--step-subagent",
] as const;

/**
 * The separation two kinds need under red-green colour blindness.
 *
 * Full colour vision is not the binding constraint on a five-hue set - a green
 * and a rose can sit 20 apart for most readers and collapse to nothing for the
 * ~5% of men with deuteranopia, which is what happened to the first set tried
 * here: dE 2.4. The fix is lightness, not hue, and this is the assertion that
 * forces it.
 */
const CVD_DE = 8;

/** Chroma below which a colour reads as grey rather than as an identity. */
const CHROMA_FLOOR = 0.1;

/**
 * Protanopia and deuteranopia, as linear-RGB matrices.
 *
 * Tritanopia is left out deliberately: it is far rarer, and the set is checked
 * by hand against it rather than gated, because forcing it as well over five
 * hues costs more separation than it buys.
 */
const CVD: Record<"protan" | "deutan", number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868],
           [0.114503, 0.786281, 0.099216],
           [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968],
           [0.280085, 0.672501, 0.047413],
           [-0.011820, 0.042940, 0.968881]],
};

/** A hex as linear RGB, which is the space the CVD matrices act in. */
function linear(hex: string): [number, number, number] {
  return channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

function oklabOfLinear([r, g, b]: [number, number, number]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** The same colour as a reader with this deficiency sees it, in OKLab. */
function asSeen(hex: string, kind: "protan" | "deutan"): [number, number, number] {
  const lin = linear(hex);
  const seen = CVD[kind].map((row) =>
    Math.max(0, Math.min(1, row[0]! * lin[0] + row[1]! * lin[1] + row[2]! * lin[2])),
  ) as [number, number, number];
  return oklabOfLinear(seen);
}

const between = (a: [number, number, number], b: [number, number, number]): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;

/** OKLCH chroma - how far the colour is from the grey axis. */
function chroma(hex: string): number {
  const [, a, b] = oklab(hex);
  return Math.hypot(a, b);
}

const MODE_INDEX = { light: 0, dark: 1 } as const;

// ---------------------------------------------------------------------------

describe("custom properties", () => {
  it("every var() refers to a token that exists", () => {
    const defined = definedTokens();
    const broken = [...usedTokens()]
      .filter(([token]) => !defined.has(token))
      .map(([token, files]) => `${token} (used in ${files.join(", ")})`);
    expect(broken).toEqual([]);
  });

  it("defines no token nothing uses", () => {
    const used = new Set(usedTokens().keys());
    expect([...definedTokens()].filter((t) => !used.has(t))).toEqual([]);
  });
});

describe("the palette", () => {
  it("is declared exactly once, so nothing can override it per-page", () => {
    // A second palette selector is how the four-theme version worked. If one
    // reappears, "only Tide" has quietly stopped being true.
    expect(css()).not.toContain("data-theme");
  });

  it("defines every colour token", () => {
    const pairs = pairsIn(paletteBlock());
    expect(THEMED_TOKENS.filter((t) => !pairs.has(t))).toEqual([]);
  });

  it("declares each colour token once, as a light and dark pair", () => {
    const block = paletteBlock();
    const declared = [...block.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!);
    const themed = declared.filter((t) => !SHARED_TOKENS.has(t));
    // A token declared twice in one block means an edit half-applied.
    expect(new Set(themed).size, "a token is declared twice").toBe(themed.length);
    expect(pairsIn(block).size).toBe(themed.length);
  });

  it("uses different values for light and dark", () => {
    for (const [token, [light, dark]] of pairsIn(paletteBlock())) {
      expect(light.toLowerCase(), token).not.toBe(dark.toLowerCase());
    }
  });
});

describe("light-dark() can actually resolve", () => {
  it("opts the document into both schemes", () => {
    expect(css()).toContain("color-scheme: light dark");
  });

  it("pins a mode so the picker can override the system setting", () => {
    expect(css()).toContain('[data-mode="light"] { color-scheme: only light; }');
    expect(css()).toContain('[data-mode="dark"]  { color-scheme: only dark; }');
  });

  it("paints the body from tokens rather than inheriting a colour", () => {
    const body = css().slice(css().indexOf("\nbody {"));
    expect(body.slice(0, 200)).toContain("background: var(--ground)");
    expect(body.slice(0, 200)).toContain("color: var(--text)");
  });
});

describe("the palette clears WCAG AA in both modes", () => {
  for (const mode of ["light", "dark"] as const) {
    it(`tide / ${mode}`, () => {
      const pairs = pairsIn(paletteBlock());
      const failures: string[] = [];

      for (const [fg, bg] of PAIRS) {
        const ratio = contrast(pairs.get(fg)![MODE_INDEX[mode]], pairs.get(bg)![MODE_INDEX[mode]]);
        if (ratio < AA) failures.push(`${fg} on ${bg} = ${ratio.toFixed(2)}:1`);
      }

      // The rail is the one surface that always carries white text.
      const railRatio = contrast("#ffffff", pairs.get("--rail")![MODE_INDEX[mode]]);
      if (railRatio < AA) failures.push(`white on --rail = ${railRatio.toFixed(2)}:1`);

      // The primary button paints --ground over --accent, which is the same
      // measured pair the other way up - see the comment on .btn.
      const btnRatio = contrast(pairs.get("--ground")![MODE_INDEX[mode]], pairs.get("--accent")![MODE_INDEX[mode]]);
      if (btnRatio < AA) failures.push(`--ground on --accent = ${btnRatio.toFixed(2)}:1`);

      expect(failures).toEqual([]);
    });
  }

  for (const mode of ["light", "dark"] as const) {
    it(`graphics stay discernible / ${mode}`, () => {
      const pairs = pairsIn(paletteBlock());
      const failures: string[] = [];

      for (const [fg, bg] of GRAPHIC_PAIRS) {
        const ratio = contrast(pairs.get(fg)![MODE_INDEX[mode]], pairs.get(bg)![MODE_INDEX[mode]]);
        if (ratio < NON_TEXT) failures.push(`${fg} on ${bg} = ${ratio.toFixed(2)}:1`);
      }

      // The rim has to differ from the face, or a coin reads as a flat disc
      // and the stack loses the only cue that says how many are in it.
      const [face, edge] = [pairs.get("--coin")!, pairs.get("--coin-edge")!].map(
        (p) => p[MODE_INDEX[mode]],
      ) as [string, string];
      if (contrast(face, edge) < 1.4) {
        failures.push(`--coin on --coin-edge = ${contrast(face, edge).toFixed(2)}:1`);
      }

      expect(failures).toEqual([]);
    });
  }

  /*
   * A chip and its segment have to look like the same thing.
   *
   * The ink exists because the mix does not clear the text floor everywhere;
   * it stops being worth having the moment it stops looking like the mix. This
   * is the guard on that: if `--mix-2` is ever retuned and `--ink-2` is not,
   * the chip quietly starts naming a colour the bar no longer draws.
   */
  for (const mode of ["light", "dark"] as const) {
    it(`every chip ink still reads as its own segment / ${mode}`, () => {
      const pairs = pairsIn(paletteBlock());
      const drifted = [1, 2, 3, 4]
        .map((n) => {
          const dE = perceptualDistance(
            pairs.get(`--ink-${n}`)![MODE_INDEX[mode]],
            pairs.get(`--mix-${n}`)![MODE_INDEX[mode]],
          );
          return [n, dE] as const;
        })
        .filter(([, dE]) => dE > INK_DRIFT)
        .map(([n, dE]) => `--ink-${n} vs --mix-${n} = dE ${dE.toFixed(1)}`);
      expect(drifted).toEqual([]);
    });
  }

  for (const mode of ["light", "dark"] as const) {
    it(`keeps two model slices telling themselves apart / ${mode}`, () => {
      const pairs = pairsIn(paletteBlock());
      const mix = [1, 2, 3, 4].map((n) => pairs.get(`--mix-${n}`)![MODE_INDEX[mode]]);

      // Adjacent pairs only, which is what the bar actually asks a reader to
      // separate: the slices are drawn largest-first and every neighbour
      // touches across a 2px gap. Slot 1 against slot 4 never shares an edge.
      const failures: string[] = [];
      for (let i = 0; i < mix.length - 1; i++) {
        const dE = perceptualDistance(mix[i]!, mix[i + 1]!);
        if (dE < CATEGORICAL_DE) {
          failures.push(`--mix-${i + 1} vs --mix-${i + 2} = dE ${dE.toFixed(1)}`);
        }
      }

      expect(failures).toEqual([]);
    });
  }
});

/**
 * The trace path's five kinds.
 *
 * Every floor its palette comment names is measured here. The comment on the
 * mix above it was written before this file measured those, and said so for a
 * while; this exists so the same thing is not true twice.
 */
describe("the trace path's five kinds tell themselves apart", () => {
  for (const mode of ["light", "dark"] as const) {
    it(`no kind reads grey / ${mode}`, () => {
      const pairs = pairsIn(paletteBlock());
      const flat = STEP_TOKENS
        .map((t) => [t, pairs.get(t)![MODE_INDEX[mode]]] as const)
        .filter(([, hex]) => chroma(hex) < CHROMA_FLOOR)
        .map(([t, hex]) => `${t} = C ${chroma(hex).toFixed(3)}`);
      expect(flat).toEqual([]);
    });
  }

  for (const mode of ["light", "dark"] as const) {
    it(`every pair separates for a reader with full colour vision / ${mode}`, () => {
      const pairs = pairsIn(paletteBlock());
      const failures: string[] = [];

      // EVERY pair, not adjacent ones: a step's neighbour in the strip is
      // whatever the run did next, so all ten combinations appear on screen.
      for (let i = 0; i < STEP_TOKENS.length; i++) {
        for (let j = i + 1; j < STEP_TOKENS.length; j++) {
          const [a, b] = [STEP_TOKENS[i]!, STEP_TOKENS[j]!];
          const dE = perceptualDistance(
            pairs.get(a)![MODE_INDEX[mode]],
            pairs.get(b)![MODE_INDEX[mode]],
          );
          if (dE < CATEGORICAL_DE) failures.push(`${a} vs ${b} = dE ${dE.toFixed(1)}`);
        }
      }

      expect(failures).toEqual([]);
    });
  }

  for (const mode of ["light", "dark"] as const) {
    it(`every pair survives red-green colour blindness / ${mode}`, () => {
      const pairs = pairsIn(paletteBlock());
      const failures: string[] = [];

      for (let i = 0; i < STEP_TOKENS.length; i++) {
        for (let j = i + 1; j < STEP_TOKENS.length; j++) {
          const [a, b] = [STEP_TOKENS[i]!, STEP_TOKENS[j]!];
          const [ha, hb] = [pairs.get(a)![MODE_INDEX[mode]], pairs.get(b)![MODE_INDEX[mode]]];
          for (const kind of ["protan", "deutan"] as const) {
            const dE = between(asSeen(ha, kind), asSeen(hb, kind));
            if (dE < CVD_DE) failures.push(`${a} vs ${b} under ${kind} = dE ${dE.toFixed(1)}`);
          }
        }
      }

      expect(failures).toEqual([]);
    });
  }
});

describe("layout promises the UI checks depend on", () => {
  it("keeps wide tables scrolling inside their own box, not the page", () => {
    expect(css()).toContain(".panel-scroll { overflow-x: auto; }");
  });

  it("turns the rail into a horizontal bar on a phone", () => {
    const phone = css().slice(css().indexOf("@media (max-width: 760px)"));
    expect(phone).toContain("flex-direction: row");
  });

  it("gives focus a visible outline for keyboard users", () => {
    expect(css()).toContain(":focus-visible");
  });

  /**
   * The badge chips paint a foreground on a tinted background of their own, so
   * anything nested inside one that names its own colour is a pair this file
   * never measured. That happened: --muted on the badge tint came out at
   * 4.46:1 in a browser, under AA, with every declared pair still passing.
   */
  it("lets nothing inside a badge chip pick its own colour", () => {
    const block = css().slice(css().indexOf(".badge-icon"), css().indexOf("@media (max-width: 760px)"));
    const named = [...block.matchAll(/color:\s*var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
    expect(named, "use color: inherit inside a badge, or add the pair to PAIRS").toEqual([]);
  });

  it("sets no text below the readable floor", () => {
    const tooSmall = [...css().matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)]
      .map((m) => Number(m[1]))
      .filter((px) => px < 11);
    expect(tooSmall).toEqual([]);
  });
});

/**
 * Motion.
 *
 * The project's rule is that nothing is said only by moving: an animation is
 * always a second layer over a reading that is already painted underneath, so
 * a reader who asked for stillness loses decoration and never a figure. That
 * rule is only worth having if it is enforced, because the failure is
 * invisible - a page that animates for a reader who asked it not to still
 * looks correct to the author.
 */
describe("every animation is optional", () => {
  /** Comments blanked rather than removed, so offsets still line up. */
  const code = () => css().replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));

  const GUARD = "@media (prefers-reduced-motion: no-preference)";

  /** The character span of each reduced-motion block, braces balanced. */
  function guards(text: string): [number, number][] {
    const spans: [number, number][] = [];
    for (let at = text.indexOf(GUARD); at !== -1; at = text.indexOf(GUARD, at + 1)) {
      let depth = 0;
      let i = text.indexOf("{", at);
      for (; i < text.length; i += 1) {
        if (text[i] === "{") depth += 1;
        else if (text[i] === "}" && (depth -= 1) === 0) break;
      }
      spans.push([at, i]);
    }
    return spans;
  }

  const keyframeNames = () =>
    [...code().matchAll(/@keyframes\s+([a-z0-9-]+)/g)].map((m) => m[1]!);

  it("declares no animation outside a reduced-motion guard", () => {
    const text = code();
    const spans = guards(text);
    const loose = [...text.matchAll(/\banimation(?:-name)?\s*:/g)]
      .filter((m) => !spans.some(([from, to]) => m.index! > from && m.index! < to))
      .map((m) => text.slice(Math.max(0, m.index! - 60), m.index! + 40).trim());

    expect(loose, "wrap it in @media (prefers-reduced-motion: no-preference)").toEqual([]);
  });

  it("plays only keyframes it has defined", () => {
    const text = code();
    const defined = keyframeNames();
    const unknown = [...text.matchAll(/\banimation(?:-name)?\s*:([^;}]+)/g)]
      .map((m) => m[1]!)
      .filter((value) => !defined.some((name) => value.includes(name)));

    expect(unknown, "a misspelt keyframe name is silent: nothing moves").toEqual([]);
  });

  /**
   * The medal is the one thing here that moves for its own sake, and the one
   * state it must not move in is the one where there is no rank. A swinging,
   * glinting medal over "No band yet" would be the page looking pleased about
   * a verdict it has just said it cannot give.
   */
  it("never animates the medal nobody was given", () => {
    const text = code();
    const animated = [...text.matchAll(/^\s*([^{}\n]*medal-(?:swing|gleam)[^{}\n]*)\{[^}]*animation/gm)]
      .map((m) => m[1]!.trim())
      .filter((selector) => !selector.includes(":not(.none)"));

    expect(animated, "scope it to .usage-band:not(.none)").toEqual([]);
  });

  it("defines no keyframes nothing plays", () => {
    const text = code();
    const orphans = keyframeNames().filter(
      (name) => text.split(name).length - 1 <= text.split(`@keyframes ${name}`).length - 1,
    );
    expect(orphans).toEqual([]);
  });
});
