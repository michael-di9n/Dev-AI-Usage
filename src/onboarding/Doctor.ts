import { existsSync } from "node:fs";
import type { AppConfig } from "../config";
import type { QueryRepository } from "../db/QueryRepository";
import type { IngestRunner } from "../ingest/IngestRunner";

export type Health = "ok" | "todo" | "problem";

export interface CheckResult {
  name: string;
  health: Health;
  /** What is true right now, in plain terms. */
  finding: string;
  /** What to do about it. Empty when nothing needs doing. */
  fix: string;
}

export interface DoctorInput {
  config: AppConfig;
  queries: QueryRepository;
  ingest: IngestRunner;
  otelLastSeen: string | null;
}

/**
 * One command that answers "why isn't this working".
 *
 * Every check reports three things: what it looked at, what it found, and what
 * to type next. A diagnostic that says "FAIL" without the fix just moves the
 * problem, so `fix` is not optional in spirit - a check with nothing to fix is
 * simply healthy.
 *
 * `todo` is deliberately distinct from `problem`. Most of what this reports is
 * an optional extra not yet set up, and telling someone their working install
 * has five failures is both wrong and discouraging.
 */
export class Doctor {
  constructor(private readonly input: DoctorInput) {}

  async run(): Promise<CheckResult[]> {
    const { config, queries, otelLastSeen } = this.input;
    const counts = queries.counts();
    const sources = await this.input.ingest.describe();

    return [
      this.transcripts(config, counts),
      this.database(config, counts),
      ...sources
        .filter((s) => s.id !== "claude-code")
        .map((s) => this.source(s.id, s.label, s.reason)),
      this.otel(otelLastSeen),
    ];
  }

  private transcripts(config: AppConfig, counts: Record<string, number>): CheckResult {
    if (!existsSync(config.claudeProjectsDir)) {
      return {
        name: "Claude Code transcripts",
        health: "problem",
        finding: `Nothing at ${config.claudeProjectsDir}.`,
        fix:
          "If you use Claude Code elsewhere, set CLAUDE_CODE_PROJECTS_DIR in .env.local. Run `echo $CLAUDE_CONFIG_DIR` first - if that prints a path, the transcripts are under it in a `projects` folder.",
      };
    }
    if ((counts.session ?? 0) === 0) {
      return {
        name: "Claude Code transcripts",
        health: "todo",
        finding: `Found the folder at ${config.claudeProjectsDir}, but nothing has been imported.`,
        fix: "Run `npm run ingest`.",
      };
    }
    return {
      name: "Claude Code transcripts",
      health: "ok",
      finding: `${counts.session} sessions imported from ${config.claudeProjectsDir}.`,
      fix: "",
    };
  }

  private database(config: AppConfig, counts: Record<string, number>): CheckResult {
    if (!existsSync(config.databasePath)) {
      return {
        name: "Local database",
        health: "todo",
        finding: "No database file yet. It is created on the first import.",
        fix: "Run `npm run ingest`.",
      };
    }
    return {
      name: "Local database",
      health: "ok",
      finding: `${config.databasePath} holds ${counts.message ?? 0} messages and ${counts.tool_call ?? 0} tool calls.`,
      fix: "",
    };
  }

  /** A source that reports a reason is not broken - it is not set up. */
  private source(id: string, label: string, reason: string | null): CheckResult {
    if (reason === null) return { name: label, health: "ok", finding: "Reading.", fix: "" };
    return {
      name: label,
      health: "todo",
      finding: reason,
      fix: id === "hooks" ? "See exercises/02-register-hooks.md." : "",
    };
  }

  private otel(lastSeen: string | null): CheckResult {
    return lastSeen
      ? { name: "Live telemetry", health: "ok", finding: `Last record ${lastSeen}.`, fix: "" }
      : {
          name: "Live telemetry",
          health: "todo",
          finding: "Nothing has arrived at the OTLP receiver.",
          fix: "See exercises/01-enable-otel.md. Optional - it adds real active time and per-request latency.",
        };
  }
}

/** Nothing here blocks use of the tool; only a `problem` needs attention. */
export function summarise(results: CheckResult[]): string {
  const problems = results.filter((r) => r.health === "problem").length;
  const todos = results.filter((r) => r.health === "todo").length;
  if (problems > 0) return `${problems} thing${problems === 1 ? "" : "s"} needs fixing.`;
  if (todos > 0) return `Working. ${todos} optional extra${todos === 1 ? "" : "s"} not set up.`;
  return "Everything is set up.";
}
