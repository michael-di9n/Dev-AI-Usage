import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { Env } from "../../config";
import type {
  HookHandler,
  SettingsFile,
  SettingsLayer,
  SettingsScan,
  SettingsValue,
  UserSettingsLocation,
  UserSettingsSource,
} from "../../domain/instrumentation";
import { MAX_READ_BYTES, safeJson, safeRead } from "../safeFs";

/**
 * Reads the Claude Code settings files actually in force, and says which is
 * which.
 *
 * A sibling of `RepoScanner` rather than part of it. That one answers "how much
 * of Claude Code does this repository configure" and looks only inside the
 * repository; this one answers "will a trace have durations in it", and the
 * answer to that usually lives in a file outside the repository entirely. Two
 * questions, two scanners, one reason to change each.
 *
 * Like `RepoScanner` it is not an `IngestSource` and writes nothing. It is
 * called synchronously from the page on every render, because it is three
 * small file reads and a cached answer could name a settings file that has
 * since been edited - which is the failure this whole tool exists to avoid.
 */
export class SettingsScanner {
  /**
   * `nominated` is a user-scope path the reader chose, and it wins over both
   * of the usual answers.
   *
   * It belongs beside `env` and `home` because it is the same kind of thing:
   * part of where this scanner looks, fixed for the life of one scan. It is
   * passed in rather than read here because a scanner that reached for the
   * database to find out where to read would be two reasons to change in one
   * class - and this one is deliberately storage-free.
   */
  constructor(
    private readonly env: Env = process.env,
    private readonly home: string = process.env.HOME ?? homedir(),
    private readonly nominated: string | null = null,
  ) {}

  scan(root: string, receiverOrigin: string, now: Date = new Date()): SettingsScan {
    const layers = this.layerPaths(root);

    const files: SettingsFile[] = [];
    const merged: Record<string, SettingsValue> = {};
    const hooks: HookHandler[] = [];

    // Lowest precedence first, so a later layer simply overwrites.
    for (const { layer, path } of layers) {
      const file = this.readLayer(layer, path);
      files.push(file);
      if (!file.exists || file.problem) continue;

      const parsed = safeJson(safeRead(path));
      if (!parsed) continue;

      for (const [key, value] of Object.entries(envBlock(parsed))) {
        merged[key] = { value, layer, file: shortPath(path, this.home) };
      }
      hooks.push(...handlersIn(parsed, layer, shortPath(path, this.home)));
    }

    return {
      root,
      name: basename(root) || root,
      scannedAt: now.toISOString(),
      files,
      env: merged,
      hooks,
      ignoredUserFile: this.ignoredUserFile(),
      userSettings: this.userSettings(),
      receiverOrigin,
    };
  }

  /**
   * The three files, lowest precedence first.
   *
   * The user-level entry is one file, never two. `CLAUDE_CONFIG_DIR` wins over
   * `~/.claude` outright - the same precedence `resolveClaudeProjectsDir` in
   * src/config.ts follows, and for the same reason: on a machine that sets it,
   * a full and plausible `~/.claude` usually still exists and is never loaded.
   * Merging both here would report a setting as in force that Claude Code
   * never reads, which is worse than not looking at all.
   */
  private layerPaths(root: string): { layer: SettingsLayer; path: string }[] {
    return [
      { layer: "user", path: this.userSettingsPath() },
      { layer: "project", path: join(root, ".claude", "settings.json") },
      { layer: "local", path: join(root, ".claude", "settings.local.json") },
    ];
  }

  private userSettingsPath(): string {
    if (this.nominated) return this.nominatedPath();

    const configDir = this.env.CLAUDE_CONFIG_DIR;
    return configDir
      ? join(configDir, "settings.json")
      : this.homeSettingsPath();
  }

  /** The documented default, and what "reset" resets to. */
  private homeSettingsPath(): string {
    return join(this.home, ".claude", "settings.json");
  }

  /**
   * A nominated path, accepted as either the file or the directory holding it.
   *
   * Both are things a reader hands over when asked where their settings are -
   * one is what they would type, the other is what they get from copying a
   * path out of a file manager - and rejecting the directory would be
   * rejecting a correct answer on a technicality.
   */
  private nominatedPath(): string {
    const path = this.nominated!;
    try {
      if (statSync(path).isDirectory()) return join(path, "settings.json");
    } catch {
      // Does not exist, or cannot be stat'd. Reported by `userSettings`, which
      // needs the path as given so its sentence can name what was tried.
    }
    return path;
  }

  /**
   * Which file answered for user scope, and how that was decided.
   *
   * `fallback` is filled in whether or not a path was nominated, because it is
   * what the page offers as the way back. A reset button with nothing behind
   * it would be a control that cannot be used.
   */
  private userSettings(): UserSettingsLocation {
    const path = this.userSettingsPath();
    const source: UserSettingsSource = this.nominated
      ? "nominated"
      : this.env.CLAUDE_CONFIG_DIR
        ? "config-dir"
        : "home";

    return {
      path: shortPath(path, this.home),
      source,
      exists: existsSync(path),
      fallback: shortPath(this.homeSettingsPath(), this.home),
      problem: this.nominated && !existsSync(path) ? this.nominatedProblem(path) : null,
    };
  }

  /** Why a nominated path did not answer, in a sentence that names what was tried. */
  private nominatedProblem(resolved: string): string {
    const asked = this.nominated!;
    const shown = shortPath(resolved, this.home);
    return resolved === asked
      ? `${shown} does not exist. Check the path, or clear it to go back to the usual location.`
      : `${shortPath(asked, this.home)} is a directory with no settings.json in it, so ${shown} was not found.`;
  }

  /**
   * The user-level file that exists and is deliberately not read.
   *
   * Null in the ordinary case. It is only ever populated when
   * `CLAUDE_CONFIG_DIR` is set and `~/.claude/settings.json` also exists, which
   * is precisely the shape of the trap in docs/04-troubleshooting.md: the
   * settings the reader edited are valid, `jq` parses them, and nothing
   * happens. Naming the file is the whole fix.
   */
  private ignoredUserFile(): string | null {
    if (!this.env.CLAUDE_CONFIG_DIR) return null;

    const shadowed = join(this.home, ".claude", "settings.json");
    if (!existsSync(shadowed)) return null;

    /*
     * Setting CLAUDE_CONFIG_DIR to `~/.claude` is common and completely
     * harmless - it names the directory that would have been used anyway. The
     * first version of this compared only whether the variable was set, and so
     * raised the "this file is never read" alarm about the very file it had
     * just read, at the top of the page, above every other verdict. A warning
     * that fires on a correct configuration is worse than no warning: it
     * teaches the reader to scroll past the one that matters.
     */
    if (resolve(this.userSettingsPath()) === resolve(shadowed)) return null;

    return shortPath(shadowed, this.home);
  }

  private readLayer(layer: SettingsLayer, path: string): SettingsFile {
    const shown = shortPath(path, this.home);
    if (!existsSync(path)) {
      return { layer, path: shown, exists: false, problem: null };
    }

    let bytes = 0;
    try {
      bytes = statSync(path).size;
    } catch {
      return { layer, path: shown, exists: true, problem: "could not be read — check its permissions" };
    }
    if (bytes > MAX_READ_BYTES) {
      return { layer, path: shown, exists: true, problem: "is too large to be a settings file, so it was not parsed" };
    }

    const text = safeRead(path);
    if (!text) {
      return { layer, path: shown, exists: true, problem: "could not be read — check its permissions" };
    }
    if (!safeJson(text)) {
      return { layer, path: shown, exists: true, problem: "is not valid JSON, so Claude Code is not reading it either" };
    }
    return { layer, path: shown, exists: true, problem: null };
  }
}

/**
 * The `env` block, with every value as the string Claude Code would export.
 *
 * Non-scalars are dropped rather than stringified: `{}` is not a value anyone
 * meant to set, and `"[object Object]"` in a finding would be this page
 * inventing a measurement.
 */
function envBlock(parsed: Record<string, unknown>): Record<string, string> {
  const block = parsed.env;
  if (typeof block !== "object" || block === null) return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(block as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
    else if (typeof value === "number" || typeof value === "boolean") out[key] = String(value);
  }
  return out;
}

/**
 * Whether a hook command runs this tool's spool script.
 *
 * Matched on the filename, not on an absolute path built from this checkout's
 * location. A stricter check would call a working setup broken whenever the
 * repository has been moved, symlinked, or invoked through a wrapper - and a
 * false "not configured" on the page whose job is to explain why something is
 * not configured is the worst answer it could give. The cell prints the whole
 * command beside the verdict, so a reader can see what was matched.
 */
const SPOOLS = /hook-spool\.mjs/;

/**
 * Walks Claude Code's hooks shape: event -> matcher groups -> commands.
 *
 * The nesting is not ours and every level is optional in practice, so each step
 * is guarded rather than assumed. A hooks block this cannot understand yields
 * no handlers, which reads as "not registered" - the same answer as an absent
 * block, and the honest one, since a shape we cannot parse is a shape we cannot
 * vouch for.
 */
function handlersIn(
  parsed: Record<string, unknown>,
  layer: SettingsLayer,
  file: string,
): HookHandler[] {
  const block = parsed.hooks;
  if (typeof block !== "object" || block === null) return [];

  const out: HookHandler[] = [];
  for (const [event, groups] of Object.entries(block as Record<string, unknown>)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const inner = (group as { hooks?: unknown })?.hooks;
      if (!Array.isArray(inner)) continue;
      for (const entry of inner) {
        const command = (entry as { command?: unknown })?.command;
        if (typeof command !== "string" || !command.trim()) continue;
        out.push({ event, command, layer, file, spools: SPOOLS.test(command) });
      }
    }
  }
  return out;
}

/**
 * A path as the reader would type it, so `~/.claude/settings.json` is not
 * printed as a home directory nobody needs to see. Cosmetic, but these strings
 * go straight into a `fix` sentence that is meant to be followed.
 */
const shortPath = (path: string, home: string): string =>
  home && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
