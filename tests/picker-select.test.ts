import { globSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PickerSelect } from "../src/components/PickerSelect";

/**
 * The control that scopes a page.
 *
 * These hold the shape rather than the look, because the look is not in the
 * component: `.picker-row select` in globals.css is where the border, the
 * padding and the focus ring live, and a select rendered outside that wrapper
 * is a bare browser control on a page where nothing else is. That is exactly
 * how the trace page's project selector came to look like a different app's,
 * so the wrapper is asserted here and the last test makes sure there is only
 * one place it can be forgotten.
 */
const render = (over: Partial<Parameters<typeof PickerSelect>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(PickerSelect, {
      action: async () => {},
      id: "pick",
      name: "path",
      label: "Project",
      value: "/b",
      submitLabel: "Scan",
      options: [
        { value: "/a", label: "/a — 2 runs" },
        { value: "/b", label: "/b — 1 run" },
      ],
      ...over,
    }),
  );

describe("PickerSelect", () => {
  it("puts the select inside the row the styling hangs off", () => {
    const html = render();

    expect(html).toContain('class="picker-form"');
    expect(html).toContain('class="picker-row"');
    // The row, then the control: a select outside it is unbordered and unpadded.
    expect(html.indexOf('class="picker-row"')).toBeLessThan(html.indexOf("<select"));
  });

  it("labels the control, so the box says what it scopes", () => {
    expect(render()).toContain('<label for="pick">Project</label>');
  });

  it("opens on the choice the page is rendering", () => {
    // React marks the open option rather than echoing a value attribute.
    expect(render()).toContain('<option value="/b" selected="">/b — 1 run</option>');
  });

  /**
   * The submit button exists only for a reader whose change event cannot fire.
   * Outside `<noscript>` it would be a second, redundant click for everyone
   * else - which is the confirm step this control was built without.
   */
  it("hides the fallback button from anyone who does not need it", () => {
    const html = render({ submitLabel: "Show" });

    expect(html).toContain("<noscript>");
    expect(html.slice(html.indexOf("<noscript>"))).toContain(">Show</button>");
  });

  /**
   * The regression this component was extracted for. Three copies of a control
   * is three chances to leave a part out, and the trace page left one out.
   */
  it("is the only select in the app", () => {
    // Comments stripped first: this component's own history is written up in
    // two of them, and a prose mention of the tag is not one being rendered.
    const code = (f: string) =>
      readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");

    const elsewhere = globSync("src/**/*.tsx")
      .filter((f) => !f.endsWith("PickerSelect.tsx"))
      .filter((f) => /<select[\s>]/.test(code(f)));

    expect(elsewhere, "render it with PickerSelect").toEqual([]);
  });
});
