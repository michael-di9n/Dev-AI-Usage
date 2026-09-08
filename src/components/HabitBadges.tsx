import type { Badge, BadgeId } from "../domain/habitBadges";
import { AgentIcon, ModelIcon, SkillIcon, ToolkitIcon } from "./icons";

/**
 * How you worked, beside what it cost.
 *
 * Chips rather than tiles, because these are not measurements of the same kind
 * as the figures on the left: a badge is a reading of a stretch of time, and
 * giving it the weight of a stat tile would have it competing with the cost it
 * sits next to. The figure that produced it is under the label, and the full
 * arithmetic - counts, denominator, and every band - is in the tooltip, so the
 * badge can always be argued with.
 *
 * `describing` names the day when the badges describe one rather than ranking
 * several. The heading has to say which of the two the reader is looking at:
 * the same chip means "this is how you work" over a month and only "this is
 * what today held" over a day, and nothing else on the row distinguishes
 * them.
 *
 * Colour is never the only channel. Each badge carries its own glyph and its
 * own words; the metal is the third thing that says gold, after "Skill power
 * user" and the icon.
 */
const ICONS: Record<BadgeId, React.ReactNode> = {
  skills: <SkillIcon />,
  subagents: <AgentIcon />,
  toolkit: <ToolkitIcon />,
  models: <ModelIcon />,
};

export function HabitBadges({ badges, describing = null }: {
  badges: Badge[];
  /** The phrase for a single-day window, or null when these rank several. */
  describing?: string | null;
}) {
  const heading = describing === null ? "How you worked" : `How you worked ${describing}`;

  /*
   * No empty branch, and that is the change. There used to be one, rendering a
   * sentence where the chips would be whenever the window held nothing - which
   * on the Today filter took four measurements off the page on a day whose
   * measurements were all zero. `habitBadges` now always returns four, so an
   * empty window is a row of zeroes and the row keeps its shape.
   */
  return (
    <div className="badges">
      <div className="badges-head">{heading}</div>
      <ul>
        {badges.map((badge) => (
          <li key={badge.id} className={`badge ${badge.tone}`} title={badge.why}>
            <span className="badge-icon">{ICONS[badge.id]}</span>
            <span className="badge-text">
              <span className="badge-label">{badge.label}</span>
              <span className="badge-measure">{badge.measure}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
