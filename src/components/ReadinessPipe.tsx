import type { CSSProperties } from "react";
import { MATURITY_TONE } from "../domain/readiness";
import {
  type Receipt,
  instrumentationBand,
  receiptFor,
  settingSnippet,
  tierSummaries,
  tiersComplete,
  tracingIsOn,
  wordsAreSent,
  type LiveEvidence,
  type RequirementCell,
  type SettingsScan,
  type TierSummary,
} from "../domain/instrumentation";
import type { TraceTap } from "../domain/traceTap";
import { MaturitySeal } from "./MaturitySeal";
import { RequirementScroll, anchorFor } from "./RequirementScroll";
import { TraceMonitor } from "./TraceMonitor";

/**
 * The requirements as a pipe, and the water in it.
 *
 * Every other way of drawing this was a list with a verdict bolted on. A pipe
 * says the thing the list could not: these are not seven independent boxes to
 * tick, they are a run that has to be unbroken end to end, and the water stops
 * at the first thing that is not set. Where it stops is the answer to "what do
 * I do next" without anyone having to read a fix.
 *
 * The two gating tiers are the run. Tier 3 is drawn as a branch off it, above
 * and separate, because tool wall-clock genuinely is not in the main line: the
 * PostToolUse hook feeds durations to Trace whether or not a single OTEL
 * variable is set. Putting it in the run would draw a dependency that does not
 * exist; leaving it out would drop a requirement.
 *
 * The content settings are the second branch, and they are drawn rather than
 * described: a drop off the run where tier 1 ends, and a manifold under it
 * carrying the four vessels to a terminus of their own. They used to sit in a
 * dashed box at the foot of the page, which read as a footnote - four switches
 * with no visible relationship to anything above them, and no statement of
 * what turning them on would produce. The drop is that relationship (the words
 * ride on the events, so nothing travels until tier 1 does) and the terminus is
 * that statement.
 *
 * The whole diagram is one grid, `--cols` columns wide, so the tier captions,
 * the drop and the manifold all land under the nodes they belong to instead of
 * being aligned by eye against a row of flexed cells.
 *
 * Water is the app's accent blue and nothing else here is. There is
 * deliberately no green-to-red ramp - see MATURITY_TONE in domain/readiness.ts
 * for why this project does not grade with colour - and the one red is reserved
 * for a node that is set to a value that breaks something, which is a fault
 * rather than a low score.
 */
export function ReadinessPipe({
  cells,
  content,
  scan,
  live,
  tap,
}: {
  cells: RequirementCell[];
  /** The content settings. Never counted here - see CONTENT_SETTINGS. */
  content: RequirementCell[];
  scan: SettingsScan;
  live: LiveEvidence;
  /** The records themselves, for the window on the terminus. Nothing else
      here reads them - the vessels are drawn from `live`. */
  tap: TraceTap;
}) {
  const tiers = tierSummaries(cells);
  const on = tracingIsOn(cells);
  const band = instrumentationBand(cells);
  const done = tiersComplete(cells);

  const gating = tiers.filter((t) => t.gating);
  const branch = tiers.find((t) => !t.gating);

  /* One flat run, in tier order, so "the first thing not set" is a position in
     the pipe and not a position within a group. */
  const run = gating.flatMap((t) => t.cells);
  const blockedAt = run.findIndex((c) => c.state !== "met");
  const reached = (i: number): boolean => blockedAt === -1 || i <= blockedAt;

  /*
    Where the content branch tees off: the segment that leaves the last tier-1
    node. Read off the tier rather than written down, so a requirement added to
    tier 1 moves the drop with it.

    That position is the rule, and it is one rule the reader can check on the
    drawing: the words are attributes hung on the events, so the branch is dry
    until the water has got past everything that makes an event. `wordsAreSent`
    says the same thing in the domain, and the terminus below is drawn from it.
  */
  const dropAt = gating[0]?.cells.length ?? 0;
  const flowing = reached(dropAt);
  const heard = wordsAreSent(cells, content);

  return (
    <section className="rp">
      {/* The badge, kept at size. The pipe shows where the water stopped; this
          says what that means, and it is the one line worth reading alone. */}
      <p className="rp-head">
        <MaturitySeal count={done} total={tiers.length} band={band} unit="tiers complete" />
        <span>
          <em className={`gate gate-${on ? "on" : "off"}`}>
            In-depth tracing — {on ? "on" : "off"}
          </em>
          <b>
            {done} of {tiers.length} tiers complete
            <span className={`scan-band scan-band-${MATURITY_TONE[band]}`}>{band}</span>
          </b>
          <small>
            {on
              ? "The line is unbroken, so a trace of any session started from now on carries real durations."
              : `The water stops at ${run[blockedAt]?.label ?? "the first gap"}. Everything downstream of it stays dry.`}
          </small>
        </span>
      </p>

      {/* The anchor every panel's Close link returns to, so shutting one lands
          the reader back on the node they opened rather than at the page top. */}
      <div
        className="rp-pipe"
        id="rp-nodes"
        style={{ "--cols": run.length, "--tee": dropAt + 1 } as CSSProperties}
      >
        {run.map((cell, i) => (
          /* Placed rather than flowed. The drop below spans this row, and an
             auto-placed cell steps around anything already sitting in a
             column - which silently pushed the last two vessels one column to
             the right and left a gap where the branch leaves. */
          <span className="rp-cell" key={cell.key} style={{ "--at": i + 1 } as CSSProperties}>
            {/* The segment feeding this node. Wet only if everything upstream
                is set, which is what makes a single gap visible from the end
                of the row. */}
            <i className={reached(i) ? "rp-seg wet" : "rp-seg"} />
            <Stop cell={cell} edge={edgeOf(i, run.length + 1)} scan={scan} live={live} />
          </span>
        ))}

        <span className="rp-cell rp-cell-end" style={{ "--at": run.length + 1 } as CSSProperties}>
          <i className={on ? "rp-seg wet" : "rp-seg"} />
          {/*
            The terminus: what the whole run is for. Larger than the conditions
            feeding it, and it fills the same way they do.

            No panel of its own, because unlike a requirement it has nothing
            further to set: what it means is the badge at the top of the page,
            in the largest type on it. It does carry a hover note, like every
            other vessel here - a reader sweeping the row should not find one
            circle in it that says nothing back.

            It is the one vessel that opens something other than settings
            advice. `TraceMonitor` taps the line and prints what has actually
            come down it, which is the question a reader has once the seven
            nodes above are set and the only one this page could not answer:
            every panel reports a count for the single setting it is about, and
            nobody opens seven panels to add up three numbers.
          */}
          <span className="rp-stop rp-stop-end rp-anchor-end">
            <TraceMonitor on={on} tap={tap} />
            <em className="rp-tag">
              <b>Trace</b>
              <span>{on ? "durations arrive" : "durations stay dashed"}</span>
            </em>
            <Say
              title="In-depth tracing"
              state={on ? "on" : "off"}
              what="What the run is for. With every node above it set, each call in a session becomes a span with real wall-clock on it, and the Trace page prints durations instead of em dashes."
              hint={
                on
                  ? "Click to tap the line and read the records themselves. Nothing backfills — a session already running will never send them."
                  : "Click to tap the line and see whether anything has ever arrived. Open any dry node above for the line that fills it."
              }
            />
          </span>
        </span>

        {/*
          The tier boundaries are the captions and nothing else.

          A wavy metal mark used to run under the vessels of each tier as well,
          drawn where the reader already was rather than in a caption they had
          to look away to read. It cost more than it bought: three drifting
          squiggles under a row of circles read as barriers cutting the run
          into pieces, which is the one thing the pipe exists to say it is not.
          The captions below span the same columns and name and count each
          tier, which is what the marks were shorthand for.
        */}
        <ol className="rp-legend">
          {gating.map((tier) => (
            <li key={tier.tier} style={{ "--span": tier.total } as CSSProperties}>
              <TierCaption tier={tier} />
            </li>
          ))}
        </ol>

        {/*
          The drop, and the manifold it feeds.

          Drawn as one bar with the four hanging on it rather than as four
          lengths of pipe in series, and every segment of it shares a single
          wetness for that reason: these settings do not depend on each other,
          and a chain would say they did. It is the same argument the tier-3
          branch is drawn by.
        */}
        <i className={flowing ? "rp-drop wet" : "rp-drop"} aria-hidden="true" />

        <div className="rp-manifold">
          {/* The bar the four hang off. One length, one wetness, no order. */}
          <i className={flowing ? "rp-main wet" : "rp-main"} aria-hidden="true" />

          {content.map((cell, i) => (
            <span className="rp-tap" key={cell.key}>
              <i className={flowing ? "rp-stub wet" : "rp-stub"} aria-hidden="true" />
              <Stop cell={cell} edge={edgeOf(i, content.length + 1)} scan={scan} live={live} />
            </span>
          ))}

          {/*
            The second terminus: what turning these four on actually
            influences. Same shape as the trace terminus and deliberately so -
            it is the same kind of statement - but it moves no band and
            completes no tier, which the caption beside it says out loud.
          */}
          <span className="rp-tap rp-tap-end">
            <i className={flowing ? "rp-stub wet" : "rp-stub"} aria-hidden="true" />
            <span className="rp-stop rp-stop-end rp-anchor-end">
              <b className={heard ? "rp-end on" : "rp-end"} title={`Words in the trace — ${heard ? "on" : "off"}`}>
                <span className="rp-water" />
                <span className="rp-end-word">{heard ? "on" : "off"}</span>
              </b>
              <em className="rp-tag">
                <b>Words</b>
                <span>{heard ? "text arrives" : "text stays redacted"}</span>
              </em>
              <Say
                title="Words in the trace"
                state={heard ? "on" : "off"}
                what="What these four influence, and the whole of it: the events keep what was actually asked, answered and run, instead of <REDACTED>. Every count, cost, duration and band on this app is identical either way."
                hint={
                  heard
                    ? "Only sessions started since it was set carry text."
                    : "Needs tier 1 and one of the four — either alone sends nothing. Args and Output ride on spans, so they need tier 2 as well."
                }
              />
            </span>
          </span>
        </div>

        {/*
          Tier 3, drawn as what it is: a second feed into the same terminus.

          It used to sit in a dashed box under the diagram, off to one side and
          connected to nothing, which made the one requirement that is not in
          the run look like the one requirement that was forgotten. The riser
          says the true thing instead - the hook reaches Trace without passing
          through a single node of the run, because it times tools whether or
          not OpenTelemetry is on. Drawing it into the line would assert a
          dependency that does not exist; drawing it nowhere lost a
          requirement; drawing it as an inlet of its own is neither.

          It rises rather than falls because it is a source. Everything else on
          this diagram runs downhill into something; this is the one thing that
          is pumped in.
        */}
        {branch ? (
          <>
            <i
              className={branch.complete ? "rp-riser wet" : "rp-riser"}
              aria-hidden="true"
            />
            <div className="rp-feed">
              <span className="rp-feed-say">
                <TierCaption tier={branch} />
                <em>Feeds the same trace, but not through the line above — the
                hook times tools whether or not OpenTelemetry is on, and nothing
                else on this machine times them at all.</em>
              </span>
              <Stop cell={branch.cells[0]!} edge="end" scan={scan} live={live} />
            </div>
          </>
        ) : null}

        <p className="rp-manifold-say">
          <span className="rp-legend-name">
            Content
            <b>{content.filter((c) => c.state === "met").length} of {content.length}</b>
          </span>
          <em>
            Optional, and off by default. The transcript on this machine already
            carries every prompt, reply and tool argument in full, so these are a
            duplicate of it — until the agent is on another machine, and then they
            are the only record of what was said. Nothing here counts them.
          </em>
        </p>
      </div>

      {/*
        Every panel, in the order of the diagram, all shut. Only the one the
        URL names is drawn; the rest cost a few hundred bytes of markup each
        and no layout at all. Rendering them all is what lets a link to a node
        arrive already open.
      */}
      {[...cells, ...content].map((cell) => (
        <RequirementScroll key={cell.key} cell={cell} scan={scan} live={live} />
      ))}
    </section>
  );
}

/**
 * One requirement: a vessel, its two words, and the panel it opens.
 *
 * The vessel is a link, which is what makes the panel reachable without a
 * pointer. It used to lead to whichever tab owned the setting; those tabs are
 * gone and it now opens the panel at the foot of this page, so the page that
 * finds the gap is the page that closes it.
 *
 * The accessible name carries the whole cell - what it is, what was found, and
 * what has arrived - because a reader who cannot see the tag under the vessel
 * needs all of it from the one control.
 */
function Stop({
  cell,
  edge,
  scan,
  live,
}: {
  cell: RequirementCell;
  edge: Edge;
  scan: SettingsScan;
  live: LiveEvidence;
}) {
  const receipt = receiptFor(cell, live);
  const snippet = settingSnippet(cell, scan);

  return (
    <span className={`rp-stop rp-anchor-${edge}`}>
      <a
        className={`rp-node ${cell.state}`}
        href={`#${anchorFor(cell)}`}
        aria-label={describe(cell, receipt)}
      >
        {/*
          Always drawn, whatever the state. An unset vessel used to be empty,
          which said "nothing here" by leaving the shape blank - and a blank
          shape is also what a vessel looks like while it is still loading, or
          when a browser has dropped the stylesheet. It now holds murk: dead
          water, a third of the way up, sloshing at a quarter of the speed. The
          state is in the fill, in the hue and in the words under it, and the
          diagram no longer has a state it draws by drawing nothing.
        */}
        <span className="rp-water" />
      </a>

      <em className="rp-tag">
        <b>{cell.short}</b>
        <span>{tagState(cell)}</span>
      </em>

      <Say
        title={cell.label}
        state={tagState(cell)}
        what={cell.what}
        /*
          The line itself, not just the name of the variable. A reader who has
          the name still has to guess the value, and `otlp` versus `console` is
          the single most common way this page ends up saying "wrong". The hook
          has no line to quote - it is a command with a matcher - so it falls
          back to naming the settings key, which is what `settingSnippet`
          returning null means.
        */
        env={snippet ? snippet.json : cell.key}
        hint={
          snippet
            ? `Click for this and the file to put it in — ${snippet.file}.`
            : "Click for what to change, and where."
        }
      />
    </span>
  );
}

/**
 * The short of it, on hover.
 *
 * A preview of the panel and never a replacement for it. The `.rp-node` comment
 * records why the state was pulled out of a tooltip in the first place - a
 * hover cannot be opened by touch and does not survive a screenshot - so
 * everything in here is said somewhere that stays: the tag under the vessel
 * carries the name and the state, the panel carries the rest, and the link's
 * `aria-label` carries all of it at once. This is the reader who is sweeping
 * the row deciding which circle to click.
 *
 * `aria-hidden`, therefore. Announcing it would read every vessel's sentence
 * twice, once here and once from the label on the link inside it.
 */
function Say({
  title,
  state,
  what,
  env,
  hint,
}: {
  title: string;
  state: string;
  what: string;
  /** The settings line this vessel is about. Absent on the two termini. */
  env?: string;
  hint: string;
}) {
  return (
    <span className="rp-say" aria-hidden="true">
      <b>
        {title}
        <em>{state}</em>
      </b>
      <span>{what}</span>
      {env ? <code className="rp-say-env">{env}</code> : null}
      <i>{hint}</i>
    </span>
  );
}

/**
 * The second line of the tag.
 *
 * A wrong value names itself here rather than only inside the panel. "wrong"
 * alone sent a reader hunting for what was wrong with it, when the answer -
 * `console`, an exporter that writes to a terminal instead of to this receiver
 * - is one short word and the single most useful thing the node knows.
 */
function tagState(cell: RequirementCell): string {
  if (cell.state === "met") return "set";
  if (cell.state === "missing") return "not set";
  return cell.found === null ? "wrong" : `wrong: ${clip(cell.found)}`;
}

/** Long enough for `console` or `grpc`; the panel carries the full value. */
const clip = (value: string): string => (value.length > 14 ? `${value.slice(0, 13)}…` : value);

/**
 * Which way a node's hover note opens, and which way its tag overhangs.
 *
 * Both ends matter and for the same reason: an absolutely positioned box still
 * counts towards the page's scroll width even while it is invisible, so a note
 * hanging off the right of the last vessel would put a horizontal scrollbar on
 * the page that nobody could see the cause of - and a UI check fails the page
 * for exactly that. The two stops at each end open theirs inward instead.
 */
type Edge = "start" | "mid" | "end";

/* Prefixed `rp-anchor-`, not `rp-`: `.rp-end` is already the terminus vessel,
   and the collision drew the seventh stop as a 78px dashed circle with its tag
   underneath it. */

const edgeOf = (index: number, total: number): Edge =>
  index <= 1 ? "start" : index >= total - 2 ? "end" : "mid";

/**
 * The whole of one requirement, as the link's accessible name.
 *
 * The tag under the node carries the name and the state, which is what a
 * reader needs at a glance and what survives a screenshot. This is the rest of
 * it - what the setting does, what it was found set to, what to do, and what
 * has arrived - for the reader who reaches the node without seeing any of the
 * things drawn around it.
 */
function describe(cell: RequirementCell, receipt: Receipt | null): string {
  return [cell.label, cell.what, cell.finding, cell.fix, receipt?.detail]
    .filter(Boolean)
    .join(" ");
}

/**
 * The tier caption, and the way into the first thing it is missing.
 *
 * The link used to lead to the tab that owned the tier. With those gone it
 * opens the panel for the first unmet requirement in the tier - which is what
 * a reader clicking "Set up" wanted anyway - and falls back to the first
 * requirement once the tier is complete, so "Review" still has somewhere to go.
 */
function TierCaption({ tier }: { tier: TierSummary }) {
  const target = tier.cells.find((c) => c.state !== "met") ?? tier.cells[0];

  return (
    <>
      <span className="rp-legend-name">
        {tier.name}
        {/*
          Only where it counts something. "0 of 1" beside a single vessel that
          already says "not set" underneath it is the same fact printed twice,
          in the slot a reader looks at to find out how much of a tier is left.
        */}
        {tier.total > 1 ? <b>{tier.met} of {tier.total}</b> : null}
      </span>
      {target ? (
        <a className="rp-legend-go" href={`#${anchorFor(target)}`}>
          {tier.complete ? "Review" : "Set up"}
          <span aria-hidden="true"> →</span>
          <span className="vh"> {tier.name}: {target.label}</span>
        </a>
      ) : null}
    </>
  );
}
