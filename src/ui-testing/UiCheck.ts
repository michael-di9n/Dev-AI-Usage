/**
 * What a UI check is.
 *
 * Every assertion carries a `why`. A UI test that fails with
 * "expected true, got false" tells you nothing about what the user lost, and a
 * failing UX check is only worth having if it explains the harm.
 */

export type Assertion =
  | { kind: "visible"; selector: string; why: string }
  | { kind: "text"; contains: string; why: string }
  /** The important one for this app: a zero shown where there is no answer. */
  | { kind: "absent"; text: string; why: string }
  /**
   * Nothing matching this selector renders.
   *
   * Added for the readiness redesign, where the point of the change is that
   * something is no longer on the page: the requirement cells moved to the
   * tabs that own them, and an `absent` text rule cannot say "no cell of this
   * shape", only "this exact string". A page can quietly grow back.
   */
  | { kind: "absentSelector"; selector: string; why: string }
  | { kind: "noHorizontalScroll"; why: string }
  | { kind: "hasHeading"; why: string }
  | { kind: "linksHaveText"; why: string }
  | { kind: "minContrast"; ratio: number; why: string }
  | { kind: "minFontSize"; px: number; why: string }
  /** An attribute on <html> - how theme and mode are actually applied. */
  | { kind: "rootAttribute"; name: string; equals: string | null; why: string };

export interface Viewport {
  width: number;
  height: number;
  label: string;
}

export const DESKTOP: Viewport = { width: 1440, height: 900, label: "desktop" };
export const LAPTOP: Viewport = { width: 1024, height: 768, label: "laptop" };
export const PHONE: Viewport = { width: 375, height: 812, label: "phone" };

export interface UiCheck {
  name: string;
  path: string;
  viewport: Viewport;
  /** The viewer's system preference, which light-dark() resolves against. */
  theme: "light" | "dark";
  /**
   * Gestures to perform before probing, for checks about behaviour not layout.
   *
   * `click` or `hover`, one per step. Hover exists because not everything on
   * these pages is reachable by clicking any more: the path strip's card
   * follows the cursor and a click on the same chip opens a window instead, so
   * a click-only harness could only ever test the window and would report the
   * card as missing. A feature no gesture in the harness can reach is a
   * feature the suite has quietly stopped covering.
   *
   * `settle` is extra milliseconds after the gesture, on top of waiting for
   * the network to go quiet. Only needed where a control writes and re-renders
   * and the next gesture depends on the result of the last.
   */
  steps?: { click?: string; hover?: string; times?: number; settle?: number }[];
  /**
   * Whether this check lets the page's entry animations play.
   *
   * Defaults to stillness, and that is not laziness about testing motion. A
   * step-less check probes the moment the loading boundary detaches - there is
   * no settle, deliberately, because waiting is how a suite gets slow and
   * flaky. Every animation in this app is inside a
   * `prefers-reduced-motion: no-preference` guard and is decoration over a
   * reading already painted underneath, so with motion off the resting state
   * IS the finished state: the probe measures what the page settles to rather
   * than a frame of it arriving. Without this, a row fading in reads as
   * `opacity: 0` and an unreadable frame of a decode reads as failing
   * contrast, and neither is a bug in the page.
   *
   * `"play"` is for the one check that is about the animation itself, which
   * has to click and settle past it.
   */
  motion?: "reduce" | "play";
  assertions: Assertion[];
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  /** What was actually found, when it failed. */
  detail: string;
}

export interface CheckResult {
  check: UiCheck;
  loaded: boolean;
  assertions: AssertionResult[];
  /** Console errors the page logged while loading. */
  consoleErrors: string[];
  screenshotPath: string | null;
}

export function describeAssertion(a: Assertion): string {
  switch (a.kind) {
    case "visible": return `${a.selector} is visible`;
    case "text": return `page says "${a.contains}"`;
    case "absent": return `page does not say "${a.text}"`;
    case "absentSelector": return `nothing matches ${a.selector}`;
    case "noHorizontalScroll": return "page does not scroll sideways";
    case "hasHeading": return "page has a heading";
    case "linksHaveText": return "every link has readable text";
    case "minContrast": return `text contrast is at least ${a.ratio}:1`;
    case "minFontSize": return `body text is at least ${a.px}px`;
    case "rootAttribute":
      return a.equals === null
        ? `<html> has no ${a.name}`
        : `<html> ${a.name} is "${a.equals}"`;
  }
}

export function passed(result: CheckResult): boolean {
  return (
    result.loaded &&
    result.consoleErrors.length === 0 &&
    result.assertions.every((a) => a.passed)
  );
}
