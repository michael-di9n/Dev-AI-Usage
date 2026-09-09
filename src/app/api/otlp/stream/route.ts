import { onLiveChange } from "../../../live-bus";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * One line down the wire each time the trace-tap terminal's answer might
 * have changed.
 *
 * The terminal used to re-render on a timer - fast enough to feel live cost
 * a query every second whether or not anything had happened. This is the
 * other order: the connection sits idle at zero cost until `notifyLiveChange`
 * actually fires, and the browser tab hears about it essentially the moment
 * it does - whether that's a record OTLP just decoded, or an import pass
 * that just linked a session to its project.
 *
 * A comment line rather than a real event for the heartbeat, so it keeps the
 * connection open without waking a listener that has nothing new to draw -
 * `EventSource` only calls `onmessage` for a `data:` line.
 */
export async function GET(): Promise<Response> {
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const tick = () => controller.enqueue(encoder.encode("data: tick\n\n"));
      unsubscribe = onLiveChange(tick);
      heartbeat = setInterval(
        () => controller.enqueue(encoder.encode(": keep-alive\n\n")),
        HEARTBEAT_MS,
      );
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
