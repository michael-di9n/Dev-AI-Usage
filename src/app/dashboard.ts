import { existsSync } from "node:fs";
import { Application } from "../Application";
import { DEFAULT_PERIOD, isPeriodId, type PeriodId } from "../domain/period";
import { decideNextStep, type OnboardingState } from "../onboarding/NextStep";
import { freshnessOf, type Freshness } from "../domain/freshness";
import { SYNC_STATE } from "./background-sync";

/**
 * One Application per server process, created lazily.
 *
 * SQLite handles are cheap but not free, and every page needs the same one.
 * Reads are WAL, so an ingest running in another process does not block them.
 */
let instance: Application | null = null;

export function app(): Application {
  instance ??= Application.create();
  return instance;
}

/** Computed per request: a developer who runs the importer in another terminal
 *  should see the dashboard change on refresh, not on restart. */
export function onboarding(): OnboardingState {
  const application = app();
  const { sessions } = application.queries.onboardingCounts();
  return decideNextStep({
    transcriptsFound: existsSync(application.config.claudeProjectsDir),
    sessions,
  });
}

/**
 * The period from the URL, validated.
 *
 * Anything unrecognised falls back rather than throwing: this is a query
 * string, so it arrives hand-edited, stale from a bookmark, or truncated by a
 * chat client that ate the rest of the link.
 */
export function periodFrom(
  searchParams: Record<string, string | string[] | undefined>,
): PeriodId {
  const raw = Array.isArray(searchParams.period) ? searchParams.period[0] : searchParams.period;
  return isPeriodId(raw) ? raw : DEFAULT_PERIOD;
}

/**
 * The slice to render: the URL's, or the one this reader last chose.
 *
 * The URL stays authoritative and is never overridden. A link with `?period=`
 * in it means the same thing to whoever opens it as it did to whoever sent it,
 * which is the whole reason the slice lives in the query string - and a
 * remembered preference that quietly rewrote a shared link would take that
 * away. The cookie is consulted only when the URL says nothing at all, which
 * is exactly the case that used to land on the default.
 *
 * Granularity rides along, but only under a remembered period. When the URL
 * names a period and not a bucket, that is `PeriodFilter` deliberately
 * dropping the bucket so `granularityFor` can pick the one that suits the new
 * window - restoring a remembered bucket there would undo it, and "last 3
 * months by month" would follow you into "this week".
 *
 * Nothing here trusts the cookie's contents. It is client-written and arrives
 * from the browser like any other request header, so both halves are parsed
 * against the same validators the query string gets: an unknown period falls
 * back to the default, and a bucket the period cannot support is dropped by
 * `granularityFor`.
 */
export interface Slice {
  period: PeriodId;
  /** The remembered bucket, unvalidated. `granularityFor` decides. */
  by: string | undefined;
}

/** The cookie the page writes and reads back. One value, `period` or
 *  `period.granularity`, so the pair can never be half-restored. */
export const SLICE_COOKIE = "dev-ai-usage.slice";

export function sliceFrom(
  searchParams: Record<string, string | string[] | undefined>,
  remembered: string | undefined,
): Slice {
  const urlPeriod = first(searchParams.period);
  if (isPeriodId(urlPeriod)) return { period: urlPeriod, by: first(searchParams.by) };

  const [period, by] = (remembered ?? "").split(".");
  return isPeriodId(period)
    ? { period, by }
    : { period: DEFAULT_PERIOD, by: first(searchParams.by) };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * How old the figures are, for the line that says so.
 *
 * Read per request rather than cached: the background import writes this from
 * the same process, and a cached answer would report the dashboard fresher
 * than it is - which is the exact failure this line exists to prevent.
 */
export function freshness(): Freshness {
  const application = app();
  return freshnessOf(
    application.queries.readState(SYNC_STATE.at),
    new Date(),
    application.config.syncSeconds,
  );
}
