import { readFileSync } from "node:fs";

/**
 * Reads that treat an unreadable file as an absence rather than a crash.
 *
 * Extracted from `RepoScanner` when `SettingsScanner` needed the same three
 * things. Both walk configuration a user owns and neither may fail the page
 * over a permission bit or a stray comma - a dashboard that throws on a
 * malformed settings.json is less useful than one that says which file it
 * could not read.
 */

/**
 * A ceiling on what gets parsed. A settings.json or a CLAUDE.md is kilobytes;
 * anything past this is not the file we think it is, and reading it would cost
 * the page more than the answer is worth.
 */
export const MAX_READ_BYTES = 512 * 1024;

export const safeRead = (path: string): string => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
};

export const safeJson = (text: string): Record<string, Record<string, unknown>> | null => {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, Record<string, unknown>>)
      : null;
  } catch {
    return null;
  }
};
