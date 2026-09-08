import { headers } from "next/headers";
import { Page } from "../../components/Page";
import { HygieneList } from "../../components/HygieneList";
import { ReadinessPipe } from "../../components/ReadinessPipe";
import { RepoPicker } from "../../components/RepoPicker";
import { UserSettingsPicker } from "../../components/UserSettingsPicker";
import { contentCells, hygieneFindings, requirementCells } from "../../domain/instrumentation";
import { observabilityView } from "../observability";

export const dynamic = "force-dynamic";

/**
 * Whether this machine is configured to produce an in-depth trace.
 *
 * One question, answered at a glance. The eight requirements with their fixes
 * used to be printed here in full - fifteen cards of settings advice above
 * which the actual answer scrolled out of view - and then moved out to a
 * Telemetry tab and a Hooks tab, which fixed the page and broke the job: the
 * page that found the gap could no longer close it.
 *
 * They are back, one panel per node, shut until a node is clicked. The whole
 * of the answer is still the top two inches; the whole of the fix is one click
 * from the thing that is wrong.
 *
 * Deliberately not gated on the onboarding guide: this reads configuration
 * files off disk and works on a fresh clone with nothing imported. Sending
 * someone to run the importer when what they need is one settings change would
 * send them to fix the wrong thing.
 */
export default async function ObservabilityPage() {
  const view = observabilityView(await receiverOrigin());

  if (!view.scan) {
    return (
      <Page
        title="Observability"
        lede=""
      >
        {view.problem ? (
          <div className="panel panel-pad alert">
            <strong>That project could not be scanned.</strong>
            <p className="note" style={{ marginTop: 6 }}>{view.problem}</p>
          </div>
        ) : null}
        <RepoPicker projects={view.projects} selected={view.selectedPath} cwd={process.cwd()} />
      </Page>
    );
  }

  const { scan } = view;
  const cells = requirementCells(scan);
  const read = scan.files.filter((f) => f.exists && !f.problem);

  return (
    <Page
      title="Observability"
      lede="What this machine reports about itself while it runs. Every node is one setting; open it for the line that turns it on."
      meta={`${read.length} settings file${read.length === 1 ? "" : "s"} read`}
    >
      <RepoPicker
        key={scan.root}
        projects={view.projects}
        selected={view.selectedPath}
        cwd={scan.root}
        compact
      />

      {/*
        Which user-scope file answered, the one that is being shadowed if there
        is one, and the way to point at a different file - in one box, because
        they are one question.

        The shadowing trap used to be an alert of its own above this, and the
        two were never on screen together: this box hid itself as soon as a
        file had been found, which is exactly the case the alert fired in. A
        reader was told their settings file was ignored and offered nothing to
        do about it.

        Above the ladder either way. With no user-scope file read, every rung
        below is being judged on this project's settings alone, and a reader
        who keeps theirs somewhere unusual would otherwise see eight honest
        verdicts drawn from half the evidence.
      */}
      <UserSettingsPicker location={scan.userSettings} shadowed={scan.ignoredUserFile} />

      {scan.files.some((f) => f.problem) ? (
        <div className="panel panel-pad alert">
          <strong>A settings file could not be used.</strong>
          <ul className="note" style={{ marginTop: 6 }}>
            {scan.files.filter((f) => f.problem).map((f) => (
              <li key={f.path}><code>{f.path}</code> {f.problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ReadinessPipe
        cells={cells}
        content={contentCells(scan)}
        scan={scan}
        live={view.live}
        tap={view.tap}
      />

      {/*
        Lines to remove, not lines to add, which is why they are not nodes and
        never move the band. They came here with the Telemetry tab: they are the
        only high-severity finding this family has, and deleting the page that
        held them would have deleted the only thing that reports them. Renders
        nothing at all when nothing is wrong, which is the ordinary case.
      */}
      <HygieneList findings={hygieneFindings(scan)} />

      {/*
        The list of files read used to sit here. It went with the rest of the
        detail: every node now names the file its value came from, on the panel
        that opens on it, which is the place a reader asks the question. The
        two files that need saying out loud - one shadowed, one unparseable -
        still get their own panel at the top.
      */}
    </Page>
  );
}

/**
 * The address this request actually arrived on.
 *
 * Read from the Host header rather than assumed, because the port is whatever
 * Next settled on at startup - if another dev server already had 3000, this app
 * moved, and the exercise's copy-pasted endpoint then points at the wrong
 * process. Checking a reader's endpoint against a guess would be worse than not
 * checking it.
 */
async function receiverOrigin(): Promise<string> {
  const head = await headers();
  const host = head.get("host") ?? "localhost:3000";
  const proto = head.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
