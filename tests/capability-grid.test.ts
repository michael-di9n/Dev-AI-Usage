import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CapabilityGrid } from "../src/components/CapabilityGrid";
import type { Capability, CapabilityCell } from "../src/domain/readiness";

/**
 * The capability grid's two cell shapes.
 *
 * A configured cell says everything it measured at rest. An absent one has no
 * measurement, only the paths the scan looked in, and those are folded behind
 * the card's own face - which is the property worth pinning, because folding
 * evidence and deleting it look identical from the outside on a closed card.
 * These hold that the paths are still rendered, that they are behind the
 * `<summary>` rather than in front of it, and that a present cell did not
 * quietly grow a control it has nothing to put behind.
 */

const LOOKED_FOR = [".claude/skills/", ".claude/commands/"];

const absentCell = (capability: Capability = "skills"): CapabilityCell => ({
  capability,
  label: "Skills",
  what: "Named instructions the model can invoke on its own.",
  present: false,
  fileCount: null,
  firstPath: null,
  moreFiles: 0,
  lookedFor: LOOKED_FOR,
  quality: null,
  band: {
    band: 0,
    name: "none",
    instances: 0,
    measured: "none found",
    rule: "1 of a thing is bronze",
    next: "one file",
  },
});

const presentCell = (): CapabilityCell => ({
  ...absentCell("memory"),
  label: "Memory",
  what: "What the model is told before anything is asked of it.",
  present: true,
  fileCount: 2,
  firstPath: "CLAUDE.md",
  moreFiles: 1,
  band: {
    band: 2,
    name: "silver",
    instances: 2,
    measured: "2 files",
    rule: "2 or 3 is silver",
    next: "two more files",
  },
});

const render = (cells: CapabilityCell[]) =>
  renderToStaticMarkup(createElement(CapabilityGrid, {
    cells,
    score: 0.25,
    lastEdited: "2026-02-01T00:00:00.000Z",
  }));

/** The markup of the one `<details>` in the output, face and body. */
const probe = (html: string) => {
  const start = html.indexOf("<details");
  return html.slice(start, html.indexOf("</details>", start));
};

/** Just the face - what a reader sees before clicking anything. */
const face = (html: string) => {
  const part = probe(html);
  return part.slice(part.indexOf("<summary"), part.indexOf("</summary>"));
};

describe("an absent capability folds its paths behind the card", () => {
  it("renders the cell as a card that opens", () => {
    const html = render([absentCell()]);
    expect(html).toContain('class="cap-probe"');
    expect(html).toContain('class="cap-face"');
  });

  it("draws the name row once, not once outside the face and once in it", () => {
    // It was twice. The cell used to render the name above the branch, for
    // both shapes, and the face needs it inside the summary to be part of
    // what a reader clicks - so the card carried two of everything.
    const html = render([absentCell()]);
    expect(html.match(/class="cap-name"/g)).toHaveLength(1);
    expect(html.match(/class="chevrons/g)).toHaveLength(1);
  });

  it("still renders every path the scan looked in", () => {
    const html = render([absentCell()]);
    // Folded, not dropped: an absence whose evidence is gone is a bare claim.
    for (const path of LOOKED_FOR) expect(html, path).toContain(path);
  });

  it("keeps the paths behind the face rather than on it", () => {
    const html = render([absentCell()]);
    const shut = face(html);
    expect(shut).not.toContain("Looked for");
    for (const path of LOOKED_FOR) expect(shut, path).not.toContain(path);

    const body = probe(html).slice(probe(html).indexOf("</summary>"));
    for (const path of LOOKED_FOR) expect(body, path).toContain(path);
  });

  it("says what opening the card would show, for a reader who cannot see the marker", () => {
    // The marker is a CSS glyph and the accessible name is otherwise the
    // label and the explanation, neither of which mentions a path.
    expect(face(render([absentCell()]))).toContain("show where we looked");
  });

  it("puts nothing but phrasing content in the summary", () => {
    // A <p> inside a <summary> is invalid, and React logs it to the console -
    // which every UI check on this page counts as a failure.
    // Matched with a boundary, because the icons are full of `<path>`.
    const shut = face(render([absentCell()]));
    expect(shut).not.toMatch(/<(p|div|ul|li)[\s>]/);
  });
});

describe("a configured capability does not fold", () => {
  it("renders no card that opens, because it has no paths to put behind one", () => {
    const html = render([presentCell()]);
    expect(html).not.toContain("<details");
    expect(html).not.toContain("cap-face");
  });

  it("keeps its own measurement and next band on the face", () => {
    const html = render([presentCell()]);
    expect(html).toContain("2 or 3 is silver");
    expect(html).toContain("two more files");
    expect(html).toContain("CLAUDE.md");
  });
});
