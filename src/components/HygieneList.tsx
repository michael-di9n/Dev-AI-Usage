import type { HygieneFinding } from "../domain/instrumentation";
import { Pill } from "./primitives";

/**
 * Settings that are valid for Claude Code and cost something here.
 *
 * Lines to remove rather than lines to add, which is why they are their own
 * list and never part of any count, and why they are not nodes: a node is a
 * thing to switch on, and switching one of these on is the fault.
 *
 * This is all that survived `RequirementList`. The other two lists in that
 * module - the requirement cells and the four extra hook handlers - were the
 * bodies of the Telemetry and Hooks tabs, and went with them; the requirements
 * are drawn as the pipe now, with a panel each. This one came back to the
 * Observability page rather than being deleted with the tab that happened to be
 * holding it: it is the only high-severity finding this family has, and
 * nothing else would have reported it.
 *
 * Renders nothing at all when there is nothing wrong, which is the ordinary
 * case - an empty "problems" heading is a heading that teaches the reader to
 * ignore the section.
 */
export function HygieneList({ findings }: { findings: HygieneFinding[] }) {
  if (findings.length === 0) return null;

  return (
    <>
      <h3 className="req-sub">
        Set, and breaking something
        <Pill tone="high">{findings.length}</Pill>
      </h3>
      <p className="note">
        Each of these is valid for Claude Code and costs something on this end.
      </p>
      <ul className="reqs">
        {findings.map((finding) => (
          <li className="req wrong" key={finding.key}>
            <div className="req-name">
              <code>{finding.key}</code>
              <Pill tone="high">remove</Pill>
            </div>
            <p className="req-finding">
              Set to <b>{finding.value}</b> in <code>{finding.source}</code>.
            </p>
            <p className="req-fix">{finding.breaks}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
