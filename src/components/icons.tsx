/**
 * The icon set, inline.
 *
 * One shared stroke spec so twelve glyphs read as one family, and
 * `currentColor` throughout so each one inherits whatever it sits in - a muted
 * tile corner, a medal chip, an active nav item - without a prop for colour.
 *
 * These are wayfinding, not data. The dataviz rule is that marks carry the
 * series colour and everything else wears text tokens; an icon that competed
 * with the number beside it would be ink that is not data, so they render at
 * the muted step and small.
 */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Glyph({ children, size = 16 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** Derived cost. A coin, not a currency symbol - the figure is an estimate and
 *  a big $ beside it oversells that. */
export function CoinIcon() {
  return (
    <Glyph>
      <circle cx="10" cy="10" r="7.2" {...STROKE} />
      <path d="M12.1 7.7c-.5-.7-1.3-1-2.1-1-1.2 0-2 .6-2 1.5s.8 1.2 2 1.5 2.1.6 2.1 1.6-.9 1.5-2.1 1.5c-.9 0-1.7-.3-2.2-1" {...STROKE} />
      <path d="M10 5.3v9.4" {...STROKE} />
    </Glyph>
  );
}

/** Output tokens: text the model produced. */
export function OutputIcon() {
  return (
    <Glyph>
      <path d="M7.4 4.2 4 10l3.4 5.8" {...STROKE} />
      <path d="M12.6 4.2 16 10l-3.4 5.8" {...STROKE} />
    </Glyph>
  );
}

/** Thinking tokens. A spark: reasoning that never reached the page. */
export function SparkIcon() {
  return (
    <Glyph>
      <path d="M10 2.6l1.5 4.3 4.3 1.5-4.3 1.5L10 14.2 8.5 9.9 4.2 8.4l4.3-1.5z" {...STROKE} />
      <path d="M15.4 13.6l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z" {...STROKE} />
    </Glyph>
  );
}

/** Cache: layers, one read off the top. */
export function LayersIcon() {
  return (
    <Glyph>
      <path d="M10 2.8 3 6.4l7 3.6 7-3.6z" {...STROKE} />
      <path d="M3 10.4l7 3.6 7-3.6" {...STROKE} />
      <path d="M3 14.1l7 3.6 7-3.6" {...STROKE} />
    </Glyph>
  );
}

/**
 * A lapsed cache: the same stack of layers as the cache glyph, with the top
 * layer broken into a dashed outline. The pair is deliberate - the two tiles
 * measure the same cache from its two ends, and the eye should notice they
 * are related before it reads either label.
 */
export function CacheMissIcon() {
  return (
    <Glyph>
      <path d="M10 1.8 3 5.4l7 3.6 7-3.6z" {...STROKE} strokeDasharray="2.6 2.2" />
      <path d="M3 9.9l7 3.6 7-3.6" {...STROKE} />
      <path d="M3 13.6l7 3.6 7-3.6" {...STROKE} />
    </Glyph>
  );
}

/** Days with data. */
export function CalendarIcon() {
  return (
    <Glyph>
      <rect x="3.2" y="4.4" width="13.6" height="12.4" rx="1.8" {...STROKE} />
      <path d="M3.2 8.2h13.6M7 2.9v2.6M13 2.9v2.6" {...STROKE} />
    </Glyph>
  );
}

/** Today. */
export function ClockIcon() {
  return (
    <Glyph>
      <circle cx="10" cy="10" r="7.2" {...STROKE} />
      <path d="M10 5.8V10l3 2" {...STROKE} />
    </Glyph>
  );
}

/** Sessions. */
export function SessionIcon() {
  return (
    <Glyph>
      <path d="M17 11.4a2 2 0 0 1-2 2H7.8L4 16.4v-11a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2z" {...STROKE} />
    </Glyph>
  );
}

/** A project. */
export function FolderIcon() {
  return (
    <Glyph>
      <path d="M3 6.2a1.7 1.7 0 0 1 1.7-1.7h3l1.7 2h5.9A1.7 1.7 0 0 1 17 8.2v6.1a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 14.3z" {...STROKE} />
    </Glyph>
  );
}

/** A tool call. */
export function ToolIcon() {
  return (
    <Glyph>
      <path d="M11.6 5.2a3.4 3.4 0 0 0 4.5 4.5l-6.7 6.7a2 2 0 0 1-2.9-2.9z" {...STROKE} />
      <path d="M13.9 2.9 16.9 5.9" {...STROKE} />
    </Glyph>
  );
}

/** Messages exchanged. */
export function MessageIcon() {
  return (
    <Glyph>
      <path d="M4 5.4a1.7 1.7 0 0 1 1.7-1.7h8.6A1.7 1.7 0 0 1 16 5.4v5.3a1.7 1.7 0 0 1-1.7 1.7H8.5L5 15.6v-3.2A1.7 1.7 0 0 1 4 10.7z" {...STROKE} />
    </Glyph>
  );
}

/**
 * The rank medal, for the usage band.
 *
 * The band's three colours sit at nearly the same luminance, so under
 * greyscale or full colour-vision deficiency they are indistinguishable from
 * one another. The dataviz rule for a state colour is that it never travels
 * alone: this glyph plus the word ("Power user") is the identity, and the metal
 * is decoration on top of it. The ribbon count also differs per rank, so the
 * shape itself carries the order.
 */
export function MedalIcon({ rank }: { rank: 1 | 2 | 3 }) {
  return (
    <Glyph size={14}>
      <circle cx="10" cy="12.4" r="4.6" {...STROKE} />
      {rank === 1 ? <path d="M10 10.3v4.2M8.6 11.4 10 10.3l1.4 1.1" {...STROKE} /> : null}
      {rank === 2 ? <path d="M8.4 11.3h3.2M8.4 13.5h3.2" {...STROKE} /> : null}
      {rank === 3 ? <path d="M8.4 12.4h3.2" {...STROKE} /> : null}
      <path d="M7.2 8.1 5.4 3.1M12.8 8.1l1.8-5" {...STROKE} />
    </Glyph>
  );
}

/** A skill: a plug-in capability, snapped into place. */
export function SkillIcon() {
  return (
    <Glyph size={14}>
      <path d="M6.3 4.2h7.4a1.8 1.8 0 0 1 1.8 1.8v7.4a1.8 1.8 0 0 1-1.8 1.8H6.3a1.8 1.8 0 0 1-1.8-1.8V6a1.8 1.8 0 0 1 1.8-1.8z" {...STROKE} />
      <path d="M8 2.4v1.8M12 2.4v1.8M8 15.8v1.8M12 15.8v1.8M2.4 8h1.8M2.4 12h1.8M15.8 8h1.8M15.8 12h1.8" {...STROKE} />
    </Glyph>
  );
}

/** A subagent: work handed to something that runs on its own. */
export function AgentIcon() {
  return (
    <Glyph size={14}>
      <circle cx="10" cy="5" r="2.3" {...STROKE} />
      <circle cx="5" cy="15" r="2.3" {...STROKE} />
      <circle cx="15" cy="15" r="2.3" {...STROKE} />
      <path d="M10 7.3v2.4M10 9.7H5.6a.7.7 0 0 0-.6.7v2.3M10 9.7h4.4a.7.7 0 0 1 .6.7v2.3" {...STROKE} />
    </Glyph>
  );
}

/** How wide the toolkit reached. */
export function ToolkitIcon() {
  return (
    <Glyph size={14}>
      <rect x="2.8" y="7.4" width="14.4" height="8.4" rx="1.7" {...STROKE} />
      <path d="M7.2 7.4V5.6a1.6 1.6 0 0 1 1.6-1.6h2.4a1.6 1.6 0 0 1 1.6 1.6v1.8" {...STROKE} />
      <path d="M2.8 11h14.4M10 9.8v2.4" {...STROKE} />
    </Glyph>
  );
}

/** Which models, and how many of them. */
export function ModelIcon() {
  return (
    <Glyph size={14}>
      <path d="M10 2.8 16.6 6 10 9.2 3.4 6z" {...STROKE} />
      <path d="M3.4 10 10 13.2 16.6 10" {...STROKE} />
      <path d="M3.4 14 10 17.2 16.6 14" {...STROKE} />
    </Glyph>
  );
}

/**
 * One glyph per model family, for the mix strip.
 *
 * These are the one exception to the "icons are wayfinding, not data" rule at
 * the top of this file: in the mix strip the glyph *is* the series marker -
 * it replaces the colour swatch rather than sitting beside one - so it takes
 * the slice's colour from whatever class wraps it. Everywhere else an icon
 * still wears a text token.
 *
 * The forms are the names, taken literally, which is what makes them legible
 * at 13px without a legend explaining the legend: a haiku is three lines, a
 * sonnet is a page of them, and an opus is a piece of music. Anything
 * unrecognised gets a hollow ring, so a model this build has never heard of
 * is visibly the odd one out instead of quietly borrowing another's mark.
 */
export function ModelFamilyIcon({ model }: { model: string }) {
  const family = modelFamily(model);

  if (family === "haiku") {
    // Three strokes, 5-7-5: short, long, short.
    return (
      <Glyph size={13}>
        <path d="M5.5 6.5h9M4 10h12M6.5 13.5h7" {...STROKE} />
      </Glyph>
    );
  }

  if (family === "sonnet") {
    // A page with its lines on it - many more than three.
    return (
      <Glyph size={13}>
        <rect x="4.2" y="2.8" width="11.6" height="14.4" rx="1.6" {...STROKE} />
        <path d="M6.8 6.6h6.4M6.8 9.4h6.4M6.8 12.2h6.4M6.8 15h3.6" {...STROKE} />
      </Glyph>
    );
  }

  if (family === "opus") {
    // A note: the work itself rather than a page about it.
    return (
      <Glyph size={13}>
        <circle cx="7" cy="14.4" r="2.8" {...STROKE} />
        <path d="M9.8 14.4V3.6l6 1.9" {...STROKE} />
      </Glyph>
    );
  }

  return (
    <Glyph size={13}>
      <circle cx="10" cy="10" r="5.4" {...STROKE} />
    </Glyph>
  );
}

/** The family a model id belongs to, or null when this build cannot tell. */
export function modelFamily(model: string): "opus" | "sonnet" | "haiku" | null {
  const id = model.toLowerCase();
  if (id.includes("opus")) return "opus";
  if (id.includes("sonnet")) return "sonnet";
  if (id.includes("haiku")) return "haiku";
  return null;
}

// ---------------------------------------------------------------------------
// The eight capabilities
// ---------------------------------------------------------------------------
/*
 * One glyph per cell of the AI maturity grid, all eight, so a cell is
 * identifiable before it is read. Same stroke spec as everything above, and
 * the same rule: wayfinding, at the muted step, never louder than the tier
 * chip beside them.
 *
 * Two of the eight already existed for the dashboard - a skill and a subagent
 * are the same things there - so they are reused rather than redrawn. Eight
 * glyphs that nearly match are worse than six.
 */

/** Memory: the standing instructions, read on every run. An open book. */
export function MemoryIcon() {
  return (
    <Glyph size={14}>
      <path d="M10 5.6v10.2" {...STROKE} />
      <path d="M10 5.6C8.6 4.5 6.7 4 4.2 4.2v9.6c2.5-.2 4.4.3 5.8 1.4" {...STROKE} />
      <path d="M10 5.6c1.4-1.1 3.3-1.6 5.8-1.4v9.6c-2.5-.2-4.4.3-5.8 1.4" {...STROKE} />
    </Glyph>
  );
}

/** Rules: lines laid down. A ruled page with a straight edge. */
export function RulesIcon() {
  return (
    <Glyph size={14}>
      <rect x="3.4" y="3.4" width="13.2" height="13.2" rx="1.8" {...STROKE} />
      <path d="M6.4 7.6h7.2M6.4 10h7.2M6.4 12.4h4.4" {...STROKE} />
    </Glyph>
  );
}

/** MCP servers: tools reached over a connection, outside the sandbox. */
export function McpIcon() {
  return (
    <Glyph size={14}>
      <rect x="3" y="3.2" width="14" height="5.2" rx="1.5" {...STROKE} />
      <rect x="3" y="11.6" width="14" height="5.2" rx="1.5" {...STROKE} />
      <path d="M6.2 5.8h.01M6.2 14.2h.01" {...STROKE} />
      <path d="M10 8.4v3.2" {...STROKE} />
    </Glyph>
  );
}

/** Hooks: a command the harness runs when something happens. */
export function HookIcon() {
  return (
    <Glyph size={14}>
      <path d="M13.4 3.6v6.2a3.4 3.4 0 0 1-6.8 0V8.6" {...STROKE} />
      <path d="M4.4 6.2l2.2-2.4 2.2 2.4" {...STROKE} />
      <circle cx="13.4" cy="14.8" r="1.6" {...STROKE} />
    </Glyph>
  );
}

/**
 * CI/CD: a branch merging back into the trunk, which is where a pipeline that
 * runs Claude does its work. Nodes rather than boxes, so it does not read as a
 * second Workflows glyph.
 */
export function CiIcon() {
  return (
    <Glyph size={14}>
      <circle cx="5.8" cy="4.6" r="1.8" {...STROKE} />
      <circle cx="5.8" cy="15.4" r="1.8" {...STROKE} />
      <circle cx="14.2" cy="4.6" r="1.8" {...STROKE} />
      <path d="M5.8 6.4v7.2" {...STROKE} />
      <path d="M14.2 6.4v2.4a3 3 0 0 1-3 3H5.8" {...STROKE} />
    </Glyph>
  );
}

/** Workflows: several agents, scripted into an order. */
export function WorkflowIcon() {
  return (
    <Glyph size={14}>
      <rect x="2.6" y="8.2" width="4.4" height="3.6" rx="1" {...STROKE} />
      <rect x="13" y="3.6" width="4.4" height="3.6" rx="1" {...STROKE} />
      <rect x="13" y="12.8" width="4.4" height="3.6" rx="1" {...STROKE} />
      <path d="M7 10h2.6a1 1 0 0 0 1-1V6.4a1 1 0 0 1 1-1H13" {...STROKE} />
      <path d="M7 10h2.6a1 1 0 0 1 1 1v2.6a1 1 0 0 0 1 1H13" {...STROKE} />
    </Glyph>
  );
}

/**
 * A wrench, for the run list's tool-call band.
 *
 * Deliberately not `ToolIcon`, which is a spanner used as wayfinding beside a
 * heading. This one is drawn as a countable mark: it appears one to three
 * times in a cell and the count is the reading, so it has to stay legible at
 * 13px and stay distinct from its neighbour at a glance.
 */
export function WrenchIcon({ size = 13 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path
        d="M13.4 3.1a3.9 3.9 0 0 0-4.6 4.9l-5 5a1.5 1.5 0 0 0 2.1 2.1l5-5a3.9 3.9 0 0 0 4.9-4.6l-2.3 2.3-2.3-.6-.6-2.3z"
        {...STROKE}
      />
    </Glyph>
  );
}

/**
 * A stacked coin, for the run list's cost band.
 *
 * The face of one coin from `CoinStack`, drawn small. It is the same object as
 * the Trends hero's unit chart on purpose - both mean "this much money, as
 * something you can count" - and it must not be `CoinIcon`, which means "a
 * cost figure lives here" and appears exactly once beside a label.
 */
export function CoinMark({ size = 13 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <ellipse cx="10" cy="12.4" rx="7" ry="2.6" {...STROKE} />
      <path d="M3 12.4v-3.4M17 12.4v-3.4" {...STROKE} />
      <ellipse cx="10" cy="9" rx="7" ry="2.6" {...STROKE} />
    </Glyph>
  );
}

/**
 * The threshold affordance on a bandable column heading.
 *
 * Sliders rather than a gear. A gear means "settings", which is vague, and at
 * 13px its teeth close up into a sun - which is what the first version of this
 * looked like in the header row. Two tracks with a handle on each is the shape
 * of what the control actually does: move two numbers.
 */
export function SlidersIcon({ size = 13 }: { size?: number }) {
  return (
    <Glyph size={size}>
      <path d="M3 7h14M3 13h14" {...STROKE} />
      <circle cx="7.5" cy="7" r="2.1" {...STROKE} fill="var(--panel)" />
      <circle cx="12.5" cy="13" r="2.1" {...STROKE} fill="var(--panel)" />
    </Glyph>
  );
}

/** The run list's collapse control: a chevron that points at what it will do. */
export function CaretIcon({ open, size = 14 }: { open: boolean; size?: number }) {
  return (
    <Glyph size={size}>
      <path d={open ? "M5.5 12 10 7.5l4.5 4.5" : "M5.5 8 10 12.5 14.5 8"} {...STROKE} />
    </Glyph>
  );
}

/**
 * The four token classes, as one family.
 *
 * They are read side by side in a single row of chips, so they are drawn as
 * variations on two shapes rather than four unrelated pictures: an arrow
 * against a boundary for the two that cross into the model, and the cache
 * stack - already this app's glyph for a cache, see `LayersIcon` - with an
 * arrow off it or onto it for the two that do not.
 *
 * Each one is tinted by its own segment colour where it is used, so the chip
 * and the bar above it can be matched without reading either label. The shape
 * is what carries the meaning; the colour only ties the two together.
 */

/** Input: sent in, over the boundary. */
export function InputIcon() {
  return (
    <Glyph>
      <path d="M3 10h8.5" {...STROKE} />
      <path d="M8.4 6.6 11.8 10l-3.4 3.4" {...STROKE} />
      <path d="M15 3.6v12.8" {...STROKE} />
    </Glyph>
  );
}

/** Cache read: taken off the top of the stack. */
export function CacheReadIcon() {
  return (
    <Glyph>
      <path d="M9 6.6 3.4 9.5 9 12.4l5.6-2.9z" {...STROKE} />
      <path d="M3.4 13.2 9 16.1l5.6-2.9" {...STROKE} />
      <path d="M14.6 6.4V2.2M12.7 4.1l1.9-1.9 1.9 1.9" {...STROKE} />
    </Glyph>
  );
}

/** Cache write: laid onto the top of the stack. */
export function CacheWriteIcon() {
  return (
    <Glyph>
      <path d="M9 7.4 3.4 10.3 9 13.2l5.6-2.9z" {...STROKE} />
      <path d="M3.4 14 9 16.9l5.6-2.9" {...STROKE} />
      <path d="M14.6 2.2v4.2M12.7 4.5l1.9 1.9 1.9-1.9" {...STROKE} />
    </Glyph>
  );
}

/* ---------------------------------------------------------------------------
   The instrumentation requirements.

   One glyph per setting, drawn from what the setting physically does rather
   than from a generic notion of "config": a switch throws, a gauge counts, a
   log stacks lines, braces are a wire format, a plug is an address, a span is
   a bar on a timeline, and a beaker is a beta. A reader who has opened one
   panel should be able to find the next by its shape.
   --------------------------------------------------------------------------- */

/** The master switch: a toggle, thrown. */
export function SwitchIcon() {
  return (
    <Glyph size={14}>
      <rect x="2.2" y="6.4" width="15.6" height="7.2" rx="3.6" {...STROKE} />
      <circle cx="13.6" cy="10" r="2" {...STROKE} />
    </Glyph>
  );
}

/** Metrics: a gauge with its needle, the shape a counter is read on. */
export function MetricsIcon() {
  return (
    <Glyph size={14}>
      <path d="M3.2 14.6a8 8 0 1 1 13.6 0" {...STROKE} />
      <path d="M10 14.6l3.2-4.4" {...STROKE} />
    </Glyph>
  );
}

/** Events: stacked lines, the way a log actually looks when it scrolls. */
export function LogsIcon() {
  return (
    <Glyph size={14}>
      <path d="M4 5.6h12M4 10h12M4 14.4h7.5" {...STROKE} />
    </Glyph>
  );
}

/** Wire format: braces, because the answer here is always JSON. */
export function FormatIcon() {
  return (
    <Glyph size={14}>
      <path d="M8 3.6c-2 0-2.4 1-2.4 2.6S5.2 9 3.8 10c1.4 1 1.8 2.2 1.8 3.8s.4 2.6 2.4 2.6" {...STROKE} />
      <path d="M12 3.6c2 0 2.4 1 2.4 2.6s.4 2.8 1.8 3.8c-1.4 1-1.8 2.2-1.8 3.8s-.4 2.6-2.4 2.6" {...STROKE} />
    </Glyph>
  );
}

/** Endpoint: a plug going into a socket. An address is a thing you reach. */
export function EndpointIcon() {
  return (
    <Glyph size={14}>
      <path d="M3 10h5.6" {...STROKE} />
      <rect x="8.6" y="6.4" width="8.4" height="7.2" rx="1.8" {...STROKE} />
      <path d="M11.4 4.2v2.2M14.6 4.2v2.2" {...STROKE} />
    </Glyph>
  );
}

/** Traces: bars on a timeline, offset - one span starting inside another. */
export function TracesIcon() {
  return (
    <Glyph size={14}>
      <rect x="2.6" y="4.4" width="12" height="3.2" rx="1.4" {...STROKE} />
      <rect x="6.2" y="12.4" width="11.2" height="3.2" rx="1.4" {...STROKE} />
      <path d="M6.2 7.6v4.8" {...STROKE} />
    </Glyph>
  );
}

/** The beta flag that makes spans exist at all: a beaker. */
export function SpansIcon() {
  return (
    <Glyph size={14}>
      <path d="M8.2 3v4.6L4 14.2a1.6 1.6 0 0 0 1.4 2.4h9.2a1.6 1.6 0 0 0 1.4-2.4l-4.2-6.6V3" {...STROKE} />
      <path d="M7.2 3h5.6" {...STROKE} />
      <path d="M6.4 11.8h7.2" {...STROKE} />
    </Glyph>
  );
}
