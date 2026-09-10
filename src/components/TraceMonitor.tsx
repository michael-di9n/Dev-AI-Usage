"use client";

import { useCallback, useEffect, useOptimistic, useRef, useState } from "react";
import {
  TAP_KINDS,
  TAP_STREAM,
  banner,
  formatTapKinds,
  glitch,
  linesFor,
  tapCommand,
  tapState,
  toggleTapKind,
  type TapKind,
  type TapLine,
  type TraceTap,
} from "../domain/traceTap";
import { localDateTime } from "../domain/localClock";
import { setTapKinds } from "../app/tap-actions";
import { LiveTap } from "./LiveRefresh";

/**
 * The terminus of the pipe, opened: what is actually coming down the line.
 *
 * The vessel said one word - `on` or `off` - read off settings files, and that
 * is the right answer to the question the page asks. It is not the question a
 * reader has once they have set the seven variables: they want to know whether
 * anything is arriving, and the only evidence of that on the page was a count
 * buried in the panel for whichever setting was responsible for it. Nobody
 * opens seven panels to add up three numbers.
 *
 * So the terminus is a control now, and it opens the tap. A terminal, because
 * that is what the thing on the other end is - lines of records with their
 * attributes, in the shape a `tail` would give them - and because this app
 * already committed to that material for the Trace page's tree. It is the
 * same five `--term-*` tokens; nothing new was invented to make it look
 * technical.
 *
 * ## Why a script
 *
 * The rest of this diagram opens its panels with `:target` and no JavaScript,
 * for the reasons `RequirementScroll` gives, and that was tried first here.
 * Two things ruled it out. A modal wants the focus trap, Escape and the page
 * behind going inert, and `showModal()` is the only way to get all four
 * without writing them badly by hand - the argument `StepWindow` makes. And
 * the empty state is a sign whose characters change, which no stylesheet can
 * do: CSS can move text, never rewrite it.
 *
 * What that costs is bounded. The vessel renders and reads exactly as it did
 * with scripting off - the word, the fill and the tag under it are unchanged,
 * and every figure inside the window is also printed in the panels above. The
 * window is a faster route to what the page already says, not the only one.
 */
export function TraceMonitor({ on, tap }: { on: boolean; tap: TraceTap }) {
  const [open, setOpen] = useState(false);
  /* Stable, because the window's effect depends on it: a new function every
     render would tear down the `close` listener and call `showModal` again. */
  const shut = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        className={on ? "rp-end on" : "rp-end"}
        aria-haspopup="dialog"
        /*
         * The whole of it, because this control is a circle with one word in
         * it. The tag under the vessel and the hover note beside it say the
         * state; neither says that there is anything behind it to open, and a
         * reader who cannot see the pointer change has nothing else to go on.
         */
        aria-label={
          `In-depth tracing — ${on ? "on" : "off"}. ` +
          "Open the tap on the line: the last records this receiver heard, with their attributes."
        }
        onClick={() => setOpen(true)}
      >
        <span className="rp-water" />
        {/*
          Only when the line is dry.

          A dry vessel is a still one, so it needs the word: there is nothing
          in it to look at and nothing to tell it from a vessel that is merely
          waiting. A running one says it by turning, and the word sat in the
          middle of the whirlpool covering the eye - the one part of it that
          is the point. The state is not left to the motion alone, which is
          the rule this diagram is drawn by: the tag directly beneath says
          `durations arrive` in words, the panel it opens says `on`, and this
          button's own `aria-label` opens with it.
        */}
        {on ? null : <span className="rp-end-word">off</span>}
      </button>

      {open ? <Monitor on={on} tap={tap} onClose={shut} /> : null}
    </>
  );
}

/**
 * The window itself, centred by the browser.
 *
 * Deliberately not grown out of the vessel the way `StepWindow` is grown out
 * of its chip. That effect exists because the strip has hundreds of chips and
 * the window has to say which one it came from; there is one terminus, at the
 * end of a diagram the reader is looking at, so a window that arrives in the
 * middle of the screen has nothing to disambiguate and needs no measurement to
 * do it. The default `transform-origin` is the centre, which is where this
 * comes from.
 */
function Monitor({ on, tap, onClose }: { on: boolean; tap: TraceTap; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  /* Which row's detail window is open, or none. The row itself rather than an
     index, because the list under it is re-read on every OTLP arrival and an
     index would start pointing at a different record mid-read. */
  const [detail, setDetail] = useState<TapLine | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    element.showModal();

    /*
     * Escape does not shut this window. Nor does the backdrop - see the
     * missing `onClick` below.
     *
     * It is a terminal being read while records land in it, and both of the
     * usual dismissals are gestures a reader makes for other reasons: Escape
     * after a stray keystroke, a click on the page to bring the tab forward.
     * Losing forty lines of a live tail to either is worse than the cost of
     * being explicit, and `Close` is on screen the whole time. The detail
     * window this one opens keeps both dismissals, because it holds one
     * record that is still in the row behind it.
     *
     * Guarded on the target: `cancel` does not bubble, but the detail dialog
     * is a modal of its own and this must never be what refuses its Escape.
     */
    const hold = (event: Event) => { if (event.target === element) event.preventDefault(); };
    element.addEventListener("cancel", hold);

    /*
     * `close`, listened for on the element rather than through JSX's `onClose`.
     * The JSX handler does not fire for a dismissal by Escape - the bug
     * `StepWindow` documents at length - which leaves the dialog shut and the
     * state saying it is open, so the vessel can never be clicked again.
     */
    element.addEventListener("close", onClose);
    return () => {
      element.removeEventListener("close", onClose);
      element.removeEventListener("cancel", hold);
    };
  }, [onClose]);

  /*
   * The stored choice, and the flip the reader has just made but the server
   * has not confirmed yet.
   *
   * Seeded from `tap.kinds`, so the rule that the control renders showing the
   * stored value is unchanged: this *is* that value until a click, and
   * `setTapKinds` revalidates back to it afterwards, so the switches and the
   * page can still never name different things. What it adds is the other
   * half of the same rule - a selection has to act immediately. It used to be
   * three forms posting to a server action that re-rendered the whole page,
   * so a filter button cost what a navigation costs; the narrowing is local
   * now and the round trip only records it.
   */
  const [kinds, flip] = useOptimistic(tap.kinds, (_current, next: TapKind[]) => next);

  // Every stream's window came down; these are the switched-on ones.
  const lines = linesFor(tap.lines, kinds);
  const state = tapState(tap.heard, lines);

  return (
    <>
    {/* No `onClick` on the backdrop, deliberately: see the `cancel` handler
        above for why this window is the one that has to be shut on purpose. */}
    <dialog ref={dialog} className="mon">
      <p className="mon-bar">
        <b>trace-tap</b>
        <span className="mon-where">otlp receiver · this process</span>
        {/* Lit or unlit, with the word beside it: the lamp is never the only
            channel, which is the rule the annunciator strip is drawn by. */}
        <i className={on ? "mon-led on" : "mon-led"} aria-hidden="true" />
        <span className="mon-state">{on ? "LINE OPEN" : "LINE DRY"}</span>
        {/*
          A tap that only ever shows the page it was opened on is a
          screenshot, not a tap - the reader opens this to watch the next
          record land, not to reopen it after every one. Pushed, not polled:
          see `LiveTap`. Scoped to the window itself, so the connection opens
          and closes with the dialog.
        */}
        <LiveTap />
      </p>

      <Switches kinds={kinds} onFlip={flip} />

      {/* Flavour, and honest flavour: this is what the window is showing -
          the streams switched on, and no others. It is `aria-hidden` because a
          screen reader reading out a shell prompt that cannot be typed into is
          noise. */}
      <p className="mon-cmd" aria-hidden="true">
        <span className="mon-prompt">$</span> {tapCommand(kinds)}
        <span className="mon-caret" />
      </p>

      {/*
        The tally. Every figure here is a measurement and every zero is an
        answer: the receiver runs inside this process and the rows it wrote are
        in front of the query, so there is no "we could not ask" for it to
        stand for. The one field that could be blank is the clock, and it says
        `never` rather than showing a dash - never is a time.
      */}
      <dl className="mon-tally">
        <Cell label="events" n={tap.heard.events} />
        <Cell label="metric points" n={tap.heard.metrics} />
        <Cell label="spans" n={tap.heard.spans} />
        <Cell label="sessions" n={tap.heard.sessions} />
        <div>
          <dt>last heard</dt>
          <dd>{tap.heard.lastSeen === null ? "never" : localDateTime(tap.heard.lastSeen)}</dd>
        </div>
      </dl>

      {state === "lines" ? <Log lines={lines} onOpen={setDetail} /> : null}
      {state === "quiet" ? <Quiet kinds={kinds} /> : null}
      {state === "dark" ? <Dark /> : null}

      <form method="dialog" className="mon-shut">
        <button type="submit" className="btn">Close</button>
      </form>
    </dialog>

    {/* A sibling rather than a child, so nothing about shutting it can reach
        the window it was opened from - `showModal` puts it on the top layer
        either way, and the stack is what makes Escape and the backdrop act on
        this one alone. */}
    {detail ? <Detail line={detail} onDone={() => setDetail(null)} /> : null}
    </>
  );
}

/**
 * One record, whole - what the count at the end of a row opens.
 *
 * The row prints four attributes and says how many it could not fit, which is
 * honest but is not the same as being readable: a `tool_result` carrying its
 * output, or an `api_request` carrying eleven token counts, is a record whose
 * interesting half is always in the part that did not fit. The count was the
 * only thing on this window that named something a reader could not then go
 * and look at.
 *
 * Dismissed by clicking off it or by Escape, unlike the terminal underneath.
 * The asymmetry is the point: this holds one record which is still printed in
 * the row behind it, so closing it by accident costs nothing, and the reader
 * is returned to the tail they were reading rather than to the page.
 */
function Detail({ line, onDone }: { line: TapLine; onDone: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    element.showModal();

    /*
     * Opened at the top, looking at the first attribute.
     *
     * `showModal` gives focus to the first focusable thing inside, and in here
     * that is `Close` at the very bottom - so the browser scrolled it into
     * view and the window opened at its own end, past everything the reader
     * had just asked to see. Focusing the dialog itself is what stops that;
     * the `scrollTop` after it is belt and braces for the case where
     * something focusable ends up above the list later.
     */
    element.focus();
    element.scrollTop = 0;

    // Same reason the window underneath listens here rather than in JSX: a
    // dismissal by Escape never reaches React's `onClose`.
    element.addEventListener("close", onDone);
    return () => element.removeEventListener("close", onDone);
  }, [onDone]);

  return (
    <dialog
      ref={dialog}
      className="mon mon-detail"
      /* Focusable so the effect above can park focus here rather than on the
         Close button at the bottom. -1, because it is not a tab stop. */
      tabIndex={-1}
      aria-label={`${line.name} — every attribute on this record`}
      /* The backdrop belongs to the dialog, so a click on it lands here. This
         is the top modal in the stack, so the terminal underneath never sees
         the gesture - which is the whole requirement. */
      onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}
    >
      <p className="mon-bar">
        <b>record</b>
        <span className="mon-where" data-kind={line.kind}>
          <span className="term-kind">{line.kind}</span> · {line.name}
        </span>
        <span className="mon-state">{line.at}</span>
      </p>

      {/* Says what is in here as against the row, because "every" is a claim:
          the row's four, the ones it counted, and the ones it drops for being
          the same on every record. */}
      <p className="mon-label">
        {line.detail.length.toLocaleString()} attribute{line.detail.length === 1 ? "" : "s"}
        {line.more > 0 ? `, including the ${line.more} the row could not fit` : ""}
        {" — whole, not cut to the width of a line."}
      </p>

      <dl className="mon-pairs">
        {line.detail.map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            {/* An attribute that arrived empty is not an attribute that
                arrived: an em dash, like everywhere else here. */}
            <dd>{value === "" ? <span className="dash">—</span> : value}</dd>
          </div>
        ))}
      </dl>

      <form method="dialog" className="mon-shut">
        <button type="submit" className="btn">Close</button>
      </form>
    </dialog>
  );
}

/**
 * One switch per stream, and the rule that one stays on.
 *
 * Forms, not click handlers, for the reason the run list gives: the choice is
 * stored, so it goes through a server action like every other stored choice,
 * and the button computes the list it would leave behind rather than posting
 * the one switch it is - so `toggleTapKind`, which refuses to switch off the
 * last stream, is the same function that greys the button out. `aria-pressed`
 * because these are filters, not tabs: several can be on at once.
 *
 * Each switch wears its stream's ink, and the word beside it is the channel
 * that survives greyscale. The same two things a row carries, in the same
 * order, so the legend and the log agree without a key to look up.
 */
function Switches({ kinds, onFlip }: { kinds: TapKind[]; onFlip: (next: TapKind[]) => void }) {
  return (
    <div className="mon-kinds" role="group" aria-label="Streams to read">
      {TAP_KINDS.map((kind) => {
        const on = kinds.includes(kind);
        const next = toggleTapKind(kinds, kind);
        const last = on && kinds.length === 1;
        return (
          <form
            key={kind}
            /*
             * Still a form and still a server action, because the choice is
             * stored and every stored choice here goes through `app_state`.
             * What changed is the order: the switch and the log move first
             * and the round trip records it, rather than the round trip being
             * what moves them. The action prop is a transition, which is what
             * `useOptimistic` needs to hold the overlay until the server
             * agrees.
             */
            action={(formData: FormData) => {
              onFlip(next);
              return setTapKinds(formData);
            }}
          >
            <input type="hidden" name="kinds" value={formatTapKinds(next)} />
            <button
              type="submit"
              className="mon-kind"
              data-kind={kind}
              aria-pressed={on}
              disabled={last}
              title={
                last
                  ? `${TAP_STREAM[kind]} is the only stream on; one has to stay on`
                  : `${on ? "Hide" : "Show"} ${TAP_STREAM[kind]}`
              }
            >
              <i aria-hidden="true" />
              <span className="term-kind">{kind}</span>
              <span className="vh"> — {TAP_STREAM[kind]}</span>
            </button>
          </form>
        );
      })}
    </div>
  );
}

function Cell({ label, n }: { label: string; n: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{n.toLocaleString()}</dd>
    </div>
  );
}

/**
 * The records, newest first.
 *
 * Newest first rather than a real terminal's oldest-first, and it is the one
 * place this window departs from the thing it is imitating. A `tail` is read
 * by someone watching it fill; this is read by someone who has just changed a
 * setting and wants to know whether the last thing they did arrived, and that
 * record is at the top of the query. Said out loud on the heading, because a
 * log whose order a reader has to infer is a log they will misread.
 */
function Log({ lines, onOpen }: { lines: TapLine[]; onOpen: (line: TapLine) => void }) {
  return (
    <>
      <p className="mon-label">
        The last {lines.length.toLocaleString()} record{lines.length === 1 ? "" : "s"}, newest first.
      </p>
      <ol className="mon-out">
        {lines.map((line, i) => (
          /*
            `data-kind` is what the stylesheet colours by; the word inside
            `.term-kind` is what a reader who cannot see the colour reads. The
            colour says which table the row came out of and nothing else - a
            span is not better news than a metric point.
          */
          <li className="term-line" data-kind={line.kind} key={`${line.at}-${line.kind}-${line.name}-${i}`}>
            <span className="term-ts">{line.at}</span>
            <span className="term-kind">{line.kind}</span>
            {/* A record with no session id is a record that arrived without
                one, which is a gap and not a zero: an em dash, like everywhere
                else in this app. */}
            <span className="mon-sid">{line.session ?? <span className="dash">—</span>}</span>
            <span className="term-name">{line.name}</span>
            <span className="term-attrs">
              {line.attrs.map(([key, value]) => (
                <span key={key}>
                  {key}=<b>{value}</b>{" "}
                </span>
              ))}
              {/*
                Never dropped in silence, and now not merely counted either. A
                row that quietly showed four of a record's twelve attributes
                would be a record misreported; a row that says it has eight
                more and gives no way to read them is a record half-reported.
                The count is the control, because it is already the thing on
                the row that names what is missing.
              */}
              {line.more > 0 ? (
                <button
                  type="button"
                  className="mon-more"
                  onClick={() => onOpen(line)}
                  aria-label={`Show all ${line.detail.length} attributes on this ${line.name} record`}
                >
                  +{line.more} more
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

/**
 * Something arrived, but nothing on the streams switched on.
 *
 * The split that stops this window lying. A reader can put the window on
 * spans alone before the first span has arrived, and a receiver holding forty
 * thousand metric points is not a receiver that has heard nothing - showing
 * the dry sign there would tell a reader their setup is broken while the tally
 * above it counts what arrived. Names the streams that are off, because
 * flipping one of them back on is the way out.
 */
function Quiet({ kinds }: { kinds: TapKind[] }) {
  const off = TAP_KINDS.filter((k) => !kinds.includes(k)).map((k) => TAP_STREAM[k]);
  return (
    <p className="mon-empty term-empty">
      Records are arriving, and none of them on the stream{kinds.length === 1 ? "" : "s"} this
      window is reading ({kinds.map((k) => TAP_STREAM[k]).join(", ")}). The counts above are what
      did arrive
      {off.length > 0 ? <>; switch {off.join(" or ")} back on to read {off.length === 1 ? "it" : "them"}</> : null}.
    </p>
  );
}

/** The sign, and what it flickers at. 90ms is a fault, not a strobe. */
const FLICKER_MS = 90;

/**
 * How much of the ink is wrong at any moment.
 *
 * At 0.02 the sign looks like a rendering bug; at 0.2 it stops being readable
 * as words, which is the one thing it has to stay. 6% is a sign with a bad
 * connection behind it.
 */
const FLICKER_RATE = 0.06;

const SIGN = [...banner("NO OTEL"), "", ...banner("FLOWING")];

/**
 * Nothing has ever arrived: the one genuine absence this window can report.
 *
 * A sign rather than a sentence, because the sentence is already on the page
 * six times over - every panel above says what it has not received. What the
 * page could not say is the shape of it: the line is dry, and the reader is
 * looking at a receiver that has never heard anything at all.
 *
 * The flicker is the failure, drawn. It is also the only thing in this app
 * that animates by rewriting text, so two things are true of it on purpose:
 * the resting frame is the clean sign, so a reader who asked for stillness
 * gets a legible banner rather than nothing; and the words are repeated in a
 * visually hidden line, because a screen reader handed `N%  &TE|` would be
 * read a fault report as gibberish.
 */
function Dark() {
  const [rows, setRows] = useState(SIGN);

  useEffect(() => {
    /*
     * The motion question, asked in a script because it has to be: there is no
     * stylesheet rule to put inside a `prefers-reduced-motion` guard when what
     * moves is the characters. Same guarantee either way - with stillness
     * asked for, the sign is the sign and nothing rewrites it.
     */
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = setInterval(
      () => setRows(glitch(SIGN, FLICKER_RATE, Math.random)),
      FLICKER_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mon-dark">
      <pre className="mon-sign" aria-hidden="true">{rows.join("\n")}</pre>
      <p className="vh">
        No OpenTelemetry records have ever reached this receiver.
      </p>
      <p className="mon-empty term-empty">
        Nothing has ever reached this receiver — no events, no metric points, no
        spans. Claude Code reads its OpenTelemetry settings once, at launch, and
        never backfills, so a machine configured a minute ago will sit here
        until the next session starts. If the nodes above are all set and this
        is still dark, the exporter is pointed somewhere else:{" "}
        <code>OTEL_EXPORTER_OTLP_ENDPOINT</code> has to name the address this
        page was served from.
      </p>
    </div>
  );
}
