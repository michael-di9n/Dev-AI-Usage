import type { CSSProperties, ReactNode } from "react";
import { BANDS, KNOB_ANGLE, type Band, type Scale, bandOf, ruleOf } from "../domain/console";

/**
 * The Setup panel's instruments.
 *
 * Setup is not a settings form - nothing on it is editable except which way the
 * page is lit. It is the back of the machine: what is wired in, how full the
 * tanks are, and where the parts live. So it is drawn as a fascia, and the
 * figures are read off dials and counter windows rather than out of a table of
 * sentences, which is what it was and what made it long.
 *
 * The rule the instruments have to keep is the project's own: a dial states a
 * band, and the exact figure is printed in the window beneath it. A pointer
 * with no number under it is a grade.
 */

const DETENT_LABEL: Record<Band, string> = {
  none: "none",
  low: "low",
  medium: "med",
  high: "high",
};

/**
 * One dial and its window.
 *
 * `value` null means the figure was never measured - archiving switched off -
 * and then the knob carries no pointer at all. Resting it on NONE would be the
 * panel showing a reading it does not have, which is the one thing this project
 * exists not to do.
 */
export function Knob({ label, value, scale, render, sub, index = 0 }: {
  label: string;
  value: number | null;
  scale: Scale;
  /** How the figure is written in the window. Defaults to the scale's own. */
  render?: (n: number) => string;
  sub?: ReactNode;
  /** Position in the bank, so the power-up sweep can be staggered. */
  index?: number;
}) {
  const band = bandOf(value, scale);
  const format = render ?? scale.format;

  return (
    <div className="knob-unit">
      <div
        className={band === null ? "knob knob-dead" : "knob"}
        style={{ "--angle": `${band === null ? 0 : KNOB_ANGLE[band]}deg`, "--step": index } as CSSProperties}
        role="img"
        aria-label={value === null ? `${label}: not measured` : `${label}: ${band}, ${format(value)}`}
      >
        <div className="knob-dial" aria-hidden="true">
          {BANDS.map((b) => (
            <span key={b} className={b === band ? `detent detent-${b} on` : `detent detent-${b}`}>
              {DETENT_LABEL[b]}
            </span>
          ))}
        </div>
        <div className="knob-cap" aria-hidden="true">
          <span className="knob-index" />
        </div>
      </div>

      <div className="readout readout-wide">
        {value === null
          ? <span className="dash" title="Not measured: archiving is switched off">—</span>
          : format(value)}
      </div>

      <div className="engraved knob-label">{label}</div>
      {sub ? <div className="knob-sub">{sub}</div> : null}
    </div>
  );
}

/** The thresholds the dials in a bank were read off, printed beside them. */
export function DialRule({ scales }: { scales: { of: string; scale: Scale }[] }) {
  return (
    <div className="dial-rule">
      {scales.map(({ of, scale }) => (
        <div key={of} className="dial-rule-line">
          <span className="engraved">{of}</span> {ruleOf(scale)}
        </div>
      ))}
    </div>
  );
}

/**
 * A counter window: the figure, digit by digit, in cells.
 *
 * Row counts are large and mean nothing banded - "high" tells a reader less
 * than 3,405,221 does - so they get the panel's other instrument rather than a
 * dial. The cells are what make a seven-figure number countable at a glance.
 */
export function Counter({ label, n }: { label: string; n: number }) {
  const digits = n.toLocaleString().split("");
  return (
    <div className="counter">
      <div className="counter-window" role="img" aria-label={`${label}: ${n.toLocaleString()}`}>
        {digits.map((ch, i) => (
          <span key={`${i}-${ch}`} className={/\d/.test(ch) ? "digit" : "digit sep"}>{ch}</span>
        ))}
      </div>
      <div className="engraved counter-label">{label}</div>
    </div>
  );
}

/**
 * One annunciator lamp.
 *
 * Lit or unlit is the state, and the word beside it says the same thing, so the
 * colour is never the only channel. The reason a lamp is dark is written under
 * it rather than hung in a tooltip: off is the normal state for most of these,
 * and a tooltip does not exist on a phone.
 */
export function Lamp({ label, live, detail, fix }: {
  label: string;
  live: boolean;
  detail: string;
  /** The file that turns it on, when there is one. */
  fix?: { files: string[]; unlocks: string };
}) {
  return (
    <div className={live ? "lamp lamp-live" : "lamp"}>
      <span className="lamp-bulb" aria-hidden="true" />
      <div className="lamp-body">
        <div className="engraved lamp-label">
          {label} <span className="lamp-state">{live ? "live" : "off"}</span>
        </div>
        <div className="lamp-detail">{detail}</div>
        {!live && fix ? (
          <div className="lamp-fix">
            {fix.files.map((f) => <code key={f}>{f}</code>)} — {fix.unlocks}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** A named bay on the fascia: engraved legend, hairline, contents. */
export function Bay({ legend, note, children }: {
  legend: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bay">
      <div className="bay-head">
        <h2 className="engraved bay-legend">{legend}</h2>
        {note ? <p className="bay-note">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}
