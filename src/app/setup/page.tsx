import { Bay, Counter, DialRule, Knob, Lamp } from "../../components/Console";
import { GettingStarted } from "../../components/GettingStarted";
import { PathSheet } from "../../components/PathSheet";
import { ThemePicker } from "../../components/ThemePicker";
import { Page } from "../../components/Page";
import { BYTES, COUNT, bytes } from "../../domain/console";
import { app, freshness, onboarding } from "../dashboard";

export const dynamic = "force-dynamic";

const EXERCISES: Record<string, { files: string[]; unlocks: string }> = {
  hooks: {
    files: ["exercises/02-register-hooks.md"],
    unlocks: "per-tool duration, friction counts, import on session end",
  },
  otel: {
    files: ["exercises/01-enable-otel.md"],
    unlocks: "real active time, per-request latency, live events",
  },
};

/**
 * A lamp legend is the source's name with its parenthetical cut off.
 *
 * "Claude Code Analytics API (optional)" is a sentence, and a sentence
 * silkscreened under a lamp is a paragraph. The parenthetical says what the
 * dark lamp already says, so the legend keeps the name and drops it.
 */
function legendOf(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "");
}

export default async function SetupPage() {
  const application = app();
  const state = onboarding();
  const sources = await application.ingest.describe();
  const otelLastSeen = application.otlp.writer.lastSeenAt();
  const counts = application.queries.counts();
  const fresh = freshness();
  const syncDetail = application.queries.readState("last_sync_detail");
  const coverage = application.archive?.coverage() ?? null;

  const lamps = [
    ...sources.map((s) => ({
      id: s.id,
      label: legendOf(s.label),
      live: s.reason === null,
      detail: s.reason ?? "Reading.",
    })),
    {
      id: "sync",
      label: "Background import",
      live: application.config.syncSeconds > 0,
      detail: application.config.syncSeconds > 0
        ? `Every ${application.config.syncSeconds}s while the dashboard runs. Last pass ${fresh.phrase}${syncDetail ? ` — ${syncDetail}` : ""}.`
        : "Off (DEV_AI_USAGE_SYNC_SECONDS). Figures move only when you run the importer by hand.",
    },
    {
      id: "otel",
      label: "Live telemetry",
      live: otelLastSeen !== null,
      detail: otelLastSeen ? `Last record ${otelLastSeen}.` : "Nothing has reached the receiver yet.",
    },
    {
      id: "observability",
      label: "Observability module",
      live: application.observability.active.length > 0,
      detail: application.observability.active.length > 0
        ? `Recording via ${application.observability.active.join(", ")}.`
        : "Off (DEV_AI_USAGE_OBSERVABILITY).",
    },
  ];

  const live = lamps.filter((l) => l.live).length;

  /*
   * Three states, one panel shape.
   *
   * Off means the dials carry no pointer and the windows an em dash - never a
   * pointer resting on NONE, which would be a reading nobody took. Zero files
   * is the opposite case: a measured nothing, so the pointer sits at NONE and
   * the window says 0. The line under the dials is what changes between them.
   */
  const ratio = coverage && coverage.storedBytes > 0 ? coverage.bytes / coverage.storedBytes : null;
  const archiveFoot = coverage === null
    ? <>Archiving is off (<code>DEV_AI_USAGE_ARCHIVE</code>). Transcripts stay readable only until Claude Code expires them.</>
    : coverage.files === 0
      ? <>Nothing archived yet. It runs when the dashboard starts and on every import, or now with <code>npm run archive</code>.</>
      : <>Last archived {coverage.lastArchivedAt ?? "—"}. Read it back with <code>npm run archive -- --verify</code>.</>;

  return (
    <Page
      title="Setup"
      lede="The back of the machine: what is wired in, how much is being kept, and where the files sit. Most lamps here are optional extras, so off is a normal state and not a failure."
      meta={`${live} of ${lamps.length} live`}
    >
      {state.showGuide ? <GettingStarted state={state} /> : null}

      <div className="console">
        <Bay
          legend="Transcript archive"
          note="Claude Code expires its own transcripts on a schedule this tool does not control. Everything else here keeps a parse; this keeps the bytes."
        >
          <div className="bay-split">
            <div className="knobs">
              <Knob
                label="Transcripts kept"
                value={coverage?.files ?? null}
                scale={COUNT}
                index={0}
                sub={coverage?.oldestSeenAt ? `since ${coverage.oldestSeenAt.slice(0, 10)}` : null}
              />
              <Knob
                label="Gone from disk"
                value={coverage?.missing ?? null}
                scale={COUNT}
                index={1}
                sub={coverage === null
                  ? null
                  : coverage.missing > 0 ? "the archive is the only copy" : "nothing expired yet"}
              />
              <Knob
                label="On disk"
                value={coverage?.storedBytes ?? null}
                scale={BYTES}
                render={bytes}
                index={2}
                sub={coverage === null
                  ? null
                  : ratio === null
                    ? <span className="dash" title="No transcript bytes to compare against">—</span>
                    : `${bytes(coverage.bytes)} of transcripts, ${ratio.toFixed(1)}x smaller`}
              />
            </div>

            <div className="bay-foot">
              <DialRule scales={[{ of: "files", scale: COUNT }, { of: "bytes", scale: BYTES }]} />
              <p className="bay-status">{archiveFoot}</p>
            </div>
          </div>
        </Bay>

        <Bay legend="Sources">
          <div className="lamps">
            {lamps.map((l) => (
              <Lamp key={l.id} label={l.label} live={l.live} detail={l.detail} fix={EXERCISES[l.id]} />
            ))}
          </div>
        </Bay>

        <Bay legend="Stored rows" note="Everything the derived database holds. This one can be deleted and rebuilt in a couple of seconds; the archive above it cannot.">
          <div className="counters">
            {Object.entries(counts).map(([table, n]) => (
              <Counter key={table} label={table.replace(/_/g, " ")} n={n} />
            ))}
          </div>
        </Bay>

        <Bay legend="Appearance">
          <ThemePicker />
        </Bay>
      </div>

      <PathSheet
        note="set in .env.local"
        rows={[
          { what: "Transcripts", where: <code>{application.config.claudeProjectsDir}</code> },
          { what: "Database", where: <code>{application.config.databasePath}</code> },
          {
            what: "Transcript archive",
            where: application.archive === null
              ? <span className="dash" title="DEV_AI_USAGE_ARCHIVE=off">—</span>
              : <code>{application.config.archivePath}</code>,
          },
          { what: "Hook spool", where: <code>{application.config.spoolPath}</code> },
          { what: "Run history", where: <code>{application.config.observabilityDir}</code> },
          { what: "Developer id", where: <code>{application.config.developerId}</code> },
        ]}
      />
    </Page>
  );
}
