import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright-core";
import { probeScript, type ProbeFindings } from "../src/ui-testing/PageProbe";
import { evaluateAssertion, summariseResults } from "../src/ui-testing/UiTestRunner";
import { emptyStateChecks, PAGES, populatedChecks } from "../src/ui-testing/checks";
import { describeAssertion, passed, type Assertion, type CheckResult } from "../src/ui-testing/UiCheck";

const findings = (over: Partial<ProbeFindings> = {}): ProbeFindings => ({
  hasHeading: true,
  scrollsSideways: false,
  visibleText: "derived cost published rates",
  linksWithoutText: [],
  worstContrast: { ratio: 7.1, sample: "body" },
  smallestFontPx: { px: 13, sample: "body" },
  missingSelectors: [],
  rootAttributes: { lang: "en" },
  ...over,
});

describe("evaluateAssertion", () => {
  const check = (a: Assertion, f: ProbeFindings) => evaluateAssertion(a, f);

  it("passes when the required text is present, case-insensitively", () => {
    const a: Assertion = { kind: "text", contains: "Published Rates", why: "w" };
    expect(check(a, findings()).passed).toBe(true);
  });

  it("fails and says what was missing", () => {
    const a: Assertion = { kind: "text", contains: "second opinion", why: "w" };
    const result = check(a, findings());
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("never says");
  });

  it("fails an `absent` assertion when the forbidden text appears", () => {
    const a: Assertion = { kind: "absent", text: "$0.00", why: "w" };
    expect(check(a, findings({ visibleText: "derived cost $0.00" })).passed).toBe(false);
    expect(check(a, findings()).passed).toBe(true);
  });

  it("reports sideways scrolling", () => {
    const a: Assertion = { kind: "noHorizontalScroll", why: "w" };
    expect(check(a, findings({ scrollsSideways: true })).passed).toBe(false);
  });

  it("requires a heading", () => {
    const a: Assertion = { kind: "hasHeading", why: "w" };
    expect(check(a, findings({ hasHeading: false })).passed).toBe(false);
  });

  it("counts links with no text and shows the first", () => {
    const a: Assertion = { kind: "linksHaveText", why: "w" };
    const result = check(a, findings({ linksWithoutText: ['<a href="/x"></a>'] }));
    expect(result.passed).toBe(false);
    expect(result.detail).toContain('<a href="/x">');
  });

  it("fails contrast below the threshold and names the offending text", () => {
    const a: Assertion = { kind: "minContrast", ratio: 4.5, why: "w" };
    const result = check(a, findings({ worstContrast: { ratio: 3.63, sample: "warn" } }));
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("3.63:1");
    expect(result.detail).toContain("warn");
  });

  it("treats a page with no measurable text as a contrast pass, not a failure", () => {
    const a: Assertion = { kind: "minContrast", ratio: 4.5, why: "w" };
    expect(check(a, findings({ worstContrast: null })).passed).toBe(true);
  });

  it("fails text below the readable floor", () => {
    const a: Assertion = { kind: "minFontSize", px: 11, why: "w" };
    expect(check(a, findings({ smallestFontPx: { px: 10, sample: "0" } })).passed).toBe(false);
    expect(check(a, findings({ smallestFontPx: { px: 11, sample: "0" } })).passed).toBe(true);
  });

  it("fails a selector the probe could not see", () => {
    const a: Assertion = { kind: "visible", selector: ".panel", why: "w" };
    expect(check(a, findings({ missingSelectors: [".panel"] })).passed).toBe(false);
  });

  it("checks an attribute on <html>, which is how a pinned mode is applied", () => {
    const a: Assertion = { kind: "rootAttribute", name: "data-mode", equals: "dark", why: "w" };
    expect(check(a, findings({ rootAttributes: { "data-mode": "dark" } })).passed).toBe(true);
    expect(check(a, findings({ rootAttributes: { "data-mode": "light" } })).passed).toBe(false);
  });

  it("can require an attribute to be absent, for the system default", () => {
    const a: Assertion = { kind: "rootAttribute", name: "data-mode", equals: null, why: "w" };
    expect(check(a, findings({ rootAttributes: {} })).passed).toBe(true);
    expect(check(a, findings({ rootAttributes: { "data-mode": "dark" } })).passed).toBe(false);
  });
});

describe("describeAssertion", () => {
  it("describes every assertion kind in words", () => {
    const all: Assertion[] = [
      { kind: "visible", selector: ".x", why: "w" },
      { kind: "text", contains: "a", why: "w" },
      { kind: "absent", text: "b", why: "w" },
      { kind: "noHorizontalScroll", why: "w" },
      { kind: "hasHeading", why: "w" },
      { kind: "linksHaveText", why: "w" },
      { kind: "minContrast", ratio: 4.5, why: "w" },
      { kind: "minFontSize", px: 11, why: "w" },
      { kind: "rootAttribute", name: "data-mode", equals: "dark", why: "w" },
      { kind: "rootAttribute", name: "data-mode", equals: null, why: "w" },
    ];
    for (const a of all) expect(describeAssertion(a).length).toBeGreaterThan(5);
  });
});

describe("check suites", () => {
  it("covers every page in both colour schemes and at phone width", () => {
    const checks = populatedChecks();
    // From the nav's own list, so a renamed route cannot leave a page
    // uncovered while this still passes against the paths it used to have.
    for (const { path } of PAGES) {
      const forPath = checks.filter((c) => c.path === path);
      expect(forPath.some((c) => c.theme === "light")).toBe(true);
      expect(forPath.some((c) => c.theme === "dark")).toBe(true);
      expect(forPath.some((c) => c.viewport.label === "phone")).toBe(true);
    }
  });

  it("gives every assertion a reason a human can read", () => {
    for (const check of [...populatedChecks(), ...emptyStateChecks()]) {
      for (const a of check.assertions) expect(a.why.length).toBeGreaterThan(20);
    }
  });

  it("asserts the empty state never shows a fabricated zero", () => {
    for (const check of emptyStateChecks()) {
      expect(
        check.assertions.some((a) => a.kind === "absent" && a.text === "$0.00"),
      ).toBe(true);
    }
  });
});

describe("passed / summariseResults", () => {
  const result = (over: Partial<CheckResult> = {}): CheckResult => ({
    check: populatedChecks()[0]!,
    loaded: true,
    assertions: [],
    consoleErrors: [],
    screenshotPath: null,
    ...over,
  });

  it("counts a console error as a failure", () => {
    expect(passed(result({ consoleErrors: ["404"] }))).toBe(false);
  });

  it("counts a page that did not load as a failure", () => {
    expect(passed(result({ loaded: false }))).toBe(false);
  });

  it("counts a failed assertion as a failure", () => {
    expect(
      passed(
        result({
          assertions: [{
            assertion: { kind: "hasHeading", why: "x" },
            passed: false,
            detail: "no h1 or h2 on the page",
          }],
        }),
      ),
    ).toBe(false);
  });

  it("summarises totals", () => {
    expect(
      summariseResults([result(), result({ consoleErrors: ["x"] }), result()]),
    ).toEqual({ total: 3, failed: 1 });
  });
});

/**
 * The probe runs in a browser, so it is exercised in one. These pin the
 * contrast maths against colours whose ratios are known, which is the part
 * that would otherwise be wrong in a way nobody notices.
 */
// Vitest's 5s default is sized for pure functions. The first `newPage` in a
// cold Chrome cost 5002ms on CI and failed this suite on a commit that passed
// on the retry - the browser is the budget here, not the assertion.
describe("probeScript in a real browser", { timeout: 30_000 }, () => {
  let browser: Browser;

  beforeAll(async () => { browser = await chromium.launch({ channel: "chrome", headless: true }); }, 60_000);
  afterAll(async () => { await browser?.close(); });

  const probe = async (html: string, selectors: string[] = []): Promise<ProbeFindings> => {
    const page = await browser.newPage();
    await page.setContent(html);
    const result = (await page.evaluate(probeScript, selectors)) as ProbeFindings;
    await page.close();
    return result;
  };

  it("measures black on white as 21:1", async () => {
    const f = await probe('<body style="background:#fff"><h1 style="color:#000">Hi</h1></body>');
    expect(f.worstContrast?.ratio).toBeCloseTo(21, 0);
    expect(f.hasHeading).toBe(true);
  });

  it("catches the exact contrast failure found on the live page", async () => {
    // #b8791f on white measured 3.63:1 and was the real light-mode bug.
    const f = await probe('<body style="background:#fff"><h2>t</h2><span style="color:#b8791f">warn</span></body>');
    expect(f.worstContrast?.ratio).toBeCloseTo(3.63, 1);
    expect(f.worstContrast?.sample).toBe("warn");
  });

  it("finds the background from an ancestor when the element paints none", async () => {
    const f = await probe(
      '<body style="background:#000"><h2 style="color:#fff">t</h2><div><span style="color:#fff">deep</span></div></body>',
    );
    expect(f.worstContrast!.ratio).toBeGreaterThan(15);
  });

  it("ignores invisible text", async () => {
    const f = await probe(
      '<body style="background:#fff"><h2 style="color:#000">t</h2><span style="display:none;color:#eee">hidden</span></body>',
    );
    expect(f.visibleText).not.toContain("hidden");
    expect(f.worstContrast?.ratio).toBeCloseTo(21, 0);
  });

  it("detects sideways overflow", async () => {
    const wide = await probe('<body style="margin:0"><h2>t</h2><div style="width:3000px">x</div></body>');
    expect(wide.scrollsSideways).toBe(true);

    const fits = await probe('<body style="margin:0"><h2>t</h2><div style="width:100px">x</div></body>');
    expect(fits.scrollsSideways).toBe(false);
  });

  it("finds an empty link even though it collapses to zero size", async () => {
    // The case a visibility gate would miss: still focusable, nothing announced.
    const bare = await probe('<body><h2>t</h2><a href="/x"></a></body>');
    expect(bare.linksWithoutText).toHaveLength(1);
  });

  it("accepts a link labelled by aria-label, title, or an image alt", async () => {
    for (const markup of [
      '<a href="/x" aria-label="Setup"></a>',
      '<a href="/x" title="Setup"></a>',
      '<a href="/x"><img src="i.png" alt="Setup"></a>',
      '<a href="/x">Setup</a>',
    ]) {
      const f = await probe(`<body><h2>t</h2>${markup}</body>`);
      expect(f.linksWithoutText, markup).toHaveLength(0);
    }
  });

  it("ignores a link removed from the accessibility tree", async () => {
    const f = await probe('<body><h2>t</h2><a href="/x" style="display:none"></a></body>');
    expect(f.linksWithoutText).toHaveLength(0);
  });

  it("reports the smallest visible font", async () => {
    const f = await probe('<body><h2 style="font-size:20px">t</h2><span style="font-size:9px">tiny</span></body>');
    expect(f.smallestFontPx).toMatchObject({ px: 9, sample: "tiny" });
  });

  it("reports which required selectors are missing", async () => {
    const f = await probe('<body><h2>t</h2><div class="panel">x</div></body>', [".panel", ".missing"]);
    expect(f.missingSelectors).toEqual([".missing"]);
  });
});
