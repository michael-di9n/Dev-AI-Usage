import { app } from "../../dashboard";

/** Lets a cron job or a SessionEnd hook trigger ingest without a shell. */
export async function POST(): Promise<Response> {
  const results = await app().ingest.runAll();
  const failed = results.some((r) => r.status === "error");
  return Response.json({ results }, { status: failed ? 207 : 200 });
}
