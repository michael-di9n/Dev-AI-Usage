"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { SlidersIcon } from "./icons";

/**
 * A control that lives in the heading of the column it changes.
 *
 * Three columns have one: the date filter on Ended, and the band thresholds on
 * Cost and Tools. They are one device, so they are one component - the button,
 * the dialog, and the rule about when the button may be shown at all.
 *
 * That last part is why this exists rather than a shared class name. The button
 * opens the dialog with `showModal()`, which is script: it is the only way to
 * get the focus trap, the backdrop, Escape, and the page behind going inert,
 * and hand-rolling those badly is worse than not having them. So the button is
 * hidden until the effect below has run, and a reader without JavaScript sees a
 * column heading that sorts and no control that would do nothing.
 *
 * It was written twice before it was written once, and the second copy left the
 * reveal out - so the date filter's gear was `display: none` for good, on a
 * page where its neighbours' gears worked. Two components, one of them subtly
 * wrong, is the shape of bug this collapses.
 */
export function HeadingDialog({
  label,
  title,
  active = false,
  children,
}: {
  /** Names the control for a screen reader, and titles the dialog. */
  label: string;
  /** The tooltip, which may say what the control is currently doing. */
  title: string;
  /** Marks the button when the control is changing what the column shows. */
  active?: boolean;
  /** The dialog body. Given `close` so its own buttons can dismiss it. */
  children: (close: () => void) => ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => dialog.current?.close();

  useEffect(() => {
    dialog.current?.closest(".runs-col")?.classList.add("has-gear");
  }, []);

  return (
    <>
      <button
        type="button"
        className={active ? "icon-btn gear on" : "icon-btn gear"}
        onClick={() => dialog.current?.showModal()}
        title={title}
      >
        <SlidersIcon />
        <span className="vh">{label}</span>
      </button>

      <dialog ref={dialog} className="mini-dialog">
        <h2>{label}</h2>
        {children(close)}
      </dialog>
    </>
  );
}
