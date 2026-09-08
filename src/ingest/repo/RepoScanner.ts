import { readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { MAX_READ_BYTES, safeJson, safeRead } from "../safeFs";
import {
  CAPABILITIES,
  ciFormsIn,
  hookCounts,
  type ArtefactFile,
  type Capability,
  type CapabilityPresence,
  type RepoScan,
} from "../../domain/readiness";

/** Prose and config: what seven of the eight capabilities are written in. */
const TEXT = /\.(md|mdc|markdown|json|ya?ml|txt)$/i;
/** A workflow script. `.md` stays in so a README beside them still counts. */
const SCRIPT = /\.(m?js|cjs|md)$/i;
/**
 * A pipeline. Narrower than TEXT on purpose: a README in `.github/workflows/`
 * is not a pipeline, and counting it would inflate the denominator in
 * "2 of 3 pipelines run Claude" - the one number in that cell whose job is to
 * say what the 2 is out of.
 */
const YAML = /\.ya?ml$/i;

/**
 * Where each capability lives, and what shape it takes.
 *
 * Skills and commands share an entry because they are the same move made
 * twice: a procedure you would otherwise retype, written down once and
 * invoked as `/name`. Counting them apart put a repo with four commands and
 * no skills at bronze in one cell and nothing in the next, which described
 * the directory layout rather than the practice.
 *
 * `dirs` walks a directory; `files` checks exact paths in order and takes the
 * first that exists. Both are listed even when absent, because an absence has
 * to be able to say what would have counted.
 *
 * `nested` says the same paths are looked for again in every subdirectory of
 * the repository, because for two of them that is where Claude Code and
 * Cursor actually read from. A monorepo's `packages/api/CLAUDE.md` is loaded
 * when work happens under `packages/api`, and a `packages/api/.cursor/rules/`
 * applies to the same subtree - so a repository that puts its standing
 * instructions next to the code they govern was reported as having none.
 *
 * `matches` is the extension filter for the walk, and it belongs here rather
 * than being one global pattern because the capabilities do not agree about
 * what a definition file is. Seven of them are prose or config; a workflow is
 * a script, and the Workflow tool takes plain JavaScript. Filtering the whole
 * scan through the prose pattern reported "0 workflows" for a repository whose
 * `.claude/workflows/` held three of them - a wrong number, on the one page
 * that is supposed to be checkable by looking in the directory.
 */
const SOURCES: Record<
  Capability,
  { dirs: string[]; files: string[]; matches?: RegExp; nested?: boolean }
> = {
  memory: { dirs: [], files: ["CLAUDE.md", "AGENTS.md", ".claude/CLAUDE.md"], nested: true },
  rules: {
    dirs: [".cursor/rules", ".claude/rules"],
    files: [".cursorrules", ".windsurfrules"],
    nested: true,
  },
  skills: { dirs: [".claude/skills", ".claude/commands"], files: [] },
  agents: { dirs: [".claude/agents"], files: [] },
  mcp: { dirs: [], files: [".mcp.json", ".claude/settings.json"] },
  hooks: { dirs: [], files: [".claude/settings.json"] },
  workflows: { dirs: [".claude/workflows"], files: [], matches: SCRIPT },
  // Both hosts, and both of GitLab's shapes: the root file, and the job files
  // a `.gitlab-ci.yml` pulls in with `include:`. Splitting jobs out is ordinary
  // GitLab practice, and reading only the root file reported "no CI" for
  // repositories whose Claude job was one `include:` away.
  ci: {
    dirs: [".github/workflows", ".gitlab/ci"],
    files: [".gitlab-ci.yml"],
    matches: YAML,
  },
};

/** Deep enough for `.claude/skills/<name>/SKILL.md`, shallow enough to stay fast. */
const MAX_DEPTH = 4;
/** A guard, not a policy. A pathological directory must not hang the dashboard. */
const MAX_FILES = 2_000;

/**
 * How far down the subdirectory search for nested configuration goes.
 *
 * Three is `packages/api/src` - deep enough for every monorepo layout in
 * ordinary use, and the level a `CLAUDE.md` is put at when it is put anywhere
 * but the root.
 */
const MAX_NESTED_DEPTH = 3;

/**
 * A cap on directories visited, and the reason it is separate from MAX_FILES.
 *
 * The nested search costs one `readdir` per directory whether or not anything
 * matches, so a wide tree is expensive in exactly the case MAX_FILES cannot
 * see: it counts what was found, and a repository with two thousand empty
 * directories finds nothing at all. Hitting this sets `truncated`, because a
 * search that stopped early must never read as one that finished and found
 * nothing.
 */
const MAX_NESTED_DIRS = 400;

/**
 * Never descended into.
 *
 * Dependency and build trees, which hold other people's `CLAUDE.md` files -
 * counting a vendored one as this repository's configuration is a wrong
 * number, and a wrong number is worse than a missing one. Dot directories are
 * skipped by the walk itself rather than listed here: `.claude` and
 * `.cursor` are looked *at* by name, as candidate paths under each
 * subdirectory, so there is never a reason to walk into one.
 */
const NEVER_NESTED = new Set([
  "node_modules", "vendor", "dist", "build", "out", "target", "coverage",
  "tmp", "venv", "__pycache__",
]);

/** Reading a whole file to count its headings is fine; reading a 5MB one is not. */

/**
 * Walks a repository for the configuration Claude Code reads.
 *
 * Deliberately narrow: it reads only the files that configure Claude Code and
 * Cursor, and it opens nothing else. That is what keeps it fast enough to run
 * on page load, and it is also why it can be pointed at any directory without
 * it becoming a code scanner that reads things the user did not expect.
 *
 * It does now *look* past the root, for the two capabilities that are read
 * from subdirectories - it lists directory names to find candidate paths, and
 * still opens only the candidates. The listing is bounded three ways: a depth
 * of MAX_NESTED_DEPTH, a cap of MAX_NESTED_DIRS directories, and NEVER_NESTED
 * for the trees that hold other people's configuration. Measured against this
 * repository the whole scan is single-digit milliseconds; if that ever stops
 * being true it is these three numbers that give.
 */
export class RepoScanner {
  scan(root: string, now: Date = new Date()): RepoScan {
    let filesSeen = 0;
    let truncated = false;

    // Once, and shared: memory and rules both look in every subdirectory, and
    // listing the tree twice would double the only part of this scan that
    // costs anything.
    const nested = this.subdirectories(root);
    if (nested.truncated) truncated = true;

    const capabilities: CapabilityPresence[] = CAPABILITIES.map((capability) => {
      const source = SOURCES[capability];
      const files: ArtefactFile[] = [];
      // The same file can be reached twice - a subdirectory that is itself a
      // candidate path, say - and a capability that counted one file as two
      // would report a band the reader cannot check.
      const seen = new Set<string>();
      const bases = source.nested ? ["", ...nested.dirs] : [""];
      const lookedFor = [
        ...source.files,
        ...source.dirs.map((d) => `${d}/`),
        // An absence has to say what would have counted, and for these two
        // that includes the subdirectory form. `**/` rather than a real path
        // because the answer is "any subdirectory", and rather than `*/`
        // because the search goes MAX_NESTED_DEPTH deep - a reader who
        // checked the page by running `ls */CLAUDE.md` would miss the
        // `packages/api/CLAUDE.md` this found.
        ...(source.nested
          ? [...source.files.map((f) => `**/${f}`), ...source.dirs.map((d) => `**/${d}/`)]
          : []),
      ];

      const take = (found: ArtefactFile[]) => {
        for (const file of found) {
          if (seen.has(file.path)) continue;
          seen.add(file.path);
          files.push(file);
          filesSeen += 1;
        }
      };

      outer: for (const base of bases) {
        for (const rel of source.files) {
          if (filesSeen >= MAX_FILES) { truncated = true; break outer; }
          const found = this.readOne(root, join(base, rel), capability);
          if (found) take([found]);
        }
        for (const dir of source.dirs) {
          if (filesSeen >= MAX_FILES) { truncated = true; break outer; }
          take(this.walk(root, join(root, base, dir), capability, source.matches ?? TEXT, 0));
        }
      }

      return {
        capability,
        present: files.length > 0 && this.qualifies(capability, files),
        files,
        lookedFor,
      };
    });

    return {
      root,
      name: basename(root) || root,
      scannedAt: now.toISOString(),
      capabilities,
      filesSeen,
      truncated,
    };
  }

  /**
   * Every subdirectory a nested capability's paths are looked for under.
   *
   * Breadth-first, so that when the cap bites it drops the deepest and most
   * distant directories rather than everything after the first branch - a
   * truncated search of a monorepo should still have seen `packages/*`.
   *
   * Symlinked directories are not followed: `withFileTypes` reports a symlink
   * as a symlink rather than a directory, so a link back up the tree cannot
   * turn this into a cycle. Following one would also let a repository report
   * a `CLAUDE.md` that lives somewhere else entirely.
   */
  private subdirectories(root: string): { dirs: string[]; truncated: boolean } {
    const dirs: string[] = [];
    const queue: { full: string; rel: string; depth: number }[] = [
      { full: root, rel: "", depth: 0 },
    ];

    while (queue.length > 0) {
      const here = queue.shift()!;
      if (here.depth >= MAX_NESTED_DEPTH) continue;
      let entries;
      try {
        entries = readdirSync(here.full, { withFileTypes: true });
      } catch {
        continue; // An unreadable subtree is an absence, never a crash.
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith(".") || NEVER_NESTED.has(entry.name)) continue;
        if (dirs.length >= MAX_NESTED_DIRS) return { dirs, truncated: true };
        const rel = join(here.rel, entry.name);
        dirs.push(rel);
        queue.push({ full: join(here.full, entry.name), rel, depth: here.depth + 1 });
      }
    }
    return { dirs, truncated: false };
  }

  /**
   * `mcp` and `hooks` both look at settings.json, but a settings file with
   * neither key configures neither. So presence is a content question for
   * those two, not a file-exists question.
   *
   * `ci` is the same shape for a different reason: every repository with a
   * test job has `.github/workflows/`, and that is not what this cell counts.
   */
  private qualifies(capability: Capability, files: ArtefactFile[]): boolean {
    if (capability === "mcp") {
      return files.some((f) => f.path === ".mcp.json" || f.frontmatter.__hasMcpServers === "true");
    }
    if (capability === "hooks") {
      return files.some((f) => f.frontmatter.__hasHooks === "true");
    }
    if (capability === "ci") {
      return files.some((f) => f.frontmatter.__usesClaude === "true");
    }
    return true;
  }

  private readOne(root: string, rel: string, capability: Capability): ArtefactFile | null {
    const full = join(root, rel);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      return null;
    }
    if (!stat.isFile()) return null;
    return this.describe(root, full, stat.size, stat.mtime, capability);
  }

  private walk(
    root: string,
    dir: string,
    capability: Capability,
    matches: RegExp,
    depth: number,
  ): ArtefactFile[] {
    if (depth > MAX_DEPTH) return [];
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return []; // An unreadable subtree is an absence, never a crash.
    }

    const found: ArtefactFile[] = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        found.push(...this.walk(root, full, capability, matches, depth + 1));
      } else if (entry.isFile() && matches.test(entry.name)) {
        try {
          const stat = statSync(full);
          const file = this.describe(root, full, stat.size, stat.mtime, capability);
          if (file) found.push(file);
        } catch {
          // Skip and carry on.
        }
      }
    }
    return found;
  }

  private describe(
    root: string,
    full: string,
    bytes: number,
    modified: Date,
    capability: Capability,
  ): ArtefactFile | null {
    const text = bytes <= MAX_READ_BYTES ? safeRead(full) : "";
    const frontmatter = parseFrontmatter(text);

    if (capability === "ci") {
      // `CI_FORMS` in the domain owns what counts; this records both the
      // answer and which rows produced it, so the cell can say how.
      const forms = ciFormsIn(text);
      frontmatter.__usesClaude = String(forms.length > 0);
      frontmatter.__claudeForms = forms.join(",");
    }

    if (full.endsWith("settings.json") || full.endsWith(".mcp.json")) {
      const parsed = safeJson(text);
      if (parsed) {
        const servers = Object.keys(parsed.mcpServers ?? {}).length;
        // `hookCounts` in the domain owns what a handler is; this only records
        // the two figures it returns, so the cell and the band cannot disagree
        // about how many there are.
        const hooks = hookCounts(parsed.hooks);
        frontmatter.__hasMcpServers = String(servers > 0);
        frontmatter.__serverCount = String(servers);
        // A hooks key with events under it configures hooks, even where none
        // of them has a matcher yet: the capability is present and the count
        // is what the band reads, and those are different questions.
        frontmatter.__hasHooks = String(hooks.events > 0);
        frontmatter.__hookEvents = String(hooks.events);
        frontmatter.__hookMatchers = String(hooks.matchers);
      }
    }

    return {
      path: relative(root, full) || basename(full),
      capability,
      bytes,
      lines: text ? text.split("\n").length : 0,
      modified: modified.toISOString(),
      frontmatter,
      headings: count(text, /^#{1,6}\s/gm),
      codeBlocks: Math.floor(count(text, /^```/gm) / 2),
      examples: count(text, /<example>/g),
    };
  }
}

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length;

/**
 * Reads YAML frontmatter, and only the scalar keys these rules care about.
 *
 * Not a YAML parser and not trying to be. Values may be quoted, folded with `>`
 * or continued across lines; all this needs is the key set and a usable length
 * for `description`, so a continuation line is appended to the previous key.
 */
export function parseFrontmatter(text: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};

  const out: Record<string, string> = {};
  let lastKey = "";
  for (const line of match[1]!.split("\n")) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv) {
      lastKey = kv[1]!;
      out[lastKey] = kv[2]!.trim().replace(/^["'>|]+\s*/, "").replace(/["']$/, "");
    } else if (lastKey && line.trim()) {
      out[lastKey] = `${out[lastKey]} ${line.trim()}`.trim();
    }
  }
  return out;
}
