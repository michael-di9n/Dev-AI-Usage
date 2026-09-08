import { cookies, headers } from "next/headers";
import { CoinStack } from "../components/CoinStack";
import { HabitBadges } from "../components/HabitBadges";
import { PeriodFilter } from "../components/PeriodFilter";
import { TrendChart } from "../components/TrendChart";
import { GettingStarted, NothingYet } from "../components/GettingStarted";
import { Page } from "../components/Page";
import { Delta, Pct, Section, TableFoot, Tile, Usd, Value, shortPath } from "../components/primitives";
import {
  CalendarIcon, ClockIcon, FolderIcon, LayersIcon, MessageIcon, OutputIcon, SparkIcon,
  CacheMissIcon,
} from "../components/icons";
import { habitBadges } from "../domain/habitBadges";
import { granularityFor, periodOf } from "../domain/period";
import { LiveRefresh } from "../components/LiveRefresh";
import { ModelMix } from "../components/ModelMix";
import { RememberSlice } from "../components/RememberSlice";
import { Standings } from "../components/Standings";
import { UsageBand } from "../components/UsageBand";
import { standings } from "./standings";
import { SLICE_COOKIE, app, freshness, onboarding, sliceFrom } from "./dashboard";

export const dynamic = "force-dynamic";

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // The URL wins where it says anything; the cookie only answers the case the
  // URL leaves open, which is someone arriving at "/" with no query at all.
  const slice = sliceFrom(params, (await cookies()).get(SLICE_COOKIE)?.value);
  const period = periodOf(slice.period);
  const granularity = granularityFor(period, slice.by);

  const fresh = freshness();
  const state = onboarding();
  /*
   * The one state that is genuinely an absence: nothing has ever been
   * imported, so no figure on this page has a source that could answer it.
   * That is what the guide is for, and it is the only thing that replaces the
   * page. An empty *period* inside a corpus that does have data is a different
   * answer - zero - and is rendered below like any other.
   */
  if (state.showGuide) {
    return (
      <Page title="Trends" lede="What you spent, on what, over time.">
        <GettingStarted state={state} />
        {/* The band comes with the guide, because a blank band that says why
            it is blank is the point of it. It used to arrive here from the top
            bar; now that it lives in the page body it has to be asked for. */}
        <UsageBand />
      </Page>
    );
  }

  const queries = app().queries;
  const totals = queries.totals(period.id);
  const today = queries.totals("today");
  const previous = queries.previousTotals(period.id);
  const series = queries.series(period.id, granularity);
  const projects = queries.byProject(period.id);
  const tools = queries.toolMix(period.id);
  const models = queries.modelMix(period.id);
  const opinions = queries.costSecondOpinion(6);
  const habits = queries.habits(period.id);

  const cachedInput = totals.cacheRead + totals.cacheCreate;
  const misses = totals.cacheMisses;

  return (
    <Page
      title="Trends"
      lede="Developer usage trends"
      meta={
        <>
          {totals.sessions.toLocaleString()} sessions {period.phrase}
          {" · "}
          {/* The age of the figures, beside the figures. A number nobody can
              tell is stale is worse than an empty page: the empty page sends
              you to fix it, and this one gets acted on. */}
          <span className={fresh.stale ? "stale" : undefined} title={`The importer last ran ${fresh.phrase}. It runs again while this page is open.`}>
            imported {fresh.phrase}
          </span>
        </>
      }
      action={<LiveRefresh seconds={60} />}
    >
      <PeriodFilter period={period} granularity={granularity} />
      {/* Renders nothing. It records the slice above so returning to "/" lands
          back here instead of on the default. */}
      <RememberSlice name={SLICE_COOKIE} period={period.id} granularity={granularity} />

      {/*
        No "nothing recorded" branch. There used to be one, and picking Today
        on a day you had not started yet replaced the whole page with a panel
        saying so - every figure, badge and chart gone, including the ones
        whose answer was a perfectly good zero.

        A window with no sessions in it is not a window we cannot measure. You
        spent nothing, you used no skills, you wrote no tokens: the figures are
        zero and they are shown as zero. The two things that stay dashes are
        the ones that are still genuinely unanswerable - a share with nothing
        in its denominator, and a change against a period that was itself
        empty - and both already draw their own em dash.
      */}
      <>
          {/* The hero: one number the page leads with. Exactly one, so it
              stays the thing your eye lands on. */}
          <Section title={`Derived cost, ${period.phrase}`}>
            <div className="hero-row">
              {/* The cost column: the figure, and the band that says whether
                  it is a lot. The band is inside this column rather than
                  under the whole row, because the row is as tall as the
                  taller of the two and a band under it sat a hand's width
                  below the figure it reads. */}
              <div className="hero-col">
              <div className="hero">
                {/* One column, read top to bottom: the figure, what it is, the
                    bar that is its underline, and the models the bar names.
                    The mix used to sit across the card floor under the coins,
                    which made the split look like a footnote on a number
                    rather than a reading of it. */}
                <div className="hero-main">
                  <div className="hero-v"><Usd n={totals.costUsd} /></div>
                  <div className="hero-s">
                    from published rates, not a bill
                    {" · "}
                    <Delta
                      from={previous.costUsd}
                      to={totals.costUsd}
                      against={period.comparisonPhrase}
                      format="usd"
                    />
                  </div>

                  {/* The same total, split by what answered. Inside the card
                      because it is the hero taken apart, not a new figure. */}
                  <ModelMix models={models} period={period.phrase} />
                </div>

                {/* The same number as a size. Beside the figure rather than
                    instead of it: the stack rounds down to whole coins, so it
                    can only ever be the second way to read the total. */}
                <CoinStack amountUsd={totals.costUsd} />
              </div>

              {/* Directly under the cost, because it is a reading of the same
                  work. Under the panel rather than inside it: the panel is
                  the derived figure taken apart, and the band is a second
                  measurement of the same period, not a fifth part of the
                  first. */}
              <div className="bands">
                <UsageBand />
                {/* The other two readings of this setup, at the weight of a
                    cross-reference rather than a headline. */}
                <Standings data={standings(await receiverOrigin())} />
              </div>
              </div>

              {/* The right-hand column: what today cost so far, and how the
                  period was worked. Both are readings of the same slice as the
                  hero, so they belong beside it rather than further down. */}
              <div className="hero-side">
                <Tile
                  label="Today so far"
                  icon={<ClockIcon />}
                  tone="accent"
                  value={<Usd n={today.costUsd} />}
                  sub={`${today.sessions.toLocaleString()} session${today.sessions === 1 ? "" : "s"}, ${today.messages.toLocaleString()} messages`}
                />
                {/* One window, one function. A one-day window is still asking
                    a narrower question, and the heading says so - but the
                    bands are rates per active day, so a single day divides by
                    one and gets banded like any other. */}
                <HabitBadges
                  badges={habitBadges(habits)}
                  describing={period.spansOneDay ? period.phrase : null}
                />
              </div>
            </div>
          </Section>

          <Section title="The rest of it">
            <div className="tiles">
              <Tile
                label="Output tokens"
                icon={<OutputIcon />}
                value={<Value n={totals.outputTokens} />}
                sub={
                  <Delta
                    from={previous.outputTokens}
                    to={totals.outputTokens}
                    against={period.comparisonPhrase}
                  />
                }
              />
              <Tile
                label="Thinking share"
                icon={<SparkIcon />}
                value={<Pct part={totals.thinkingTokens} whole={totals.outputTokens} />}
                sub="of output tokens"
              />
              <Tile
                label="Cache read share"
                icon={<LayersIcon />}
                value={<Pct part={totals.cacheRead} whole={cachedInput} />}
                sub="higher is cheaper"
              />
              {/* The one red figure on the page. Red marks money that bought
                  nothing, not a verdict on how the time was spent: stepping
                  away mid-session is a normal thing to do. */}
              <Tile
                label="Cache misses"
                icon={<CacheMissIcon />}
                tone="alert"
                value={<Value n={misses.events} />}
                sub={
                  misses.events === 0
                    ? "the cache never went cold"
                    : (
                      <>
                        <Usd n={misses.premiumUsd} /> over a cache hit
                        {" · "}
                        <Value n={misses.tokens} /> tokens written again
                      </>
                    )
                }
              />
              {/* The count, and the window it counted. It used to read "too
                  few to trend" under ten days, which is a verdict on the
                  reader's sample size in place of the fact they asked for -
                  and on the Today filter it could only ever say that. */}
              <Tile
                label="Days with data"
                icon={<CalendarIcon />}
                value={<Value n={totals.activeDays} />}
                sub={`with a session ${period.phrase}`}
              />
              <Tile
                label="Messages"
                icon={<MessageIcon />}
                value={<Value n={totals.messages} />}
                sub={`across ${totals.sessions.toLocaleString()} session${totals.sessions === 1 ? "" : "s"}`}
              />
            </div>
          </Section>

          <Section title={`Cost, by ${granularity}`}>
            <div className="panel panel-pad">
              <TrendChart
                points={series.map((s) => ({ date: s.date, value: s.costUsd ?? 0, beforePeriod: s.beforePeriod }))}
                label="Derived cost"
                granularity={granularity}
                valueFormat="usd"
              />
            </div>
          </Section>

          <Section title={`Output tokens, by ${granularity}`}>
            <div className="panel panel-pad">
              <TrendChart
                points={series.map((s) => ({ date: s.date, value: s.outputTokens, beforePeriod: s.beforePeriod }))}
                label="Output tokens"
                granularity={granularity}
                valueFormat="count"
              />
            </div>
          </Section>

          <Section
            title={`Cost of lapsed caches, by ${granularity}`}
            note="A cached prompt expires five minutes after its last use. Step away for longer and the whole prefix is written again on your next message — charged at the write rate rather than the read rate, which is roughly twelve times more. This is that difference: what the lapses cost over a cache hit. It counts only sessions that had already been reading from the cache, so a session's unavoidable first write is not in here."
          >
            <div className="panel panel-pad">
              <TrendChart
                points={series.map((s) => ({ date: s.date, value: s.cacheMissUsd ?? 0, beforePeriod: s.beforePeriod }))}
                label="Cost of lapsed caches"
                granularity={granularity}
                valueFormat="usd"
                tone="alert"
              />
            </div>
          </Section>

          <Section
            title={`Cache reads, by ${granularity}`}
            note="A cache read costs about a twelfth of a cache write. If the read share falls, something is rebuilding context you already paid for."
          >
            <div className="panel panel-pad">
              <TrendChart
                points={series.map((s) => ({ date: s.date, value: s.cacheRead, beforePeriod: s.beforePeriod }))}
                label="Cache read tokens"
                granularity={granularity}
                valueFormat="count"
              />
            </div>
          </Section>
      </>

      <Section title="By project">
        <div className="panel">
          {projects.length === 0 ? (
            <NothingYet what={`No sessions ${period.phrase}. Try a wider period.`} />
          ) : (
            <>
              <div className="panel-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th className="num">Sessions</th>
                      <th className="num">Derived cost</th>
                      <th className="num">Output</th>
                      <th className="num">Cache read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => (
                      <tr key={p.project}>
                        <td>
                          <div className="cell-main">
                            <span className="cell-icon"><FolderIcon /></span>
                            {shortPath(p.project)}
                          </div>
                          <div className="cell-sub">{p.project}</div>
                        </td>
                        <td className="num"><Value n={p.sessions} /></td>
                        <td className="num"><Usd n={p.costUsd} /></td>
                        <td className="num"><Value n={p.outputTokens} /></td>
                        <td className="num"><Value n={p.cacheRead} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TableFoot showing={projects.length} total={projects.length} note="Ordered by cost" />
            </>
          )}
        </div>
      </Section>

      <Section
        title="Tool mix"
        note="Average duration needs the hook from exercise 02. Until then it shows an em dash, because nothing else can measure it."
      >
        <div className="panel">
          {tools.length === 0 ? (
            <NothingYet what={`No tool calls ${period.phrase}.`} />
          ) : (
            <>
              <div className="panel-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Tool</th>
                      <th className="num">Calls</th>
                      <th className="num">Failures</th>
                      <th className="num">Failure rate</th>
                      <th className="num">Avg duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.map((t) => (
                      <tr key={t.toolName}>
                        <td><code>{t.toolName}</code></td>
                        <td className="num"><Value n={t.calls} /></td>
                        <td className="num"><Value n={t.failures} /></td>
                        <td className="num"><Pct part={t.failures} whole={t.calls} /></td>
                        <td className="num">
                          <Value n={t.avgMs === null ? null : t.avgMs / 1000} suffix="s" digits={1} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TableFoot showing={tools.length} total={tools.length} note="Most used first" />
            </>
          )}
        </div>
      </Section>

      <Section
        title="Second opinion"
        note="Your derived cost beside the figure Claude Code recorded for itself. They count different messages — its figure resets when you resume a session and skips subagents — so a gap here is expected, not a pricing error."
      >
        <div className="panel">
          {opinions.length === 0 ? (
            <NothingYet what="None of your sessions carried Claude Code's own cost figure. Only newer versions write it." />
          ) : (
            <div className="panel-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Session</th>
                    <th className="num">Derived</th>
                    <th className="num">Claude Code&rsquo;s figure</th>
                  </tr>
                </thead>
                <tbody>
                  {opinions.map((o) => (
                    <tr key={o.sessionId}>
                      <td><code>{o.sessionId.slice(0, 8)}</code></td>
                      <td className="num"><Usd n={o.derivedUsd} /></td>
                      <td className="num"><Usd n={o.reportedUsd} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>
    </Page>
  );
}

/**
 * The address this request arrived on.
 *
 * The observability standing checks a configured endpoint against this
 * receiver, and the port is whatever Next settled on at startup - so it has to
 * be read from the request rather than assumed, exactly as the readiness page
 * reads it.
 */
async function receiverOrigin(): Promise<string> {
  const head = await headers();
  return `${head.get("x-forwarded-proto") ?? "http"}://${head.get("host") ?? "localhost:3000"}`;
}
