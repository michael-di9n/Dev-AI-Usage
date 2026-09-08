import { buildTrace } from "../../../../domain/traceTree";
import {
  archiveFilename, traceArchiveHead, traceExport,
} from "../../../../domain/traceExport";
import { describeRange } from "../../../../domain/traceDates";
import { exportScope } from "../../../trace";
import { app } from "../../../dashboard";

/**
 * Every run currently in scope, as one JSON file.
 *
 * Scope means exactly what the page means by it: the selected project,
 * narrowed by the date filter. Both come from `exportScope`, which the page
 * also uses, so the two cannot drift - a button called "Export all" that
 * ignored the filter a reader had just set would hand them a file about runs
 * the page had told them were hidden, which is worse than not offering it.
 * What the scope was is written into the file's own head, because the same
 * button gives a different file depending on it.
 *
 * ## Streamed, one run at a time
 *
 * A project here reaches 500 runs and the largest single run is a 47,628-node
 * tree, so building the whole document in memory and serialising it is how
 * this route would take the dev server down on the one project a reader most
 * wants it for. Instead the JSON is assembled as it goes: the head, then each
 * run serialised and pushed on its own, so only one tree exists at a time.
 *
 * The cost of streaming is that the status code is committed before the first
 * run is read, so a failure part-way cannot become a 500. It becomes a
 * `truncated` record at the end of the file instead, which is a shape a reader
 * can check - a silently short array is not.
 *
 * Local only, like every other route here. It reads the database this machine
 * built and hands it back to the person who owns it.
 */
export async function GET(): Promise<Response> {
  const scope = exportScope();

  if (!scope.project || scope.sessions.length === 0) {
    return Response.json(
      {
        error: "No runs are in scope to export.",
        detail:
          "Export all writes the selected project's runs, narrowed by the date filter on the "
          + "Ended column. Either nothing is imported yet, or the filter currently hides every run.",
      },
      { status: 404 },
    );
  }

  const { project, sessions } = scope;
  const queries = app().queries;

  const head = traceArchiveHead({
    projectPath: project.path,
    projectName: project.name,
    from: scope.range.from,
    to: scope.range.to,
    described: describeRange(scope.range) ?? "all time",
    runs: sessions.length,
    runsInProject: scope.total,
  });

  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));

      // The head's own fields, then `runs` opened as an array we push into.
      // Hand-assembled rather than JSON.stringify of the whole, which is the
      // thing being avoided; the head itself is small and stringified whole.
      const headJson = JSON.stringify(head, null, 2);
      write(`${headJson.slice(0, headJson.lastIndexOf("}"))},\n  "runs": [\n`);

      let written = 0;
      let failed: { sessionId: string; reason: string } | null = null;

      for (const session of sessions) {
        try {
          const document = traceExport(
            {
              id: session.sessionId,
              projectPath: session.projectPath,
              startedAt: session.startedAt,
              endedAt: session.endedAt,
              blocks: session.blocks,
            },
            buildTrace(queries.traceRows(session.sessionId)),
          );
          write(`${written === 0 ? "" : ",\n"}${JSON.stringify(document)}`);
          written += 1;
        } catch (error) {
          /* One unreadable run must not cost the reader the other 499. It is
             recorded by id so they can go and look at that one. */
          failed = {
            sessionId: session.sessionId,
            reason: error instanceof Error ? error.message : String(error),
          };
          break;
        }
      }

      write(`\n  ],\n  "written": ${written}`);
      write(failed ? `,\n  "truncated": ${JSON.stringify(failed)}\n}\n` : `\n}\n`);
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${archiveFilename(project.name)}"`,
      // Derived from a database that changes under it, so never cached.
      "cache-control": "no-store",
    },
  });
}
