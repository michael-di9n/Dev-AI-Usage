import { GRANULARITY_LABELS, PERIODS, type Granularity, type Period } from "../domain/period";

/**
 * One filter row, above everything it scopes.
 *
 * Both controls live here rather than beside their charts: every figure on the
 * page is computed from the same slice, and a per-chart range is how two
 * numbers on one screen end up disagreeing. Presets as plain links, because
 * the slice belongs in the URL - the page stays shareable and works with no
 * JavaScript at all.
 *
 * Granularity is only offered where it changes the answer. "Today by month" is
 * a one-point chart, so a single day offers no bucket choice and the control
 * disappears instead of presenting a dead option.
 */
export function PeriodFilter({ period, granularity, basePath = "/" }: {
  period: Period;
  granularity: Granularity;
  basePath?: string;
}) {
  return (
    <div className="filters">
      <div className="segmented" role="group" aria-label="Time period">
        {PERIODS.map((p) => {
          const on = p.id === period.id;
          return (
            <a
              key={p.id}
              // Granularity is deliberately dropped when the period changes:
              // granularityFor() then picks the one that suits the new window,
              // so "last 3 months by month" -> "this week" lands on by-day.
              href={`${basePath}?period=${p.id}`}
              className={on ? "on" : undefined}
              aria-current={on ? "true" : undefined}
            >
              {p.label}
            </a>
          );
        })}
      </div>

      {period.granularities.length > 1 ? (
        <div className="segmented subtle" role="group" aria-label="Bucket size">
          {period.granularities.map((g) => {
            const on = g === granularity;
            return (
              <a
                key={g}
                href={`${basePath}?period=${period.id}&by=${g}`}
                className={on ? "on" : undefined}
                aria-current={on ? "true" : undefined}
              >
                {GRANULARITY_LABELS[g]}
              </a>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
