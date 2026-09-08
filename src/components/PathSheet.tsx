import type { ReactNode } from "react";

/**
 * Where things are, as the card slipped into the back of the machine.
 *
 * Paths are the one thing on this page that is neither a reading nor a control:
 * they are a parts list, and a parts list is a printed sheet, not an instrument.
 * Drawn as one so it cannot be mistaken for something the panel measured.
 *
 * The leader dots are decoration and are the only thing here that is. They sit
 * below the contrast floor on purpose - a rule as dark as the text it joins
 * competes with it - and the row reads identically with them switched off,
 * which is the test for whether a mark is carrying information.
 */
export function PathSheet({ note, rows }: {
  note: string;
  rows: { what: string; where: ReactNode }[];
}) {
  return (
    <div className="sheet">
      <div className="sheet-head">
        <h2 className="sheet-title">Where things are</h2>
        <span className="sheet-note">{note}</span>
      </div>
      <dl className="sheet-rows">
        {rows.map((row) => (
          <div className="sheet-row" key={row.what}>
            <dt className="sheet-what">{row.what}</dt>
            <span className="sheet-lead" aria-hidden="true" />
            <dd className="sheet-where">{row.where}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
