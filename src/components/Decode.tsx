"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Text that arrives the way a terminal decodes it: blocks first, then letters.
 *
 * Each character starts as a random block glyph in the terminal's green and
 * settles, left to right, into the real character in whatever colour the text
 * around it wears. It is the same idea as the shutter over the cost bar - a
 * reading that is already correct underneath, arriving as though it were being
 * read off a wire - and it belongs to the chips because they are the figures a
 * reader looks at first.
 *
 * (The wording there matters, slightly. `tests/no-egress.test.ts` greps `src/`
 * for the word this paragraph is carefully not using, because that word in any
 * file but one is how text egress would arrive. A comment is not a request -
 * but a guard that has to reason about which occurrences are real is a guard
 * that ends up loosened, so the comment moves instead.)
 *
 * ## What it must not do
 *
 * **Say anything by moving.** The finished text is the resting state, and a
 * reader who asked for stillness gets it immediately and completely: the
 * effect is skipped outright under `prefers-reduced-motion: reduce`, checked
 * here rather than in the stylesheet because the scramble is characters and
 * not a property CSS can animate.
 *
 * **Lie to a screen reader.** The scramble is decoration over real text, so
 * the element carries the finished string as its accessible name and the
 * moving characters are hidden from the tree. A reader listening to this page
 * hears "$435.82" once, not a stream of blocks.
 *
 * **Be unreadable, even briefly.** The green is `--decode`, measured against
 * both surfaces a decoding figure can land on - the chips wear the shade
 * token, which is the tighter pair at 5.30:1 - and both are asserted in
 * `tests/styles.test.ts`. The terminal's own green is not reused for this: it
 * is chosen against a near-black terminal and sits at 1.6:1 on a white panel,
 * so the decode would be a flash of genuinely illegible text on the brightest
 * surface on the page.
 */
export function Decode({ text, delayMs = 0 }: { text: string; delayMs?: number }) {
  /**
   * Null means "show the real text".
   *
   * The first render is deliberately the finished string rather than a
   * scramble: this is server-rendered too, and a page whose figures arrive as
   * blocks and then need JavaScript to become readable is a page that shows
   * nonsense to anyone whose script has not run yet.
   */
  const [shown, setShown] = useState<string | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

    /*
     * Blocks first, before the stagger has even started.
     *
     * Without this the figure was legible, then scrambled, then legible again:
     * the delay below is most of half a second on the later chips, and it was
     * spent showing the finished number to a reader who was then shown it
     * being decoded. The answer arriving before the working is not an
     * animation, it is a flicker. Scripting still cannot make the figure
     * arrive later than it does now - the server rendered it, and the first
     * painted frame carries it - it can only stop it being taken away again.
     */
    setShown(scramble(text, 0, 0));

    let timer = 0;
    let raf = 0;
    const started = () => {
      const begun = performance.now();
      const tick = () => {
        const gone = performance.now() - begun;
        // How many characters have settled. The rest are still blocks.
        const settled = Math.floor((gone / DURATION_MS) * text.length);
        if (settled >= text.length) { setShown(null); return; }
        frame.current += 1;
        setShown(scramble(text, settled, frame.current));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    timer = window.setTimeout(started, delayMs);
    return () => { window.clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [text, delayMs]);

  if (shown === null) return <>{text}</>;

  return (
    <>
      {/* The real string, for anything that reads rather than looks. */}
      <span className="vh">{text}</span>
      <span className="decoding" aria-hidden="true">{shown}</span>
    </>
  );
}

/**
 * How long one figure takes to resolve.
 *
 * Short on purpose. The chips are staggered on top of this, so the row as a
 * whole takes longer than any one of them, and a reader who came to read a
 * number should not be able to notice they are waiting for it.
 */
const DURATION_MS = 420;

/** The blocks a character wears before it is itself. */
const BLOCKS = "█▓▒░#*+=-";

/**
 * The string mid-decode: settled characters, then blocks.
 *
 * Spaces and the currency symbol are left alone. A `$` cycling through blocks
 * reads as a different kind of value rather than as the same value arriving,
 * and a scrambled space makes a figure change width while it resolves, which
 * is what turns a decode into a jitter.
 */
function scramble(text: string, settled: number, frame: number): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (i < settled || c === " " || c === "$") { out += c; continue; }
    // Seeded off the frame and the position so neighbours differ and the whole
    // string does not flicker in unison.
    out += BLOCKS[(frame * 7 + i * 13) % BLOCKS.length];
  }
  return out;
}
