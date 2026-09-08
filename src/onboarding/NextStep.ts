/**
 * Answers one question: what should this developer do next?
 *
 * A dashboard with no data is the first thing everyone sees, and the honest
 * answer there is not "$0.00" - it is "run the importer". So the state is
 * computed once, in plain terms, and every page asks it before rendering
 * numbers that would otherwise read as findings.
 */

export interface Step {
  /** What to type. Empty when the step is not a command. */
  command: string;
  /** What it does, in one sentence a developer can act on. */
  does: string;
  /** Why it is next. */
  why: string;
}

export interface OnboardingState {
  transcriptsFound: boolean;
  sessions: number;
  /** Null once there is nothing left to set up. */
  nextStep: Step | null;
  /** True while the dashboard would show zeros instead of answers. */
  showGuide: boolean;
}

export interface OnboardingInput {
  transcriptsFound: boolean;
  sessions: number;
}

const IMPORT_STEP: Step = {
  command: "npm run run",
  does: "Imports your Claude Code transcripts and Cursor history.",
  why: "Nothing has been imported yet, so there is nothing to show.",
};

const NO_TRANSCRIPTS_STEP: Step = {
  command: "",
  does: "Point the importer at your Claude Code transcripts.",
  why:
    "No transcript folder was found. If you use Claude Code on this machine, check the Setup page for the path it looked in.",
};

export function decideNextStep(input: OnboardingInput): OnboardingState {
  const nextStep = !input.transcriptsFound && input.sessions === 0
    ? NO_TRANSCRIPTS_STEP
    : input.sessions === 0
      ? IMPORT_STEP
      : null;

  return {
    transcriptsFound: input.transcriptsFound,
    sessions: input.sessions,
    nextStep,
    // One import is enough: every number on the dashboard is read straight
    // from the imported rows, so once sessions exist the numbers are real.
    showGuide: input.sessions === 0,
  };
}

/** The whole setup, in order, for the guide panel. */
export const LEARNING_PATH: { title: string; command: string; detail: string }[] = [
  {
    title: "Import",
    command: "npm run run",
    detail:
      "Reads the transcript files Claude Code already writes, plus Cursor's local history if you have it. Nothing is sent anywhere. Safe to re-run as often as you like.",
  },
  {
    title: "Read the dashboard",
    command: "npm run dev",
    detail:
      "Trends is the money and the time, by day, by project and by tool. Setup is what is connected and what to turn on next.",
  },
  {
    title: "If anything looks wrong",
    command: "npm run doctor",
    detail:
      "Checks every part and says what to fix. Anything optional shows as todo, which is not a failure.",
  },
  {
    title: "Optional: add the five extras",
    command: "open exercises/README.md",
    detail:
      "Per-tool timing, live telemetry, a plain-English note on each run, a model backend that needs no api key, and a reviewer in CI. Each takes a few minutes and the app works fully without them.",
  },
];
