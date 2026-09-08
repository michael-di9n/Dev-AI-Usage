import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config";
import { LEARNING_PATH } from "../src/onboarding/NextStep";

/**
 * Documentation that has drifted is worse than none: it sends people to a
 * command that no longer exists and costs them the trust they had. So the
 * claims in the docs are checked the same way the code is.
 */

const MARKDOWN = [
  "README.md",
  ...globSync("docs/*.md"),
  ...globSync("exercises/*.md"),
  ...globSync("mcp/*.md"),
];

const read = (path: string) => readFileSync(path, "utf8");
const allDocs = () => MARKDOWN.map((path) => ({ path, text: read(path) }));

const packageScripts = (): Record<string, string> =>
  (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;

describe("documented commands exist", () => {
  it("every `npm run X` in the docs is a real script", () => {
    const scripts = packageScripts();
    const missing: string[] = [];

    for (const { path, text } of allDocs()) {
      for (const m of text.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) {
        const name = m[1]!;
        if (!scripts[name]) missing.push(`${path}: npm run ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("`npm test` and the day-to-day commands are all present", () => {
    const scripts = packageScripts();
    for (const name of ["run", "dev", "doctor", "report", "ingest", "test", "ui-test"]) {
      expect(scripts, name).toHaveProperty(name);
    }
  });

  it("the commands in the in-app guide are real scripts too", () => {
    const scripts = packageScripts();
    for (const step of LEARNING_PATH) {
      const m = /^npm run ([a-z][a-z0-9:-]*)/.exec(step.command);
      if (m) expect(scripts, step.command).toHaveProperty(m[1]!);
    }
  });
});

describe("documented configuration exists", () => {
  const KNOWN = new Set(Object.keys(readConfig({})));

  /** Env vars the docs tell people to set must be ones readConfig looks at. */
  it("every DEV_AI_USAGE_* variable in the docs is read by the app", () => {
    const source = read("src/config.ts");
    const unknown: string[] = [];

    for (const { path, text } of allDocs()) {
      for (const m of text.matchAll(/\b(DEV_AI_USAGE_[A-Z_]+)\b/g)) {
        if (!source.includes(m[1]!)) unknown.push(`${path}: ${m[1]}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it("the Claude Code and Cursor variables the docs mention are read too", () => {
    const source = read("src/config.ts");
    for (const name of [
      "CLAUDE_CODE_PROJECTS_DIR", "CLAUDE_CONFIG_DIR",
      "CURSOR_TRACKING_DB", "CURSOR_STATE_DB",
      "ANTHROPIC_ADMIN_KEY",
    ]) {
      expect(source, name).toContain(name);
    }
  });

  it("produces a config with every documented key", () => {
    for (const key of ["claudeProjectsDir", "databasePath", "spoolPath", "observabilityDir", "uiScreenshotDir"]) {
      expect(KNOWN, key).toContain(key);
    }
  });
});

describe("documented files exist", () => {
  it("every internal markdown link resolves", () => {
    const broken: string[] = [];

    for (const { path, text } of allDocs()) {
      const base = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
      for (const m of text.matchAll(/\[[^\]]*\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
        const target = m[1]!;
        if (/^(https?:|mailto:)/.test(target)) continue;
        if (!existsSync(join(base, target))) broken.push(`${path} -> ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("the learning path files all exist and are in order", () => {
    for (const n of ["01-first-run", "02-reading-the-dashboard", "03-acting-on-trends", "04-troubleshooting", "05-how-it-works"]) {
      expect(existsSync(join("docs", `${n}.md`)), n).toBe(true);
    }
  });

  it("each exercise the app points at exists", () => {
    for (const n of ["README", "01-enable-otel", "02-register-hooks", "03-github-actions"]) {
      expect(existsSync(join("exercises", `${n}.md`)), n).toBe(true);
    }
  });
});

describe("docs stay readable", () => {
  /** Prose only: code blocks and tables are exempt from sentence length. */
  const prose = (text: string) =>
    text.replace(/```[\s\S]*?```/g, "").replace(/^\|.*$/gm, "").replace(/^\s*>.*$/gm, "");

  it("keeps average sentence length conversational", () => {
    for (const { path, text } of allDocs()) {
      const sentences = prose(text)
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.split(/\s+/).length > 3);
      if (sentences.length < 5) continue;

      const words = sentences.reduce((n, s) => n + s.split(/\s+/).length, 0);
      expect(words / sentences.length, `${path} average sentence length`).toBeLessThan(24);
    }
  });

  it("every doc opens with a heading", () => {
    for (const { path, text } of allDocs()) {
      expect(text.trimStart().startsWith("#"), path).toBe(true);
    }
  });
});
