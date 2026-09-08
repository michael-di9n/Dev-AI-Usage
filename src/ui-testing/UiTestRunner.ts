import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";
import { probeScript, type ProbeFindings } from "./PageProbe";
import {
  passed,
  type Assertion, type AssertionResult, type CheckResult, type UiCheck,
} from "./UiCheck";

export interface RunnerOptions {
  baseUrl: string;
  screenshotDir: string;
  /** Save a PNG for every check, not only failures. Off by default. */
  keepAllScreenshots?: boolean;
}

/**
 * Drives the real pages in a real browser.
 *
 * Uses the Chrome already installed on the machine (`channel: "chrome"`) via
 * playwright-core, so adding UI tests costs no browser download and no CI
 * image change - which is the difference between UI tests that get run and
 * UI tests that get skipped.
 */
export class UiTestRunner {
  constructor(private readonly options: RunnerOptions) {}

  async run(checks: UiCheck[]): Promise<CheckResult[]> {
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const results: CheckResult[] = [];
      for (const check of checks) results.push(await this.runOne(browser, check));
      return results;
    } finally {
      await browser.close();
    }
  }

  private async runOne(browser: Browser, check: UiCheck): Promise<CheckResult> {
    const context = await browser.newContext({
      viewport: { width: check.viewport.width, height: check.viewport.height },
      colorScheme: check.theme,
      // Still by default - see `UiCheck.motion`. The probe measures what the
      // page settles to, not a frame of it arriving.
      reducedMotion: check.motion === "play" ? "no-preference" : "reduce",
    });
    const page = await context.newPage();

    const consoleErrors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push(e.message));

    let loaded = true;
    try {
      const response = await page.goto(`${this.options.baseUrl}${check.path}`, {
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      });
      loaded = response !== null && response.ok();
    } catch {
      loaded = false;
    }

    if (!loaded) {
      await context.close();
      return { check, loaded: false, assertions: [], consoleErrors, screenshotPath: null };
    }

    /*
     * Wait for the page's own loading boundary to go.
     *
     * `domcontentloaded` used to mean the page was there, because every route
     * blocked until its whole render finished. Since the routes gained a
     * `loading.tsx` it means the opposite: the shell arrives immediately and
     * the content streams in behind it, so the first thing in the DOM is the
     * placeholder. Probing then found no tree, no run list and no picker, and
     * reported a working page as broken.
     *
     * The boundary is the signal because it is the app's own - it is in the
     * DOM exactly while the answer is still being worked out. Pages that
     * render straight away have no such element and this resolves at once, so
     * it costs nothing to wait for.
     */
    await page
      .waitForSelector(".page-loading", { state: "detached", timeout: 20_000 })
      .catch(() => {});

    /*
     * Behaviour checks click before probing, and each click has to have landed
     * before the next one is sent.
     *
     * It used to be a flat 60ms, which was true when every clickable thing on
     * these pages was client-side. It is not any more: a control that scopes a
     * page posts a server action, which writes, revalidates and re-renders, and
     * 60ms lands the second click of a pair on the button as it was before the
     * first one took - so a collapse-and-expand pair collapsed twice and the
     * check failed on a page that works.
     *
     * `networkidle` is the real signal and the fixed wait is the backstop: a
     * dev server holds an HMR socket open, so idle is not guaranteed to arrive
     * and waiting forever for it would hang the suite rather than fail it.
     */
    if ((check.steps ?? []).length > 0) {
      /*
       * Wait for the page to be interactive before touching it.
       *
       * The page is opened with `domcontentloaded`, which is right for a
       * layout check and wrong for a behaviour one: clicking before React has
       * hydrated works - a `<summary>` opens natively, a form posts natively -
       * and then hydration finds a DOM that no longer matches the HTML it was
       * given and reports a mismatch. A console error fails a check, so the
       * suite was failing pages that work for anyone who is not a robot.
       */
      await page.waitForLoadState("load").catch(() => {});
      await page.waitForTimeout(400);
    }

    /*
     * A step that cannot run fails its own check and nothing else.
     *
     * It used to throw, which took the whole suite down from inside the loop:
     * one check whose target was not on the page - a trace whose newest run
     * happened to call no tools, so there was no tool row to open - and the
     * other forty-four never ran, with a stack trace where the report should
     * be. A missing target is a real failure and has to be reported as one,
     * but it is one check's failure.
     */
    let stepFailure: string | null = null;

    outer: for (const step of check.steps ?? []) {
      const target = step.click ?? step.hover;
      if (!target) {
        stepFailure = "a step named neither a click nor a hover";
        break outer;
      }

      for (let i = 0; i < (step.times ?? 1); i += 1) {
        try {
          if (step.click) await page.click(step.click, { timeout: 10_000 });
          else await page.hover(step.hover!, { timeout: 10_000 });
        } catch {
          stepFailure = `could not ${step.click ? "click" : "hover"} ${target}`;
          break outer;
        }
        await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});
        await page.waitForTimeout(step.settle ?? 150);
      }
    }

    /* Both selector rules probe the same way; only the verdict differs, so the
       page is asked about all of them in one evaluate. */
    const selectors = check.assertions
      .filter(
        (a): a is Extract<Assertion, { kind: "visible" | "absentSelector" }> =>
          a.kind === "visible" || a.kind === "absentSelector",
      )
      .map((a) => a.selector);

    const findings = (await page.evaluate(probeScript, selectors)) as ProbeFindings;
    // A check whose steps did not run has not tested what it claims to, so
    // every assertion in it fails rather than passing on a page that was never
    // put into the state they describe.
    const assertions = check.assertions.map((a) =>
      stepFailure === null
        ? evaluateAssertion(a, findings)
        : { assertion: a, passed: false, detail: stepFailure },
    );

    const screenshotPath = await this.capture(page, check, assertions, consoleErrors);

    await context.close();
    return { check, loaded, assertions, consoleErrors, screenshotPath };
  }

  /** Failures always get a PNG - it is the first thing anyone wants to see. */
  private async capture(
    page: Page,
    check: UiCheck,
    assertions: AssertionResult[],
    consoleErrors: string[],
  ): Promise<string | null> {
    const failing = assertions.some((a) => !a.passed) || consoleErrors.length > 0;
    if (!failing && !this.options.keepAllScreenshots) return null;

    mkdirSync(this.options.screenshotDir, { recursive: true });
    const name = `${slug(check.name)}-${check.viewport.label}-${check.theme}.png`;
    const path = join(this.options.screenshotDir, name);
    // `caret: "initial"` rather than Playwright's default "hide". Hiding the
    // caret works by injecting `caret-color: transparent` into inputs, which
    // on a page that has one races React's hydration and reports a mismatch as
    // a console error - a failure invented by the act of measuring.
    writeFileSync(path, await page.screenshot({ fullPage: true, type: "png", caret: "initial" }));
    return path;
  }
}

export function evaluateAssertion(a: Assertion, f: ProbeFindings): AssertionResult {
  const result = (ok: boolean, detail = "") => ({ assertion: a, passed: ok, detail });

  switch (a.kind) {
    case "visible":
      return result(!f.missingSelectors.includes(a.selector), `${a.selector} not visible`);

    case "text":
      return result(
        f.visibleText.includes(a.contains.toLowerCase()),
        `page never says "${a.contains}"`,
      );

    case "absent":
      return result(
        !f.visibleText.includes(a.text.toLowerCase()),
        `page says "${a.text}" and should not`,
      );

    case "absentSelector":
      return result(
        f.missingSelectors.includes(a.selector),
        `${a.selector} renders and should not`,
      );

    case "noHorizontalScroll":
      return result(!f.scrollsSideways, "page scrolls sideways");

    case "hasHeading":
      return result(f.hasHeading, "no h1 or h2 on the page");

    case "linksHaveText":
      return result(
        f.linksWithoutText.length === 0,
        `${f.linksWithoutText.length} link(s) with no text: ${f.linksWithoutText[0] ?? ""}`,
      );

    case "minContrast":
      // No measurable text is not a contrast failure; other assertions catch
      // an empty page.
      if (!f.worstContrast) return result(true);
      return result(
        f.worstContrast.ratio >= a.ratio,
        `worst contrast ${f.worstContrast.ratio}:1 on "${f.worstContrast.sample}"`,
      );

    case "minFontSize":
      if (!f.smallestFontPx) return result(true);
      return result(
        f.smallestFontPx.px >= a.px,
        `${f.smallestFontPx.px}px text: "${f.smallestFontPx.sample}"`,
      );

    case "rootAttribute": {
      const actual = f.rootAttributes[a.name] ?? null;
      return result(actual === a.equals, `found ${a.name}=${actual ?? "(absent)"}`);
    }
  }
}

export function summariseResults(results: CheckResult[]): {
  total: number;
  failed: number;
} {
  return {
    total: results.length,
    failed: results.filter((r) => !passed(r)).length,
  };
}

const slug = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
