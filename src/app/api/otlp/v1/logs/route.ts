import { app } from "../../../../dashboard";
import { notifyLiveChange } from "../../../../live-bus";

/** OTLP/JSON logs receiver: this is where Claude Code's events arrive. */
export async function POST(request: Request): Promise<Response> {
  try {
    const payload: unknown = await request.json();
    const { decoder, writer } = app().otlp;
    const written = writer.writeEvents(decoder.decodeLogs(payload));
    if (written > 0) notifyLiveChange();
    return Response.json({ partialSuccess: {}, written }, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "bad logs payload" },
      { status: 400 },
    );
  }
}
