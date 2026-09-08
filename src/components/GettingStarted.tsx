import { LEARNING_PATH, type OnboardingState } from "../onboarding/NextStep";

/**
 * What a new clone shows instead of a page full of zeros.
 *
 * The numbered path is deliberate: someone arriving here has no idea whether
 * this thing needs an API key, sends their code anywhere, or takes an hour.
 * Answering those three before the first command is what makes it usable.
 */
export function GettingStarted({ state }: { state: OnboardingState }) {
  return (
    <div className="guide">
      <h2 className="guide-h">Nothing imported yet</h2>
      <p className="guide-p">
        This reads files Claude Code already writes on this machine. It needs no API key,
        sends nothing anywhere, and the first import takes a couple of seconds.
      </p>

      {state.nextStep ? (
        <div className="guide-next">
          <div className="guide-next-k">Do this next</div>
          {state.nextStep.command ? (
            <pre className="guide-cmd">{state.nextStep.command}</pre>
          ) : null}
          <p className="guide-p">{state.nextStep.does}</p>
          <p className="guide-p muted">{state.nextStep.why}</p>
        </div>
      ) : null}

      <ol className="guide-steps">
        {LEARNING_PATH.map((step) => (
          <li key={step.title}>
            <div className="guide-step-t">{step.title}</div>
            <pre className="guide-cmd">{step.command}</pre>
            <div className="guide-p muted">{step.detail}</div>
          </li>
        ))}
      </ol>

      {!state.transcriptsFound ? (
        <p className="guide-p">
          Heads up: no transcript folder was found. <a href="/setup">Setup</a> shows the exact
          path that was checked and how to change it.
        </p>
      ) : null}
    </div>
  );
}

/**
 * An empty table or panel, explained.
 *
 * A table with headers and no rows makes a developer wonder whether it broke.
 * Saying which command fills it costs one line and removes the doubt.
 */
export function NothingYet({ what, command }: { what: string; command?: string }) {
  return (
    <div className="nothing">
      <p className="guide-p">{what}</p>
      {command ? <pre className="guide-cmd">{command}</pre> : null}
    </div>
  );
}
