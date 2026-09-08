import type { CSSProperties } from "react";
import type { TraceNode } from "../domain/traceTree";
import { Value } from "./primitives";

/**
 * One session as a nested, openable tree.
 *
 * `<details>` rather than React state, which is why this is not a client
 * component: it costs no JavaScript, is keyboard-reachable and screen-reader
 * announced for free, works with scripting off, and - the reason that matters
 * here - a closed `<details>` keeps its body out of `innerText`, so the UI
 * probe can tell an opened row from a shut one without a DOM API of its own.
 *
 * Rows are indented with a `--depth` custom property rather than nested
 * padding rules, so depth is data and the stylesheet stays one block.
 */
/**
 * How many rows the print stagger counts before it stops waiting.
 *
 * A run with forty roots at 45ms apart is nearly two seconds of watching
 * before the last line lands, and a reader who wanted to read the run is
 * watching a screensaver. Past this the remaining rows share the last delay
 * and arrive together, so the effect is a terminal filling the screen rather
 * than a queue.
 */
const PRINT_ROWS = 22;

export function TraceTree({ nodes }: { nodes: TraceNode[] }) {
  return (
    <div className="trace">
      {nodes.map((node, i) => (
        /*
         * `--i` is the row's place in the print order, which the stylesheet
         * turns into the delay it arrives on. Only the roots carry one: every
         * row starts closed now, so the roots are the only lines on screen and
         * a delay on a row inside a shut `<details>` would be spent on nothing.
         */
        <Row key={node.id} node={node} depth={0} index={Math.min(i, PRINT_ROWS)} />
      ))}
    </div>
  );
}

function Row({ node, depth, index }: { node: TraceNode; depth: number; index?: number }) {
  const truncated = node.charLen !== null && node.body !== null
    && node.charLen > node.body.length;

  return (
    <details
      className={`tr tr-${node.kind}`}
      style={{ "--depth": depth, ...(index === undefined ? {} : { "--i": index }) } as CSSProperties}
      /*
       * Every row starts shut.
       *
       * It used to open the first two levels, on the argument that a closed
       * tree is a page with a handful of lines on it. That argument lost its
       * premise when the path strip arrived: the shape of the run - which
       * tools, which server, which subagent, in what order - is drawn under
       * the tree now, in one line, for every step rather than the first
       * five hundred. So the tree no longer has to be the thing that shows the
       * shape, and it can be what it is better at: the prompts, in order, each
       * opening onto exactly what a reader asked to see.
       */
      open={false}
    >
      <summary>
        <span className="tr-kind">{node.kind}</span>
        <span className="tr-label">{node.label}</span>
        <span className="tr-ms">
          {node.durationMs === null
            ? <Value n={null} />
            : (
              <>
                <Value n={Math.round(node.durationMs)} suffix=" ms" />
                {/* Named, because a span and a hook measure slightly different
                    windows and showing both unlabelled is a quiet lie. */}
                <span className="tr-src">{node.durationFrom}</span>
              </>
            )}
        </span>
      </summary>

      <div className="tr-body">
        {node.facts.length > 0 ? (
          <dl className="tr-facts">
            {node.facts.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {node.body !== null ? <Body node={node} truncated={truncated} /> : null}
      </div>

      {node.children.map((child) => <Row key={child.id} node={child} depth={depth + 1} />)}
    </details>
  );
}

function Body({ node, truncated }: { node: TraceNode; truncated: boolean }) {
  /*
   * Empty with a true length of zero is a measurement, not a gap - and for
   * thinking it is the only honest reading. Claude Code writes the signature
   * and blanks the text, in every version this tool has seen, so there is
   * nothing to render and saying so beats an empty box.
   */
  if (node.body === "" && node.charLen === 0) {
    return (
      <p className="note">
        {node.kind === "thinking"
          ? "Claude Code does not record the text of thinking blocks — it writes the "
            + "signature and blanks the body. The token count above is what was measured."
          : "Recorded as empty."}
      </p>
    );
  }

  return (
    <>
      {/* Text, never markup: a transcript holds arbitrary source code, and
          there is no renderer here that would be safe to hand it to. */}
      <pre>{node.body}</pre>
      {truncated ? (
        <p className="note">
          showing the first {node.body!.length.toLocaleString()} of{" "}
          {node.charLen!.toLocaleString()} characters
        </p>
      ) : null}
    </>
  );
}
