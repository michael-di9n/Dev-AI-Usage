"use client";

import {
  useCallback, useEffect, useRef, useState,
  type CSSProperties, type PointerEvent as ReactPointerEvent,
} from "react";
import { DEFAULT_PATH_STEPS, PATH_STEPS_STEP, type PathStep, type StepKind, type TracePath as TracePathData } from "../domain/tracePath";
import { showFewerPathSteps, showMorePathSteps } from "../app/trace-actions";
import { AgentIcon, McpIcon, MessageIcon, SkillIcon, ToolIcon } from "./icons";
import { Value } from "./primitives";

/**
 * The run as one line: what you asked, and what it reached for, in order.
 *
 * The tree above this is complete and, for that reason, unreadable at a
 * glance - the shape of a run is spread across more rows than anyone scrolls.
 * This is the same run in one strip, so the shape is something you can see
 * rather than something you reconstruct by scrolling.
 *
 * ## Why this one is a client component
 *
 * It was a server component with a CSS-only card parked in reserved space
 * under the strip, and that had real properties worth naming: no JavaScript,
 * and a card that could not overhang the page because it was not anchored to
 * anything that moves. The card follows the pointer now, and nothing in CSS
 * knows where the pointer is, so this is a script.
 *
 * What that costs is paid back deliberately rather than dropped:
 *
 * - **A pointer is not the only way in.** A keyboard has no cursor, so on
 *   focus the card is placed against the chip itself, measured from the chip's
 *   own box. Tabbing through the strip reads it step by step.
 * - **Touch has no hover at all**, so a tap pins the card - and the two facts
 *   worth having at a glance, what the step was and how many times it ran, are
 *   printed on the chip and never hidden inside the card.
 * - **The card cannot leave the viewport.** It is fixed-positioned and flipped
 *   to the other side of the cursor near the right or bottom edge, so
 *   `noHorizontalScroll` - in every baseline assertion here - still holds.
 *
 * The legend moved out of the card's old slot and sits under the strip as its
 * own row. It was in that slot because the space was reserved anyway; the
 * space is gone, and the legend is what makes five colours an encoding rather
 * than decoration, so it stays on the page.
 */
export function TracePath({ path, fresh = 0 }: { path: TracePathData; fresh?: number }) {
  /**
   * Which step's card is showing, and where to put it.
   *
   * `at` is viewport coordinates. `pinned` survives the pointer leaving, which
   * is what makes a tap work; hovering another chip moves to that one, so a
   * pinned card never stands between the reader and the rest of the strip.
   */
  const [open, setOpen] = useState<{ id: string; at: Point; pinned: boolean } | null>(null);
  /** Which step the window is showing, or null when it is shut. */
  const [windowed, setWindowed] = useState<{ step: PathStep; from: DOMRect } | null>(null);

  const step = open ? path.steps.find((s) => s.id === open.id) ?? null : null;

  /** The first index that arrived with the last expansion. */
  const freshFrom = fresh > 0 ? path.steps.length - fresh : -1;

  /** Follow the cursor while it is over a chip. */
  const track = (id: string) => (event: ReactPointerEvent<HTMLElement>) => {
    // A pen or a finger reports as a pointer event too, and neither hovers:
    // the position either would give is the point of contact, under the
    // reader's own hand. Both are left to the click, which anchors to the chip.
    if (event.pointerType !== "mouse") return;
    setOpen({ id, at: { x: event.clientX, y: event.clientY }, pinned: false });
  };

  /** Place the card against the chip, for anyone who did not use a pointer. */
  const anchor = (id: string, element: HTMLElement, pinned: boolean) => {
    const box = element.getBoundingClientRect();
    setOpen({ id, at: { x: box.left + box.width / 2, y: box.bottom }, pinned });
  };

  const shut = () => setOpen((was) => (was?.pinned ? was : null));
  /* Stable, because the window's effect depends on it: a new function every
     render would tear down the listener and call `showModal` again. */
  const shutWindow = useCallback(() => setWindowed(null), []);

  return (
    <div className="tp">
      <p className="tp-cap">
        The whole run, in order —{" "}
        {path.withheld > 0 ? (
          <>
            <b>{path.steps.length.toLocaleString()}</b> of{" "}
            <b>{path.total.toLocaleString()}</b> steps
          </>
        ) : (
          <>
            <b>{path.total.toLocaleString()}</b> step{path.total === 1 ? "" : "s"}
          </>
        )}
        . {/* Said out loud, because the tree above is capped and this is not:
              a reader who has just been told they are seeing 500 of 47,628
              rows will otherwise read this strip as a summary of those 500. */}
        Every prompt and tool call in the session, not only the rows drawn above.
      </p>

      {/* An ordered list, because the order is the content. */}
      <ol className="tp-strip">
        {path.steps.map((s, i) => (
          <li
            className={i >= freshFrom && freshFrom >= 0 ? `tp-step tp-${s.kind} tp-new` : `tp-step tp-${s.kind}`}
            /*
             * Its place among the newly arrived, which the stylesheet turns
             * into the delay it attaches on - capped, for the reason the
             * tree's print stagger is capped. Forty chips at 40ms apart is a
             * second and a half before the last one lands, and a reader who
             * asked for more of the strip is then waiting to read it. Past the
             * cap they share the last delay and arrive together.
             */
            style={i >= freshFrom && freshFrom >= 0
              ? ({ "--n": Math.min(i - freshFrom, ATTACH_STAGGER) } as CSSProperties)
              : undefined}
            key={s.id}
          >
            <button
              type="button"
              className={open?.id === s.id ? "tp-node on" : "tp-node"}
              /*
               * A disclosure, not an action: it reveals what is already on the
               * page and changes nothing. `aria-expanded` is what says so, and
               * it is why this is a button rather than a focusable span.
               */
              aria-expanded={open?.id === s.id}
              onPointerMove={track(s.id)}
              onPointerLeave={shut}
              onFocus={(e) => anchor(s.id, e.currentTarget, false)}
              onBlur={shut}
              onClick={(e) => {
                // A click is a request for the whole of it, not a bigger
                // tooltip. The card is a peek that follows the cursor; the
                // window is where the untruncated argument, every fact and the
                // step's place in the run actually fit.
                setWindowed({ step: s, from: e.currentTarget.getBoundingClientRect() });
                setOpen(null);
              }}
            >
              <span className="tp-glyph" aria-hidden="true">{GLYPH[s.kind]}</span>
              <span className="tp-name">
                {s.label}
                {s.count > 1 ? <b className="tp-times">×{s.count}</b> : null}
              </span>
              {/* The whole step as one sentence, for a reader who reaches the
                  control without seeing the card it opens. */}
              <span className="vh">{spoken(s, i + 1, path.total)}</span>
            </button>
          </li>
        ))}

        {/*
          What was not drawn, and the way to draw it. A strip that stopped at
          forty steps and said nothing would read as a run that took forty.
        */}
        {path.withheld > 0 ? (
          <li className="tp-step tp-rest">
            <form action={showMorePathSteps}>
              <input type="hidden" name="total" value={path.total} />
              <button type="submit" className="tp-node tp-more">
                <span className="tp-name">
                  +{Math.min(PATH_STEPS_STEP, path.withheld).toLocaleString()} more
                </span>
                <span className="vh">
                  Draw more of the path. {path.withheld.toLocaleString()} steps are not shown.
                </span>
              </button>
            </form>
          </li>
        ) : null}
      </ol>

      {/*
        The way back. The budget is stored, so without this a reader who
        expanded a 203-step strip once would carry seven rows of chips into
        every later visit with no way to undo it.
      */}
      {path.steps.length > DEFAULT_PATH_STEPS ? (
        <form action={showFewerPathSteps} className="tp-fewer">
          <button type="submit" className="btn">
            Back to the first {DEFAULT_PATH_STEPS.toLocaleString()} steps
          </button>
        </form>
      ) : null}

      {/*
        The legend, naming only the kinds this run used. An entry for
        "subagent" on a run that launched none is a row saying nothing
        happened, where what did happen should be.
      */}
      <ul className="tp-legend">
        {kindsIn(path.steps).map((kind) => (
          <li key={kind} className={`tp-${kind}`}>
            <span className="tp-glyph" aria-hidden="true">{GLYPH[kind]}</span>
            {MEANS[kind]}
          </li>
        ))}
      </ul>

      {step && open && !windowed ? <Card step={step} at={open.at} /> : null}

      {windowed ? (
        <StepWindow
          step={windowed.step}
          from={windowed.from}
          total={path.total}
          index={path.steps.findIndex((s) => s.id === windowed.step.id) + 1}
          onClose={shutWindow}
        />
      ) : null}
    </div>
  );
}

/**
 * One step, as a window that grows out of the chip that opened it.
 *
 * A native `<dialog>` opened with `showModal()`, which is the only way to get
 * the focus trap, Escape, the backdrop and the page behind going inert without
 * writing all four badly by hand - the same argument `HeadingDialog` makes.
 *
 * ## Growing from the source
 *
 * The dialog is centred by the browser, and the growth is a `transform-origin`
 * pointed at wherever the chip is. That is measured rather than guessed: the
 * chip's box comes in as `from`, the dialog's own box is read once it is open,
 * and the origin is the difference between them. Setting the origin in
 * percentages off the viewport would be close and wrong at the edges, where
 * the effect is most obviously either right or not.
 *
 * A centred window that appears to come out of the chip, rather than a window
 * placed AT the chip, because a window placed at a chip in the last row of the
 * strip opens off the bottom of the screen. Only the origin moves; the box
 * stays where the browser can keep all of it visible.
 */
function StepWindow({ step, from, index, total, onClose }: {
  step: PathStep;
  /** The chip's box, in viewport coordinates: where the window grows from. */
  from: DOMRect;
  index: number;
  total: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    element.showModal();

    /*
     * The `close` event, listened for directly rather than through a JSX
     * `onClose`.
     *
     * The JSX handler did not fire when the dialog was dismissed with Escape,
     * and the failure was quiet in the worst way: the dialog closed, so the
     * page looked right, but the state saying "a window is open" never
     * cleared - and that state is what suppresses the hover card. One press of
     * Escape and the card never came back for the rest of the visit.
     *
     * `close` does not bubble, which is the kind of event delegation is
     * awkward about. Attaching it to the element is one line and cannot be
     * wrong.
     */
    element.addEventListener("close", onClose);

    /*
     * The origin, from the box the dialog occupies in layout.
     *
     * NOT from `getBoundingClientRect()`, which was the first thing tried and
     * is wrong here: opening the dialog starts the grow animation in the same
     * frame, so the rect reports the box mid-transform - scaled to 0.16 and
     * about its own centre. The origin computed from that came out at
     * (109, 89) where it should have been (576, 382), and the window grew from
     * roughly its own top-left corner however it was opened, which looks
     * deliberate enough that it took a measurement to catch.
     *
     * `offsetWidth`/`offsetHeight` are layout values and ignore transforms,
     * and a modal `<dialog>` is centred by the UA with `margin: auto`, so the
     * untransformed box is arithmetic from those and the viewport.
     *
     * Clamped into the dialog, so a chip far off to one side does not put the
     * origin outside the element - which reads as a slide rather than a growth.
     */
    const w = element.offsetWidth;
    const h = element.offsetHeight;
    const left = (window.innerWidth - w) / 2;
    const top = (window.innerHeight - h) / 2;

    const cx = from.left + from.width / 2;
    const cy = from.top + from.height / 2;
    element.style.transformOrigin =
      `${clamp(cx - left, 0, w)}px ${clamp(cy - top, 0, h)}px`;

    return () => element.removeEventListener("close", onClose);
  }, [from, onClose]);

  return (
    <dialog
      ref={dialog}
      className="tp-window"
      /* The backdrop is part of the dialog, so a click on it lands here and
         nowhere else - which is the gesture everyone tries first. */
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}
    >
      <p className="tp-window-head">
        <span className={`tp-glyph tp-${step.kind}`} aria-hidden="true">{GLYPH[step.kind]}</span>
        <b>{step.label}</b>
        <em>{MEANS[step.kind]}</em>
      </p>

      <p className="tp-window-where">
        Step {index.toLocaleString()} of {total.toLocaleString()}
        {step.count > 1 ? <> · {step.count.toLocaleString()} calls, collapsed into one step</> : null}
        {step.at ? <> · started {step.at.replace("T", " ").slice(0, 19)}</> : null}
      </p>

      <p className="tp-window-ms">
        {step.durationMs === null ? (
          <>
            <Value n={null} />
            <i>
              {step.measured > 0
                ? `${step.measured} of ${step.count} calls were timed. A total covering some of
                   them is not this step's duration, so there is none.`
                : "Nothing timed this. Switch on a source that measures it and later runs carry real durations."}
            </i>
          </>
        ) : (
          <>
            <Value n={Math.round(step.durationMs)} suffix=" ms" />
            <i>
              measured by {step.durationFrom === "otel" ? "OpenTelemetry" : "the PostToolUse hook"}
              {step.count > 1 ? `, summed across all ${step.count} calls` : ""}
            </i>
          </>
        )}
      </p>

      {step.facts.length > 0 ? (
        <dl className="tp-window-facts">
          {step.facts.map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* Uncapped here, which is the point of the window: the card clamps this
          to three lines. Text and never markup - a transcript holds arbitrary
          source code and there is no renderer here it would be safe to give
          it. */}
      {step.detail ? (
        <>
          <p className="tp-window-label">
            {step.count > 1 ? "What the first of these calls was given" : "What it was given"}
          </p>
          <pre>{step.detail}</pre>
        </>
      ) : null}

      <form method="dialog" className="tp-window-shut">
        <button type="submit" className="btn">Close</button>
      </form>
    </dialog>
  );
}

const clamp = (n: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, n));

/**
 * How many attaching chips get their own delay before they share the last one.
 *
 * 16 at 40ms is a shade over half a second, which is long enough to read as
 * one thing joining after another and short enough that nobody waits it out.
 * Chosen the same way `PRINT_ROWS` was, and for the same reason.
 */
const ATTACH_STAGGER = 16;

interface Point { x: number; y: number; }

/** How far from the cursor the card sits, so it never lands under it. */
const GAP = 14;

/**
 * The card's box, kept in step with the stylesheet's own width and max height.
 *
 * Two numbers in two places, which is a cost. The alternative is measuring the
 * card after rendering it, which means rendering it in the wrong place first
 * and moving it - a visible jump on every chip, to avoid duplicating a
 * constant that only changes when someone redesigns the card.
 */
const CARD = { w: 320, h: 190 };

/**
 * The card, placed in viewport coordinates.
 *
 * Flipped rather than clamped when it would overhang: a card shoved against
 * the edge covers the chip the reader is pointing at, and a card that
 * overhangs gives the page a horizontal scrollbar the baseline fails it for.
 * The arithmetic is here rather than in the stylesheet because it depends on
 * where the pointer is, which is data.
 */
function Card({ step, at }: { step: PathStep; at: Point }) {
  const flipX = at.x + GAP + CARD.w > window.innerWidth;
  const flipY = at.y + GAP + CARD.h > window.innerHeight;

  const style = {
    left: flipX ? Math.max(8, at.x - GAP - CARD.w) : at.x + GAP,
    top: flipY ? Math.max(8, at.y - GAP - CARD.h) : at.y + GAP,
  } as CSSProperties;

  return (
    <span className="tp-card" style={style} role="tooltip">
      <span className="tp-card-head">
        <b>{step.label}</b>
        <em>{MEANS[step.kind]}</em>
        {step.count > 1 ? <span className="tp-card-n">{step.count} calls</span> : null}
      </span>

      <span className="tp-card-ms">
        {step.durationMs === null ? (
          <>
            <Value n={null} />
            {/*
              Why there is no number, in the one case where there could have
              been. A step whose calls were partly timed has a sum available
              and refuses it: printing the nine that were measured as the total
              of twelve is a smaller number wearing the whole step's name.
            */}
            <i>
              {step.measured > 0
                ? `${step.measured} of ${step.count} calls timed — a partial total is not this step's duration`
                : "not timed"}
            </i>
          </>
        ) : (
          <>
            <Value n={Math.round(step.durationMs)} suffix=" ms" />
            <i>measured by {step.durationFrom === "otel" ? "OpenTelemetry" : "the hook"}</i>
          </>
        )}
      </span>

      {step.facts.length > 0 ? (
        <span className="tp-card-facts">
          {step.facts.map(([key, value]) => (
            <span key={key}>
              <b>{key}</b>
              <i>{value}</i>
            </span>
          ))}
        </span>
      ) : null}

      {/* Text, never markup - a transcript holds arbitrary source code, and
          there is no renderer here it would be safe to hand it to. */}
      {step.detail ? <span className="tp-card-body">{step.detail}</span> : null}
    </span>
  );
}

/**
 * The kinds this run used, in the order the path first reached them.
 *
 * First-reached rather than a fixed order, so the legend reads down the strip
 * the way the strip reads across.
 */
function kindsIn(steps: PathStep[]): StepKind[] {
  const seen: StepKind[] = [];
  for (const step of steps) if (!seen.includes(step.kind)) seen.push(step.kind);
  return seen;
}

const GLYPH: Record<StepKind, React.ReactNode> = {
  user: <MessageIcon />,
  tool: <ToolIcon />,
  mcp: <McpIcon />,
  skill: <SkillIcon />,
  subagent: <AgentIcon />,
};

/** What the kind means, in the card and the legend: five glyphs are not one. */
const MEANS: Record<StepKind, string> = {
  user: "you asked",
  tool: "a built-in tool",
  mcp: "an MCP server",
  skill: "a skill",
  subagent: "a subagent",
};

/**
 * The whole step as one sentence.
 *
 * The chip carries the name and the count, which is what survives a
 * screenshot. This is the rest of it - where in the path it sits, what kind of
 * thing it is, how long it took - for a reader who reaches the control without
 * seeing the card beside it.
 */
function spoken(step: PathStep, position: number, total: number): string {
  const ms = step.durationMs === null
    ? step.measured > 0
      ? `${step.measured} of ${step.count} calls timed, so no total`
      : "duration not recorded"
    : `${Math.round(step.durationMs).toLocaleString()} ms`;

  return [
    `Step ${position} of ${total}.`,
    `${MEANS[step.kind]}: ${step.label}.`,
    step.count > 1 ? `${step.count} calls.` : null,
    `${ms}.`,
  ].filter(Boolean).join(" ");
}
