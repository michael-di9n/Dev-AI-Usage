import { app } from "../../../dashboard";

/** What exercise 01 tells the installer to curl. */
export async function GET(): Promise<Response> {
  const lastSeen = app().otlp.writer.lastSeenAt();
  return Response.json({
    receiver: "ready",
    lastSeen,
    hint: lastSeen
      ? null
      : "Nothing received yet. Set the env vars in exercises/01-enable-otel.md, then start a new Claude Code session.",
  });
}
