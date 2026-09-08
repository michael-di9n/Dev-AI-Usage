import type { ReactNode } from "react";
import {
  STATE_TONE,
  TIERS,
  receiptFor,
  settingSnippet,
  type LiveEvidence,
  type RequirementCell,
  type SettingsScan,
} from "../domain/instrumentation";
import {
  EndpointIcon,
  FormatIcon,
  HookIcon,
  LogsIcon,
  MetricsIcon,
  SpansIcon,
  SwitchIcon,
  TracesIcon,
} from "./icons";
import { Pill } from "./primitives";

/**
 * One requirement, opened.
 *
 * These panels are the two tabs that used to sit beside this page. Telemetry
 * and Hooks existed to hold the settings advice for seven environment
 * variables and one handler, which meant the page that found the gap could not
 * close it: a reader was told what was wrong and sent somewhere else to read
 * how to fix it. The advice is now on the node that owns it.
 *
 * Opened with `:target` and no JavaScript, for the reasons `TraceTree` gives
 * for using `<details>`: it costs no script, it is keyboard-reachable and
 * announced for free, and it works with scripting off. Two things `<details>`
 * could not do decided it. The control is a node in a diagram thirty lines
 * further up, not a summary sitting on top of its own body; and `:target`
 * opens exactly one panel at a time, which is what a scroll unrolling at the
 * foot of the page means.
 *
 * The open panel therefore lives in the URL, where it can be linked and
 * survives a reload - without writing anything, which is the rule: AGENTS.md
 * reserves `app_state` for what a reader chooses, and opening an explanation
 * is looking rather than choosing.
 */
export function RequirementScroll({
  cell,
  scan,
  live,
}: {
  cell: RequirementCell;
  scan: SettingsScan;
  live: LiveEvidence;
}) {
  const snippet = settingSnippet(cell, scan);
  const receipt = receiptFor(cell, live);

  return (
    <section className={`rp-scroll rp-scroll-${cell.state}`} id={anchorFor(cell)}>
      {/* The inner element is what animates. Height cannot be transitioned
          from nothing to content, so the panel unrolls a 0fr/1fr grid row
          around it - the one shape that measures its own content. */}
      <div className="rp-scroll-body">
        <p className="rp-scroll-head">
          <span className="rp-scroll-icon" aria-hidden="true">{ICONS[cell.key] ?? <SwitchIcon />}</span>
          <b>{cell.label}</b>
          <Pill tone={STATE_TONE[cell.state]}>{STATE_WORD[cell.state]}</Pill>
          {/*
            Back to the diagram, not to the top of the document. Clearing the
            fragment is what shuts the panel, and landing the reader on the
            node they opened is what makes the next one one click away.
          */}
          <a className="rp-scroll-shut" href="#rp-nodes">
            Close<span className="vh"> {cell.label} and go back to the diagram</span>
          </a>
        </p>

        <p className="rp-scroll-what">{cell.what}</p>

        <dl className="rp-scroll-facts">
          <div>
            <dt>Now</dt>
            <dd>
              {cell.finding}
              {cell.found !== null ? <> Found <code>{cell.found}</code>.</> : null}
            </dd>
          </div>

          <div>
            <dt>To set</dt>
            <dd>
              {snippet ? (
                <>
                  Add this to the <code>env</code> block of <code>{snippet.file}</code>:
                  <code className="rp-scroll-line">{snippet.json}</code>
                  {/*
                    The other scope, said on every panel rather than left to the
                    exercise. User scope is the right default - it follows you
                    between repositories - but it is the wrong answer for one
                    machine shared by a team, or for a repository that should
                    carry its own telemetry settings, and a reader who wants
                    that has no way to know it is allowed from a panel that
                    names one file.
                  */}
                  <span className="rp-scroll-alt">
                    Or put it in <code>./.claude/settings.json</code> to scope it to this
                    project, or <code>./.claude/settings.local.json</code> to keep it out of
                    git. Project settings win over user settings, and local wins over both.
                  </span>
                </>
              ) : (
                cell.fix || "Nothing to change."
              )}
            </dd>
          </div>

          <div>
            <dt>Buys</dt>
            {/* This requirement's own records, not the tier's. Five of the
                seven share a tier, and "what does this one buy as opposed to
                the one beside it" is the question a reader opens a panel to
                ask. */}
            <dd>{cell.buys}</dd>
          </div>

          {/*
            The one line on this panel that is a measurement rather than a
            reading of a file, and the only place this page reports one.

            There was a lamp on the node as well, for a while. It said less
            than this line and could not say the number, so it was two
            channels for one fact and the quieter one won. The sentence
            matters more than the colour did: OpenTelemetry reads its
            variables once, at launch, so a machine configured correctly a
            minute ago is still silent until the next session starts. Without
            that said out loud, a correct setting reads as a broken one.
          */}
          {receipt ? (
            <div>
              <dt>Arrived</dt>
              <dd>
                {receipt.receiving ? (
                  receipt.detail
                ) : (
                  <>
                    {receipt.detail}. Nothing backfills — Claude Code reads these
                    variables when it starts, so a session already running will
                    never send them.
                  </>
                )}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
    </section>
  );
}

/** The fragment one node opens. One function, so the link and the panel agree. */
export const anchorFor = (cell: { key: string }): string =>
  `req-${cell.key.replace(/[^\w]/g, "-")}`;

/** The word in the pill. Never the only channel: the panel says it again below. */
const STATE_WORD = { met: "set", missing: "not set", wrong: "wrong value" } as const;

const ICONS: Record<string, ReactNode> = {
  CLAUDE_CODE_ENABLE_TELEMETRY: <SwitchIcon />,
  OTEL_METRICS_EXPORTER: <MetricsIcon />,
  OTEL_LOGS_EXPORTER: <LogsIcon />,
  OTEL_EXPORTER_OTLP_PROTOCOL: <FormatIcon />,
  OTEL_EXPORTER_OTLP_ENDPOINT: <EndpointIcon />,
  OTEL_TRACES_EXPORTER: <TracesIcon />,
  CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: <SpansIcon />,
  "hooks.PostToolUse": <HookIcon />,
};
