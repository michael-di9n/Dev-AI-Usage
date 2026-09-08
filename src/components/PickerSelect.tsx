"use client";

import { useEffect, useRef } from "react";

/**
 * A choice that scopes a page: a labelled select that acts on change.
 *
 * Extracted when the trace page's project selector turned out to be a bare
 * browser `<select>` - no border, no padding, no focus ring - beside two other
 * tabs whose selector wears the app's own clothes. The styling was never
 * missing: it lives on `.picker-row select`, and that page had built the same
 * control out of the same parts and left one of them out. Three copies of a
 * control is three chances to leave a part out, so there is one.
 *
 * What it holds, and what makes it worth being a component rather than a class
 * name:
 *
 * - It submits on change, with no second click. Every page that uses this reads
 *   rather than writes - a scan measures a millisecond, and reading a project's
 *   runs is a query - so a confirm step would only stand between the reader and
 *   the answer they have already asked for.
 * - There is a submit button for anyone whose change event cannot fire, and it
 *   is inside `<noscript>` so it never appears twice. The word on it is the
 *   caller's, because "Scan" and "Show" are not the same promise.
 * - The box says what the page says. That is the rule in AGENTS.md this control
 *   exists to keep, and keeping it takes the effect below - see the note on it.
 */
export function PickerSelect({
  action,
  id,
  name,
  label,
  value,
  options,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  id: string;
  /** The form field, which is what the action reads it back out of. */
  name: string;
  label: string;
  /** The choice the page is rendering. The box is held to it. */
  value: string;
  options: { value: string; label: string }[];
  /** The word on the button only a reader without JavaScript ever sees. */
  submitLabel: string;
}) {
  const box = useRef<HTMLSelectElement>(null);

  /*
   * Whenever the page names a choice, the box is made to name the same one.
   *
   * Measured, not assumed. Choosing a project on Trace left the heading, the
   * run list and this component's own props all on the new project while the
   * select still showed the old one - React had re-rendered with the new value
   * and not pushed it onto the element, because as far as its bookkeeping was
   * concerned the value it last wrote was already that. The box and the page
   * naming different projects is the one thing a scoping control may never do,
   * so this stops asking the framework nicely and sets it.
   *
   * Uncontrolled otherwise, deliberately. The reader's own pick is in the DOM
   * the instant they make it and nothing here fights it: this runs when `value`
   * changes, which is the server having answered, and by then the answer is
   * usually the pick. When it is not - Trace falls back to a project that has a
   * captured run and says so - the box follows the page to the fallback, which
   * is the whole point.
   */
  useEffect(() => {
    if (box.current && box.current.value !== value) box.current.value = value;
  }, [value]);

  return (
    <form action={action} className="picker-form">
      <label htmlFor={id}>{label}</label>
      <div className="picker-row">
        <select
          id={id}
          ref={box}
          name={name}
          defaultValue={value}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {/* Without JavaScript the change event cannot submit, so the button the
            rest of us do not need has to be here for that reader. */}
        <noscript>
          <button type="submit" className="btn">{submitLabel}</button>
        </noscript>
      </div>
    </form>
  );
}
