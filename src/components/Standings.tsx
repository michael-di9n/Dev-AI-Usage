import type { Standing, Standings as StandingsData } from "../app/standings";

/**
 * The two readings that live on other tabs, beside the one that lives here.
 *
 * The usage band above them ranks how much work this machine does. These two
 * say how much of Claude Code the project configures, and whether it can
 * record a trace. Three questions of the same shape about the same setup, and
 * until now a reader who never opened the other tabs had no way to know either
 * had an answer.
 *
 * Smaller than the band on purpose. The band is a reading of the cost figure
 * directly above it and was deliberately struck at size; these are
 * cross-references, and drawing them at the same weight would make the page
 * look like it had three headlines. Each carries its arithmetic and a line
 * saying what it measures, because a coloured word with neither is a grade.
 */
export function Standings({ data }: { data: StandingsData }) {
  if (data.problem) {
    return (
      <div className="standings">
        <p className="standing none">{data.problem}</p>
      </div>
    );
  }

  return (
    <div className="standings">
      {data.maturity ? <Card standing={data.maturity} title="AI maturity" /> : null}
      {data.observability ? <Card standing={data.observability} title="Observability" /> : null}
    </div>
  );
}

function Card({ standing, title }: { standing: Standing; title: string }) {
  return (
    <a className={`standing standing-${standing.tone}`} href={standing.href}>
      <span className="standing-tab">{title}</span>
      {/* The word and its arithmetic on one line. The tone is read off the same
          band the word is, so colour never says anything the text does not, and
          the count beside it is what keeps the word from being a grade. */}
      <span className="standing-line">
        <strong>{standing.label}</strong>
        <b>{standing.measured}</b>
      </span>
      <span className="standing-what">
        {standing.what} <code>{standing.project}</code>
      </span>
    </a>
  );
}
