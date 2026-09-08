import type { AppConfig } from "../config";
import { UiTestRunner } from "./UiTestRunner";

export { emptyStateChecks, populatedChecks } from "./checks";
export { UiTestRunner, evaluateAssertion, summariseResults } from "./UiTestRunner";
export { describeAssertion, passed } from "./UiCheck";
export type { Assertion, CheckResult, UiCheck } from "./UiCheck";

/**
 * Builds a runner from config. One call, same shape as the observability module.
 *
 * Every check here is measured locally in a real browser - contrast, overflow,
 * font size, a missing heading, a zero where there is no answer. Nothing is
 * sent anywhere and no model is asked anything, which is what lets this module
 * be deleted at the cost of one import and one line.
 */
export function createUiTestRunner(
  config: AppConfig,
  baseUrl: string,
  /**
   * Keep a PNG of every check, not only the failures.
   *
   * Off by default because a passing run should not write 44 files. On when
   * someone is looking at the design rather than at the assertions - which is
   * the only way to see a page that passes, and the reason the option existed
   * unwired for as long as it did.
   */
  keepAllScreenshots = false,
): UiTestRunner {
  return new UiTestRunner({ baseUrl, screenshotDir: config.uiScreenshotDir, keepAllScreenshots });
}
