"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  TAP_LINES,
  banner,
  glitch,
  tapState,
  waterFill,
  type TapLine,
  type TraceTap,
} from "../domain/traceTap";
import { localDateTime } from "../domain/localClock";
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
        // Overrides the flat `--fill` `.rp-end`/`.rp-end.on` set in CSS: how
        // much has actually arrived, not just whether the tier is complete.
        style={{ "--fill": `${waterFill(tap.heard.events)}%` } as CSSProperties}
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
        <span className="rp-end-word">{on ? "on" : "off"}</span>
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

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;

    element.showModal();

    /*
     * `close`, listened for on the element rather than through JSX's `onClose`.
     * The JSX handler does not fire for a dismissal by Escape - the bug
     * `StepWindow` documents at length - which leaves the dialog shut and the
     * state saying it is open, so the vessel can never be clicked again.
     */
    element.addEventListener("close", onClose);
    return () => element.removeEventListener("close", onClose);
  }, [onClose]);

  const state = tapState(tap.heard, tap.lines);

  return (
    <dialog
      ref={dialog}
      className="mon"
      /* The backdrop belongs to the dialog, so a click on it lands here and
         nowhere else - the gesture everyone tries first. */
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}
    >
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

      {/* Flavour, and honest flavour: this is what the window is showing. It
          is `aria-hidden` because a screen reader reading out a shell prompt
          that cannot be typed into is noise. */}
      <p className="mon-cmd" aria-hidden="true">
        <span className="mon-prompt">$</span> tail -n {TAP_LINES} otel/events
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

      {state === "lines" ? <Log lines={tap.lines} /> : null}
      {state === "quiet" ? <Quiet /> : null}
      {state === "dark" ? <Dark /> : null}

      <form method="dialog" className="mon-shut">
        <button type="submit" className="btn">Close</button>
      </form>
    </dialog>
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
function Log({ lines }: { lines: TapLine[] }) {
  return (
    <>
      <p className="mon-label">
        The last {lines.length.toLocaleString()} record{lines.length === 1 ? "" : "s"}, newest first.
      </p>
      <ol className="mon-out">
        {lines.map((line, i) => (
          <li className="term-line" key={`${line.at}-${line.name}-${i}`}>
            <span className="term-ts">{line.at}</span>
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
              {/* Never dropped in silence. A row that quietly showed four of a
                  record's twelve attributes would be a record misreported. */}
              {line.more > 0 ? <i>+{line.more} more</i> : null}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

/**
 * Something arrived, but nothing with a line in it.
 *
 * The split that stops this window lying. Metric points and spans are not log
 * records, so a machine with `OTEL_METRICS_EXPORTER` set and
 * `OTEL_LOGS_EXPORTER` unset has working telemetry and an empty terminal - and
 * showing the dry sign there would tell a reader their setup is broken while
 * the tally above it counts what arrived.
 */
function Quiet() {
  return (
    <p className="mon-empty term-empty">
      Records are arriving, and none of them are events — so there is nothing
      with a line in it to print. This window reads the log stream, which is
      what <code>OTEL_LOGS_EXPORTER</code> fills. The counts above are what did
      arrive.
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
