import type { Db } from "../../db/Database";
import { failed, ok, skipped, type IngestResult, type IngestSource } from "../Source";

export interface AnalyticsDailyRow {
  date: string;
  developerId: string;
  model: string;
  numSessions: number;
  linesAdded: number;
  linesRemoved: number;
  commits: number;
  pullRequests: number;
  editAccepted: number;
  editRejected: number;
  tokensInput: number;
  tokensOutput: number;
  tokensCacheRead: number;
  tokensCacheCreate: number;
  costUsd: number | null;
}

export type Fetcher = typeof fetch;

/**
 * The Claude Code Analytics API: authoritative per-user daily cost, plus the
 * commit and PR counts that say whether AI output survived into the repo.
 *
 * Optional by design. It needs an organisation admin key, which many
 * developers cannot obtain for themselves, so its absence is a normal state
 * that leaves other panels intact rather than an error that stops ingest.
 */
export class AnalyticsSource implements IngestSource {
  readonly id = "analytics-api";
  readonly label = "Claude Code Analytics API (optional)";

  /** Re-read the trailing days each run: the endpoint lags by up to an hour,
   *  so the most recent buckets are still moving when we first see them. */
  private static readonly REFETCH_DAYS = 2;

  constructor(
    private readonly db: Db,
    private readonly adminKey: string | null,
    private readonly baseUrl: string,
    private readonly days: number,
    private readonly fetchImpl: Fetcher = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async unavailableReason(): Promise<string | null> {
    return this.adminKey
      ? null
      : "ANTHROPIC_ADMIN_KEY is not set. Authoritative cost, commit and PR counts stay unavailable; everything else still works.";
  }

  async ingest(): Promise<IngestResult> {
    const reason = await this.unavailableReason();
    if (reason) return skipped(this.id, reason);

    try {
      const rows = await this.fetchAll(this.startDate());
      this.db.transaction(() => rows.forEach((r) => this.save(r)));
      return ok(this.id, `${rows.length} authoritative daily rows`, rows.length);
    } catch (error) {
      return failed(this.id, error);
    }
  }

  private startDate(): string {
    const start = new Date(this.now());
    start.setUTCDate(start.getUTCDate() - (this.days + AnalyticsSource.REFETCH_DAYS));
    return start.toISOString().slice(0, 10);
  }

  private async fetchAll(startingAt: string): Promise<AnalyticsDailyRow[]> {
    const collected: AnalyticsDailyRow[] = [];
    let page: string | null = null;

    do {
      const url = new URL("/v1/organizations/usage_report/claude_code", this.baseUrl);
      url.searchParams.set("starting_at", startingAt);
      url.searchParams.set("limit", "100");
      if (page) url.searchParams.set("page", page);

      const response = await this.fetchImpl(url, {
        headers: {
          "x-api-key": this.adminKey ?? "",
          "anthropic-version": "2023-06-01",
        },
      });

      if (!response.ok) {
        // Name the credential, not the status code - a 401 here almost always
        // means a workspace key was used where an admin key is required.
        throw new Error(
          `Analytics API returned ${response.status}. ANTHROPIC_ADMIN_KEY must be an organisation admin key (sk-ant-admin...); workspace keys are rejected.`,
        );
      }

      const body = (await response.json()) as Record<string, unknown>;
      collected.push(...mapResponse(body));
      page = typeof body.next_page === "string" ? body.next_page : null;
    } while (page);

    return collected;
  }

  private save(r: AnalyticsDailyRow): void {
    this.db.run(
      `INSERT OR REPLACE INTO daily_analytics
        (date, developer_id, model, num_sessions, lines_added, lines_removed, commits,
         pull_requests, edit_accepted, edit_rejected, tokens_input, tokens_output,
         tokens_cache_read, tokens_cache_create, cost_usd_authoritative)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.date, r.developerId, r.model, r.numSessions, r.linesAdded, r.linesRemoved,
       r.commits, r.pullRequests, r.editAccepted, r.editRejected, r.tokensInput,
       r.tokensOutput, r.tokensCacheRead, r.tokensCacheCreate, r.costUsd],
    );
  }
}

const CENTS_PER_DOLLAR = 100;

/**
 * Flattens the API's user -> model nesting into one row per (date, user, model).
 * Exported so a recorded response can be mapped in a test without a network call.
 */
export function mapResponse(body: Record<string, unknown>): AnalyticsDailyRow[] {
  const rows: AnalyticsDailyRow[] = [];

  for (const entry of arr(body.data)) {
    const e = rec(entry);
    const date = str(e?.date);
    const developerId = str(e?.actor_email_address) ?? str(e?.subscription_type) ?? "unknown";
    if (!date) continue;

    const core = rec(e?.core_metrics) ?? e ?? {};
    const decisions = rec(e?.tool_actions) ?? {};
    const editTool = rec(decisions.edit_tool) ?? {};

    for (const breakdown of arr(e?.model_breakdown)) {
      const b = rec(breakdown);
      const tokens = rec(b?.tokens) ?? {};
      rows.push({
        date,
        developerId,
        model: str(b?.model) ?? "unknown",
        numSessions: int(core.num_sessions),
        linesAdded: int(rec(core.lines_of_code)?.added),
        linesRemoved: int(rec(core.lines_of_code)?.removed),
        commits: int(core.commits_by_claude_code),
        pullRequests: int(core.pull_requests_by_claude_code),
        editAccepted: int(editTool.accepted),
        editRejected: int(editTool.rejected),
        tokensInput: int(tokens.input),
        tokensOutput: int(tokens.output),
        tokensCacheRead: int(tokens.cache_read),
        tokensCacheCreate: int(tokens.cache_creation),
        costUsd: centsToUsd(rec(b?.estimated_cost)?.amount),
      });
    }
  }
  return rows;
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Rec) : null;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** null, not 0: an absent cost must render as unknown, never as free. */
function centsToUsd(cents: unknown): number | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return cents / CENTS_PER_DOLLAR;
}
