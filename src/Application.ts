import { readFileSync } from "node:fs";
import { readConfig, type AppConfig, type Env } from "./config";
import { Db } from "./db/Database";
import { IngestRepository } from "./db/IngestRepository";
import { CostCalculator, PriceTable, type PriceTableFile } from "./domain/PriceTable";
import { Normalizer } from "./domain/Normalizer";
import { AnalyticsSource } from "./ingest/analytics/AnalyticsSource";
import { ClaudeCodeSource } from "./ingest/claude-code/ClaudeCodeSource";
import { TranscriptParser } from "./ingest/claude-code/TranscriptParser";
import { TranscriptScanner } from "./ingest/claude-code/TranscriptScanner";
import { CursorSource } from "./ingest/cursor/CursorSource";
import { ArchiveQueries } from "./db/ArchiveQueries";
import { ArchiveRepository } from "./db/ArchiveRepository";
import { TranscriptArchiveSource } from "./ingest/archive/TranscriptArchiveSource";
import { HookSpoolSource } from "./ingest/hooks/HookSpoolSource";
import { OtlpDecoder } from "./ingest/otlp/OtlpDecoder";
import { OtelWriter } from "./ingest/otlp/OtelWriter";
import { IngestRunner } from "./ingest/IngestRunner";
import { QueryRepository } from "./db/QueryRepository";
import { attachObservability, type ObservabilityHandle } from "./observability";

/**
 * The composition root: the one place that knows how the pieces fit together.
 *
 * Everything else takes its collaborators as constructor arguments, which is
 * what makes the parser and the sources testable without a database, a
 * filesystem or a network.
 */
export class Application {
  readonly db: Db;
  /**
   * The archive, or null when it is switched off.
   *
   * A second handle to a second file, which is the whole point: `db` is
   * derived and disposable, this one is not. Keeping them apart is what makes
   * "delete data/usage.db and re-run" safe advice to give.
   */
  readonly archiveDb: Db | null;
  /** Null when archiving is off, so callers must handle its absence. */
  readonly archive: ArchiveQueries | null;
  /**
   * Held by name as well as inside the runner, because the snapshot taken at
   * server start runs this one source alone. Starting a dev server should not
   * quietly perform a full import - but it should not let today's transcripts
   * expire unarchived either.
   */
  readonly archiveSource: TranscriptArchiveSource;
  readonly config: AppConfig;
  readonly queries: QueryRepository;
  /** The write side, exposed for the few UI actions that store a choice. Reads
   *  go through `queries`; the split is what keeps them changeable apart. */
  readonly writes: IngestRepository;
  readonly ingest: IngestRunner;
  readonly otlp: { decoder: OtlpDecoder; writer: OtelWriter };
  /** The one line that hooks observability in. Remove it and nothing else
   *  changes: every emit site talks to an Emitter, defaulting to a no-op. */
  readonly observability: ObservabilityHandle;

  /**
   * The price table, already loaded.
   *
   * Exposed so the trace page can split one run's cost by token class using
   * the same calculator that priced it on the way in. A second calculator
   * built from the same file would be a second thing to keep in step, and the
   * whole point of the split is that its parts add up to the total.
   */
  readonly costs: CostCalculator;

  private constructor(config: AppConfig, db: Db) {
    this.config = config;
    this.db = db;

    const repo = new IngestRepository(db);
    this.writes = repo;

    const archiving = config.archiveMode === "on";
    this.archiveDb = archiving ? Db.openMigrated(config.archivePath, "archive") : null;
    this.archive = this.archiveDb === null ? null : new ArchiveQueries(this.archiveDb);
    const prices = PriceTable.fromFile(
      JSON.parse(readFileSync(config.pricesPath, "utf8")) as PriceTableFile,
    );
    const normalizer = new Normalizer();
    // One calculator, both ends. Ingest stores the total cost of a message;
    // the read side prices what a lapsed cache cost, which cannot be stored
    // because rows outlive the transcripts they came from.
    const costs = new CostCalculator(prices);
    this.costs = costs;
    const parser = new TranscriptParser(costs, normalizer, config.developerId, config.traceChars);

    this.observability = attachObservability(config);
    this.queries = new QueryRepository(db, () => new Date(), costs);
    this.otlp = { decoder: new OtlpDecoder(), writer: new OtelWriter(db) };

    this.archiveSource = new TranscriptArchiveSource(
      this.archiveDb === null ? null : new ArchiveRepository(this.archiveDb),
      // Everything under the projects directory, not just the transcripts:
      // Claude Code expires the session directory, and the memory notes and
      // subagent metadata beside the .jsonl go with it.
      TranscriptScanner.everyFile(config.claudeProjectsDir),
      config.claudeProjectsDir,
    );

    this.ingest = new IngestRunner([
      new ClaudeCodeSource(
        db, repo,
        new TranscriptScanner(config.claudeProjectsDir),
        parser,
        config.claudeProjectsDir,
      ),
      this.archiveSource,
      new HookSpoolSource(db, repo, config.spoolPath),
      new CursorSource(db, config.cursorTrackingDb, config.cursorStateDb),
      new AnalyticsSource(db, config.anthropicAdminKey, config.analyticsBaseUrl, 30),
    ]);
  }

  static create(env: Env = process.env): Application {
    const config = readConfig(env);
    return new Application(config, Db.openMigrated(config.databasePath));
  }

  close(): void {
    this.db.close();
    this.archiveDb?.close();
  }
}
