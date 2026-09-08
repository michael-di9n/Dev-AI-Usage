"use client";

import { useState, type ReactNode } from "react";

/**
 * The terminal surface, and the one thing about it that needs a script.
 *
 * The rows print themselves in: the stagger is a `--i` per root and an
 * `animation-delay` in the stylesheet, so the effect costs no JavaScript and
 * disappears entirely for a reader who asked for stillness. What cannot be
 * done in CSS is letting someone cut it short, and being able to is the
 * difference between an animation and an obstacle - a reader who came to read
 * a specific run should never have to wait out a flourish.
 *
 * So this is the whole of the client boundary: one class, set on the first
 * click anywhere in the panel, which the stylesheet reads as "stop waiting and
 * show everything". The tree inside stays a server component built out of
 * `<details>` - keyboard-reachable, screen-reader announced, and readable with
 * scripting off, which is also what lets the UI probe tell an opened row from
 * a shut one.
 *
 * Clicking a row's summary both opens that row and ends the printing. That is
 * one gesture doing two things, and it is the right two: the first thing
 * anybody does to a trace is open something, and if they are opening something
 * they have stopped watching it arrive.
 *
 * Remount to print again. The caller keys this on the session, so choosing a
 * different run replays it and re-rendering the same one does not.
 */
export function TerminalPanel({ children }: { children: ReactNode }) {
  const [printed, setPrinted] = useState(false);

  return (
    <div
      className={printed ? "term-panel printed" : "term-panel"}
      /*
       * Capture, so it lands even though the click's target is a `<summary>`
       * inside the tree that handles it natively. It is not a control itself -
       * there is nothing here to tab to and nothing a screen reader should
       * announce - because with motion reduced there is no animation to skip,
       * and with motion on the rows are all present and readable the moment
       * they arrive. Skipping is a convenience for a pointer, not a way to
       * reach anything otherwise unreachable.
       */
      onClickCapture={() => { if (!printed) setPrinted(true); }}
    >
      {children}
    </div>
  );
}
