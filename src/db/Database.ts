import { DatabaseSync, type StatementSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * The schemas this driver knows how to apply.
 *
 * A fixed table rather than a path argument: `migrate` reads a file and
 * executes it, so anything that let a caller name an arbitrary path would be
 * arbitrary SQL execution one refactor away from user input.
 */
export type SchemaName = "usage" | "archive";

const SCHEMA_FILE: Record<SchemaName, string> = {
  usage: "schema.sql",
  archive: "archive-schema.sql",
};

/**
 * The only place node:sqlite is touched.
 *
 * node:sqlite is used over better-sqlite3 to keep the project free of a native
 * build step. Its API is still marked experimental, so it is confined here:
 * swapping drivers means rewriting this file and nothing else.
 */
export class Db {
  /**
   * Prepared statements, by their SQL.
   *
   * Every read used to re-prepare: a trace render issues sixteen statements
   * and Trends more, and each one re-parsed and re-planned SQL that had not
   * changed since the process started. The text is the whole key, because the
   * schema is fixed at open time - `migrate` runs once, and nothing here
   * issues DDL afterwards - so a plan prepared now is still correct later.
   *
   * Parameters are still bound per call, so this caches the plan and never a
   * result. Two callers asking the same question with different arguments get
   * different answers, exactly as before.
   */
  private readonly statements = new Map<string, StatementSync>();

  private constructor(private readonly handle: DatabaseSync) {}

  private prepared(sql: string): StatementSync {
    const hit = this.statements.get(sql);
    if (hit) return hit;

    const statement = this.handle.prepare(sql);
    this.statements.set(sql, statement);
    return statement;
  }

  static open(path: string): Db {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const handle = new DatabaseSync(path);
    // WAL lets the dashboard read while an ingest is writing.
    if (path !== ":memory:") handle.exec("PRAGMA journal_mode = WAL");
    handle.exec("PRAGMA foreign_keys = ON");
    // WAL keeps readers out of a writer's way, but it does not make two
    // writers wait for each other - the second gets SQLITE_BUSY immediately.
    // Since the dashboard began importing on a timer there are routinely two:
    // the server, and whoever just typed `npm run run` in a terminal. Without
    // this, that collision surfaces as a failed import roughly whenever the
    // two happen to overlap, which reads like a bug in the ingest rather than
    // like contention. An import takes well under a second, so five is a long
    // wait and still far shorter than any human notices.
    handle.exec("PRAGMA busy_timeout = 5000");
    return new Db(handle);
  }

  static openMigrated(path: string, schema: SchemaName = "usage"): Db {
    const db = Db.open(path);
    db.migrate(schema);
    return db;
  }

  migrate(schema: SchemaName = "usage"): void {
    this.handle.exec(readFileSync(join(SCHEMA_DIR, SCHEMA_FILE[schema]), "utf8"));
  }

  run(sql: string, params: unknown[] = []): void {
    this.prepared(sql).run(...(params as never[]));
  }

  all<T>(sql: string, params: unknown[] = []): T[] {
    return this.prepared(sql).all(...(params as never[])) as T[];
  }

  one<T>(sql: string, params: unknown[] = []): T | null {
    return (this.prepared(sql).get(...(params as never[])) as T | undefined) ?? null;
  }

  /** All-or-nothing. Ingest wraps one source file per transaction so a crash
   *  mid-file cannot leave a half-consumed byte offset committed. */
  transaction<T>(fn: () => T): T {
    this.handle.exec("BEGIN");
    try {
      const result = fn();
      this.handle.exec("COMMIT");
      return result;
    } catch (error) {
      this.handle.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    // Dropped before the handle goes: a statement outliving the connection it
    // was prepared on is a use-after-free waiting for the next caller.
    this.statements.clear();
    this.handle.close();
  }
}
