import type { ReactNode } from "react";
import { ThemeCycler } from "./ThemeCycler";

/**
 * The frame every page shares: a thin top bar, a title block, then content.
 *
 * One component rather than a header plus a wrapper, because the two have to
 * agree about padding and ordering, and splitting them is how children end up
 * rendering outside the column.
 */
export function Page({
  title, lede, meta, action, children,
}: {
  title: string;
  lede: ReactNode;
  /** A small right-aligned fact in the top bar, e.g. the window in use. */
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className="topbar">
        <div className="topbar-title">{title}</div>
        {meta ? <div className="topbar-meta">{meta}</div> : null}
        {/* The theme control, and nothing else. The usage band used to sit
            here too, on every page; it is on Trends now, under the cost
            figure it is a reading of. A thirty-day volume rank beside the
            title of a settings page was answering a question that page does
            not ask. */}
        <div className={meta ? "topbar-tools" : "topbar-tools topbar-tools-alone"}>
          <ThemeCycler />
        </div>
      </header>

      <div className="content">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            <p>{lede}</p>
          </div>
          {action ? <div className="page-head-action">{action}</div> : null}
        </div>

        {children}
      </div>
    </>
  );
}
