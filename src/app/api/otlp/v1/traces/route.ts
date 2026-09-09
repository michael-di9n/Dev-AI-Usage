import { app } from "../../../../dashboard";
import { notifyLiveChange } from "../../../../live-bus";

/** OTLP/JSON traces receiver: the span tree the /trace page is drawn from. */
export async function POST(request: Request): Promise<Response> {
  try {
    const payload: unknown = await request.json();
    const { decoder, writer } = app().otlp;
    const written = writer.writeSpans(decoder.decodeSpans(payload));
    if (written > 0) notifyLiveChange();
    // OTLP expects an empty success body; anything else is treated as an error.
    return Response.json({ partialSuccess: {}, written }, { status: 200 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "bad traces payload" },
      { status: 400 },
    );
  }
}
