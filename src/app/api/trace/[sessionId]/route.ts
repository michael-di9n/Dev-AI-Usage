import { buildTrace } from "../../../../domain/traceTree";
import { traceExport, traceFilename } from "../../../../domain/traceExport";
import { app } from "../../../dashboard";

/**
 * One session's trace, as a JSON file.
 *
 * A route rather than a server action, because the point is a file: an anchor
 * with `download` gets the browser's own save dialog, works without
 * JavaScript, and needs no blob built in memory on the client. The button on
 * the trace page is a link to here.
 *
 * Local only, like everything else. This reads the database this machine built
 * and hands it back to the person who owns it; nothing is sent anywhere.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;

  const queries = app().queries;
  /* One indexed lookup. This used to group every block in the corpus into the
     whole run list and then pick one row out of it, which is the same 21ms the
     page had already spent moments earlier. A run exists here on the same
     terms the list uses - it has captured blocks - so no row the page offers
     can 404. */
  const session = queries.traceableSession(sessionId);

  /*
   * 404 with a sentence rather than an empty body. The commonest way to reach
   * this is a kept link to a session whose transcript Claude Code has since
   * expired, and a bare "not found" reads like a broken route.
   */
  if (!session) {
    return Response.json(
      {
        error: "No captured trace text for that session.",
        detail:
          "Either the id is wrong, or Claude Code expired the transcript before its text was read. Only sessions listed on the Trace page can be exported.",
        sessionId,
      },
      { status: 404 },
    );
  }

  /* Mapped field by field rather than spread: `ExportedSession` is a promise to
     whoever reads the file, and a spread would quietly widen it every time a
     column is added to the query. */
  const document = traceExport(
    {
      id: session.sessionId,
      projectPath: session.projectPath,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      blocks: session.blocks,
    },
    buildTrace(queries.traceRows(sessionId)),
  );

  return new Response(JSON.stringify(document, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${traceFilename(sessionId, session.endedAt)}"`,
      // Derived from a database that changes under it, so never cached.
      "cache-control": "no-store",
    },
  });
}
