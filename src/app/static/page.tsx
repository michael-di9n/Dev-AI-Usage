import { CapabilityGrid } from "../../components/CapabilityGrid";
import { Page } from "../../components/Page";
import { RepoPicker } from "../../components/RepoPicker";
import { capabilityCells, maturityScore } from "../../domain/readiness";
import { readinessView } from "../readiness";

export const dynamic = "force-dynamic";

/**
 * AI maturity, and the first thing anyone sees.
 *
 * The route is still `/static`, which is what it was called when the page was
 * "Static analysis". Left alone deliberately: it is in people's history and in
 * every screenshot filename the UI checks have written, and a rename would buy
 * a tidier URL at the cost of both.
 *
 * It is first because it is the only page that answers a question before any
 * data has been imported: it reads a repository's configuration off disk, so it
 * works on a fresh clone, on a machine that has never run the importer, and
 * with every AI feature switched off.
 *
 * One grid and a footer, and it used to be six sections. Four of them went,
 * and each for the same reason: the page said the same thing more than once. A
 * row of tiles counted the columns of the table beneath it; a "tool surface"
 * pair repeated the MCP and hook figures from the cells above; and the two
 * tables listed per-file measurements that the cells now carry beside the tier
 * those measurements decide. Nothing that was measured has stopped being
 * shown - it is shown once, next to the thing it is evidence for.
 *
 * The picker is at the top, once, and there is no "Change project" button in
 * the header. It used to be the other way round - a button in the header that
 * threw the choice away and a second copy of the picker in the footer - which
 * made changing project a three-step move (scroll, clear, pick, scan) for what
 * is really one control, and put the control that decides every number on the
 * page below all of them.
 */
export default async function StaticAnalysisPage() {
  const view = readinessView();

  if (!view.scan) {
    return (
      <Page
        title="AI maturity"
        lede="How much of Claude Code a repository actually configures. Read from its files, on this machine, before any usage data is involved."
      >
        {view.problem ? (
          <div className="panel panel-pad" style={{ marginBottom: 18 }}>
            <strong>That project could not be scanned.</strong>
            <p className="note" style={{ marginTop: 6 }}>{view.problem}</p>
          </div>
        ) : null}
        <RepoPicker
          projects={view.projects}
          selected={view.selectedPath}
          cwd={process.cwd()}
        />
      </Page>
    );
  }

  const { scan, signals } = view;
  const staleness = signals.find((s) => s.kind === "readiness.staleness");

  return (
    <Page
      title="AI maturity"
      lede={`Configuration found in ${scan.name}. Read from disk on every load, so it is never stale.`}
      meta={`${scan.filesSeen} files read`}
    >
      {/* Above the grid, because it decides every figure in it. `key` is the
          selected path so the select is remounted when the choice changes:
          an uncontrolled select keeps the value the browser has, and after the
          action re-renders the page it would otherwise still name the project
          you just navigated away from. */}
      <RepoPicker
        key={scan.root}
        projects={view.projects}
        selected={view.selectedPath}
        cwd={scan.root}
        compact
      />

      <CapabilityGrid
        cells={capabilityCells(scan, signals)}
        score={maturityScore(scan)}
        lastEdited={staleness ? (staleness.evidence.newest as string | null) : null}
      />

      {/* The scanned path, on its own line. Inside the sentence it wrapped
          mid-path across two lines, which made a long absolute path unreadable
          at exactly the moment the reader is checking we looked in the right
          place. */}
      <p className="scan-source">
        Scanned <code>{scan.root}</code>
        <span>
          Nothing was written to it. Every band above is a count of what was
          found in these files, against the three thresholds printed beside it —
          one is bronze, two or three silver, four or more gold, and for hooks,
          whose unit is a matcher rather than a file, three, six and eight. No
          model has seen any of it.
        </span>
      </p>
    </Page>
  );
}
