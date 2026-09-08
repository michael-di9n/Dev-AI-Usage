import { createHash } from "node:crypto";

const ABS_PATH = /(?:\/[\w.@+-]+){2,}\/?/g;
const LEADING_CD = /^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*&&\s*/;
/** Two or more digits, not one: `python3` stays itself while `tail -20`,
 *  `tail -30`, `--port 4319` and `since=1785723357261` all collapse together.
 *  Clustering only needs shapes to match, so losing the exact number is free. */
const MULTI_DIGIT = /\d{2,}/g;
const WHITESPACE = /\s+/g;

/**
 * Turns a command or prompt into a shape that can be compared across sessions.
 *
 * Repetition is invisible in raw text - the same typecheck run appears under a
 * dozen spellings because the cwd, the tail count and a port all vary. Every
 * detector and every cluster key routes through here so "the same work" has
 * exactly one definition.
 */
export class Normalizer {
  normalizeCommand(command: string): string {
    return command
      .replace(LEADING_CD, "")
      .replace(ABS_PATH, "<path>")
      .replace(MULTI_DIGIT, "<n>")
      .replace(WHITESPACE, " ")
      .trim();
  }

  normalizePrompt(text: string): string {
    return text
      .toLowerCase()
      .replace(ABS_PATH, "<path>")
      .replace(MULTI_DIGIT, "<n>")
      .replace(WHITESPACE, " ")
      .trim();
  }

  /** Short digest, not the full 64 chars: these are index keys, not signatures. */
  hash(value: string): string {
    return createHash("sha256").update(value).digest("hex").slice(0, 16);
  }
}

const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", rb: "Ruby", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin",
  php: "PHP", cs: "C#", c: "C", h: "C", cpp: "C++", hpp: "C++", swift: "Swift",
  css: "CSS", scss: "CSS", html: "HTML", md: "Markdown", mdx: "Markdown",
  json: "JSON", yml: "YAML", yaml: "YAML", sql: "SQL", sh: "Shell", bash: "Shell",
};

export const OTHER_LANGUAGE = "Other";

export function languageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANGUAGE[ext] ?? OTHER_LANGUAGE;
}
