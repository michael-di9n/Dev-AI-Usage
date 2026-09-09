"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-renders the server component on an interval, for pages that watch a feed.
 *
 * `router.refresh()` rather than `location.reload()`: it re-runs the server
 * render and patches the result in, so scroll position, focus and the theme
 * attribute all survive. A reload would flash the page every few seconds,
 * which on a page you leave open is worse than not being live at all.
 *
 * Pauses when the tab is hidden. A dashboard nobody is looking at should not
 * be querying SQLite every few seconds, and this tool exists to notice that
 * kind of waste rather than commit it.
 */
export function LiveRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  const [live, setLive] = useState(true);

  useEffect(() => {
    if (!live) return;

    const tick = () => {
      if (!document.hidden) router.refresh();
    };
    const timer = setInterval(tick, seconds * 1000);
    return () => clearInterval(timer);
  }, [live, seconds, router]);

  return (
    <button
      type="button"
      className="live"
      onClick={() => setLive((on) => !on)}
      // The dot alone reads as decoration, so the state is also in the label
      // and in the accessible name.
      aria-pressed={live}
    >
      <span className={live ? "live-dot on" : "live-dot"} aria-hidden="true" />
      {live ? `Live, every ${seconds}s` : "Paused"}
    </button>
  );
}

/**
 * Refreshes the moment the receiver hears something, instead of on a timer.
 *
 * The trace-tap terminal used to use `LiveRefresh` here, which meant picking
 * a number: too long and a new line sits unseen for most of the wait, too
 * short and the page re-queries on a clock whether or not anything happened.
 * `/api/otlp/stream` exists so it does not have to be either - the request
 * sits open at essentially no cost until `notifyLiveChange` fires, and
 * `router.refresh()` runs right then rather than at the next tick.
 *
 * `EventSource` reconnects on its own when the stream drops - most often a
 * dev server restart - so the only state this keeps is what to show while
 * that is happening.
 */
export function LiveTap() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource("/api/otlp/stream");
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = () => router.refresh();
    return () => source.close();
  }, [router]);

  return (
    <span className="tap-status" aria-live="polite">
      <span className={connected ? "live-dot on" : "live-dot"} aria-hidden="true" />
      {connected ? "Live" : "Reconnecting…"}
    </span>
  );
}

/**
 * The receiver's own address, read from the browser.
 *
 * Worth a client component for three lines: the port is whatever Next settled
 * on at startup, which is not always 3000 - if another dev server already has
 * it, this app moves and the exercise's copy-pasted endpoint then points at the
 * wrong process. Printing the real origin removes that whole class of confusion.
 */
export function OtlpEndpoint() {
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  return <code>{origin ? `${origin}/api/otlp` : "/api/otlp"}</code>;
}
