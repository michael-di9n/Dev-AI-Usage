import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config";

/**
 * This tool observes. It reads files Claude Code and Cursor already wrote on
 * this machine, and works out where the money and the time went.
 *
 * It asks no model anything. Not for a number, not for a label, not for a
 * verdict on a screenshot. That used to be a switch you could turn on, and now
 * it is a property of the code: there is nothing left that could make the call.
 *
 * The checks below are greppable on purpose. "We do not send anything" is only
 * worth saying if something fails when it stops being true, and the way it
 * stops being true is one import in one new file.
 */

const SOURCES = (dir: string): string[] => {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...SOURCES(path));
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
};

const containing = (needle: string): string[] =>
  SOURCES("src").filter((path) => readFileSync(path, "utf8").includes(needle));

describe("nothing under src/ can reach a model", () => {
  it("imports no model SDK", () => {
    expect(containing("@anthropic-ai/sdk")).toEqual([]);
    expect(containing("@google/gen")).toEqual([]);
    expect(containing("from \"openai\"")).toEqual([]);
  });

  it("does not ship a model SDK as a dependency either", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const all = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(all.filter((n) => /anthropic|openai|langchain/.test(n))).toEqual([]);
  });

  /**
   * A child process is how the old CLI backend reached a model without a key,
   * and it is the obvious way to bring that back without importing anything.
   */
  it("spawns no child process", () => {
    expect(containing("node:child_process")).toEqual([]);
  });
});

describe("the one outbound request is a read", () => {
  /**
   * The Admin usage endpoint asks your organisation for its own records. It
   * sends no transcript text, no prompt and no figure out of the database, and
   * without ANTHROPIC_ADMIN_KEY the source skips itself, which is the default.
   */
  it("lives in exactly one file", () => {
    expect(containing("fetch")).toEqual(["src/ingest/analytics/AnalyticsSource.ts"]);
  });

  it("is the only credential the config reads", () => {
    const keys = Object.entries(readConfig({}))
      .filter(([name]) => /key|token|secret|credential/i.test(name))
      .map(([name]) => name);
    expect(keys).toEqual(["anthropicAdminKey"]);
  });
});
