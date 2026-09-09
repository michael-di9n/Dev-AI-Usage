import { app } from "../../../../dashboard";
import { notifyLiveChange } from "../../../../live-bus";

/** OTLP/JSON metrics receiver. Exercise 01 points Claude Code here. */
export async function POST(request: Request): Promise<Response> {
  return receive(request, "metrics");
}

async function receive(request: Request, kind: "metrics"): Promise<Response> {
  try {
    const payload: unknown = await request.json();
    const { decoder, writer } = app().otlp;
    const written = writer.writeMetrics(decoder.decodeMetrics(payload));
    if (written > 0) notifyLiveChange();
    // OTLP expects an empty success body; anything else is treated as an error.
    return Response.json({ partialSuccess: {}, written }, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : `bad ${kind} payload` },
      { status: 400 },
    );
  }
}
