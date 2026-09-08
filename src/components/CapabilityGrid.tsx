import type { ReactNode } from "react";
import {
  CAPABILITY_BANDS,
  MATURITY_TONE,
  TIER_TONE,
  bandsFor,
  sealBand,
  type Capability,
  type CapabilityCell,
} from "../domain/readiness";
import {
  AgentIcon,
  CiIcon,
  HookIcon,
  McpIcon,
  MemoryIcon,
  RulesIcon,
  SkillIcon,
  WorkflowIcon,
} from "./icons";
import { BandChevrons } from "./BandChevrons";
import { MaturitySeal } from "./MaturitySeal";
import { shortPath } from "./primitives";

/**
 * What the repository configures, as one cell per capability.
 *
 * This replaced eight stacked full-width panels and, with them, the two tables
 * that used to sit underneath. The panels cost about 940px of scroll to carry
 * eight booleans and a filename each, and the repo that most needs this page -
 * a fresh clone - paid seven of those cards to be told "no".
 *
 * The tables went because the cells now carry what the tables carried, and
 * that is the condition on removing them: a band with no measurement beside
 * it is a grade, so every cell states its instance count, the rule that count
 * put it in, and what the next band up would take.
 *
 * A configured cell shows all of that at rest. An absent one is a card that
 * opens: it has no measurement to carry, only the paths the scan looked in,
 * and those are folded behind its own face rather than printed eight times
 * over on the repository that has none of it.
 */

/** One glyph per capability, so a cell is identifiable before it is read. */
const ICONS: Record<Capability, ReactNode> = {
  memory: <MemoryIcon />,
  rules: <RulesIcon />,
  skills: <SkillIcon />,
  agents: <AgentIcon />,
  mcp: <McpIcon />,
  hooks: <HookIcon />,
  workflows: <WorkflowIcon />,
  ci: <CiIcon />,
};

/**
 * Icon, label and band - the three things every cell leads with.
 *
 * Shared because the two cell shapes need different wrappers for it and
 * nothing else: a `<p>` on a configured cell, and phrasing content inside the
 * `<summary>` on an absent one. Written out twice it drifted immediately, and
 * the drift was the name row drawn twice in the same card.
 */
const nameOf = (cell: CapabilityCell) => (
  <>
    <span className="cap-icon" aria-hidden="true">{ICONS[cell.capability]}</span>
    {cell.label}
    <BandChevrons band={cell.band} label={cell.label} />
  </>
);

export function CapabilityGrid({
  cells,
  score,
  lastEdited,
}: {
  cells: CapabilityCell[];
  /** The normalised average of the per-capability bands, 0 to 1. */
  score: number;
  /** ISO date of the newest configuration file, or null on an empty repo. */
  lastEdited: string | null;
}) {
  const configured = cells.filter((c) => c.present).length;
  // The score's band, floored so it can never read "unconfigured" next to a
  // count of what is configured. See sealBand.
  const band = sealBand(score, configured);

  return (
    <>
      {/*
        The page's one answer, and the only loud thing on it. Unlabelled on
        purpose: a caps label above it would put the count at the same weight
        as the section headings underneath, which is the hierarchy this page
        did not have.
      */}
      <div className="scan-head">
        <p className="scan-figure">
          <MaturitySeal count={configured} total={cells.length} band={band} />
          <span>
            {/* The band, in the seal's own metal. Named as well as coloured:
                the three metals are indistinguishable under greyscale, so the
                word is the reading and the colour is the reinforcement. */}
            <em className={`scan-band scan-band-${MATURITY_TONE[band]}`}>{band}</em>
            of {cells.length} configured
            {/* The band comes from the average of the eight bands, not from
                the count struck on the seal. Two repositories with six
                capabilities each are not the same repository - one may have
                one of each and the other forty - and without this line the
                colour would look like it was reading the number. */}
            <small>
              {(score * 100).toFixed(0)}% of the {cells.length} bands, on average — {CAPABILITY_BANDS.bronze}{" "}
              of a thing is bronze, {CAPABILITY_BANDS.silver}-{CAPABILITY_BANDS.gold - 1} silver,{" "}
              {CAPABILITY_BANDS.gold}+ gold. {/*
                Hooks' own three, named here as well as in its cell. A reader
                who checks one cell against the rule printed at the top and
                finds they disagree has been told the page is wrong about
                something, and the exception is cheaper to state than that. */}
              Hooks counts matchers rather than files, so it needs{" "}
              {bandsFor("hooks").bronze}, {bandsFor("hooks").silver} and {bandsFor("hooks").gold}
            </small>
          </span>
        </p>
        <dl className="scan-facts">
          <dt>Last edited</dt>
          {/* An em dash rather than today's date: a repo with no configuration
              has no newest file, and printing the scan date here would read as
              a file having been touched. */}
          <dd>
            {lastEdited
              ? lastEdited.slice(0, 10)
              : <span className="dash" title="No configuration files to date">—</span>}
          </dd>
        </dl>
      </div>

      {/* Adoption order, present and absent in one list. Splitting them gave
          the absences their own heading, which made "not configured" a section
          rather than a state - and lost the order that makes the cells read as
          a progression. */}
      <ul className="caps">
        {cells.map((cell) => (
          <li key={cell.capability} className={cell.present ? "cap" : "cap off"}>
            {cell.present ? (
              <>
                <p className="cap-name">{nameOf(cell)}</p>
                <p className="cap-detail">
                  <code title={cell.firstPath ?? undefined}>{shortPath(cell.firstPath)}</code>
                  {cell.moreFiles > 0 ? <span className="cap-count">+{cell.moreFiles}</span> : null}
                </p>
                {/* The band's own arithmetic: what was counted, and the rule
                    that count fell under. The chevrons in the corner are the
                    same fact drawn; this is the line that makes them
                    checkable. */}
                <p className="cap-reached">
                  <span className={`cap-chip cap-chip-${TIER_TONE[cell.band.band]}`}>
                    {cell.band.measured}
                  </span>
                  {cell.band.rule}
                </p>
                {/* What the next band up would take, as a condition rather
                    than a verdict. At gold there is no next one, and the cell
                    says the band is the top rather than leaving a gap that
                    reads as a measurement still loading. */}
                <p className="cap-next">
                  {cell.band.next ? (
                    <><b>Next</b> {cell.band.next}</>
                  ) : (
                    <>
                      {/* This capability's own ceiling, not the shared one:
                          printing 4 in a cell that reached gold at 8 would
                          make the top band look unearned. */}
                      <b>Top band</b> {bandsFor(cell.capability).gold} or more is as far as
                      this counts
                    </>
                  )}
                </p>
                {/* And what the quality rules found, where there is anything
                    of the kind to find. This is what the band used to be
                    decided on; it is still worth knowing, and it is now
                    stated instead of encoded in a colour. */}
                {cell.quality ? <p className="cap-quality">{cell.quality}</p> : null}
              </>
            ) : (
              /*
                An absence folds.

                The looked-for paths are the evidence for it, and they stay on
                the page - but on a fresh clone this is eight cells of them,
                which makes the longest strings on the page the first thing
                shown to the reader least likely to have come for them. The
                face states what the capability would add; the paths are one
                click behind it.

                `<details>` rather than state, for the reasons `TraceTree`
                gives: no script, keyboard-reachable and screen-reader
                announced for free, works with scripting off, and a shut one
                keeps its body out of `innerText`, so a probe can tell an
                opened card from a closed one. Nothing is written when one
                opens - the line `RequirementScroll` draws, that opening an
                explanation is looking rather than choosing.
              */
              <details className="cap-probe">
                {/* The face is the whole card, so what toggles it is the thing
                    a reader is already pointing at rather than a control
                    inside it. Phrasing content only: a `<p>` in a `<summary>`
                    is invalid, and React logs it - which every check on this
                    page reads as a failure, correctly. */}
                <summary className="cap-face">
                  <span className="cap-name">{nameOf(cell)}</span>
                  {/* The one-line explanation of the capability, shown only on
                      an absence: this is where a reader is being told something
                      is missing and might want to know what it would add. */}
                  <span className="cap-what">
                    {cell.what}
                    {/* The marker says there is more behind the card. This says
                        what, because the summary's accessible name is otherwise
                        the label and the explanation, and neither of them
                        mentions a path. */}
                    <span className="vh"> — show where we looked</span>
                  </span>
                </summary>
                <p className="cap-detail">
                  Looked for{" "}
                  {cell.lookedFor.map((path) => (
                    <code key={path}>{path}</code>
                  ))}
                </p>
              </details>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
