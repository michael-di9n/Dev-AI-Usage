import { MODES } from "../components/themes";
import { DESKTOP, LAPTOP, PHONE, type Assertion, type UiCheck } from "./UiCheck";

/**
 * WCAG AA for body text. Chosen rather than AAA because the palette is
 * deliberately low-key; AA is the line below which text stops being readable
 * rather than merely quiet.
 */
const MIN_CONTRAST = 4.5;

/** Below this, text is unreadable on a laptop screen regardless of contrast. */
const MIN_FONT_PX = 11;

/**
 * Every page in the nav. The baseline runs against all of them.
 *
 * Exported so `tests/ui-testing.test.ts` can assert coverage against this list
 * rather than a second copy of it. It held its own hardcoded array until the
 * Observability move renamed three routes, at which point the test failed for
 * the paths it had rather than the pages that exist - a drift that says
 * nothing about the app.
 */
export const PAGES = [
  { path: "/", name: "Trends" },
  { path: "/static", name: "AI maturity" },
  { path: "/observability", name: "Observability" },
  { path: "/observability/trace", name: "Trace" },
  { path: "/setup", name: "Setup" },
];

/**
 * The rail must link to every page, from every page.
 *
 * Learned the hard way: a page can be built, routed, and pass every check
 * while being unreachable, because these checks navigate by URL and never
 * click the nav. A page nobody can get to is not shipped.
 */
const RAIL_LINKS: Assertion[] = PAGES.map((page) => ({
  kind: "visible",
  selector: `.rail a[href="${page.path}"]`,
  why: `${page.name} is unreachable unless the rail links to it, and these checks navigate by URL so nothing else would notice.`,
}));

/** Every page, on every viewport, owes the reader these. */
const BASELINE: Assertion[] = [
  { kind: "hasHeading", why: "A page with no heading gives a screen reader nothing to navigate by." },
  { kind: "noHorizontalScroll", why: "Sideways scrolling hides content and is the most common responsive bug." },
  { kind: "linksHaveText", why: "A link with no text is unusable by keyboard and screen reader." },
  { kind: "minContrast", ratio: MIN_CONTRAST, why: "Below 4.5:1 body text fails WCAG AA and is hard to read in daylight." },
  { kind: "minFontSize", px: MIN_FONT_PX, why: "Text under 11px is not readable on a normal laptop screen." },
  ...RAIL_LINKS,
];

/**
 * The usage band, which is now Trends' and not the frame's.
 *
 * It was in BASELINE while it lived in the top bar of all five pages. It is
 * one page's figure now, so the assertion moved with it rather than being
 * deleted - a Trends page that renders without a band has lost a reading, and
 * nothing else on the page would notice.
 */
const USAGE_BAND: Assertion[] = [
  { kind: "visible", selector: ".usage-band", why: "The band is a reading of the cost figure above it. A Trends page without it drops the answer to \"is that a lot\", which a bare dollar figure cannot give on its own." },
  { kind: "visible", selector: ".usage-medal", why: "The metals are near-identical in luminance, so the medal's mark count is the channel that survives greyscale. Without it the band is a rank told only in colour." },
  { kind: "text", contains: "output tokens a day", why: "The band is now one large word. What it divided by has to be on the page beside it, not only in a tooltip that no touch device can open." },
  { kind: "text", contains: "last 30 days", why: "The band's window is fixed while the page above it is filtered. Beside a one-day cost figure, a thirty-day rank must say it is not reading the same slice." },
  { kind: "visible", selector: ".standing", why: "The other two readings of this setup sit beside the band. Without them a reader who never opens the other tabs has no way to know either has an answer." },
  { kind: "visible", selector: ".standing-line b", why: "A coloured word with no arithmetic beside it is a grade. Each standing has to carry the count its band was read off, the way every other figure in this tool does." },
  { kind: "visible", selector: ".standing-what", why: "\"Extensive\" and \"Tracing on\" name a verdict without naming what was measured. The line under each is what makes the word mean anything at a glance." },
];

/**
 * The pages that show the getting-started guide when nothing is imported.
 *
 * Deliberately not every page. AI maturity reads a repository off disk and
 * Observability reads settings files; both answer on a fresh clone
 * with nothing imported. Telling someone to run the importer on those would
 * send them to fix the wrong thing, so they must not be held to the
 * empty-state assertions.
 */
const GUIDED_PAGES = [
  { path: "/", name: "Trends" },
  // Trace draws imported transcripts and nothing else, so with none imported
  // the guide is the honest page. Observability is not held to this:
  // it reads settings files and answers on a fresh clone.
  { path: "/observability/trace", name: "Trace" },
];

/**
 * Checks for an install that has data.
 *
 * Runs each page in both colour schemes because the palette is defined twice,
 * and at phone width because a dashboard full of tables is where responsive
 * layout breaks first.
 */
export function populatedChecks(): UiCheck[] {
  const checks: UiCheck[] = [];

  for (const page of PAGES) {
    for (const theme of ["light", "dark"] as const) {
      checks.push({
        name: `${page.name} (${theme})`,
        path: page.path,
        viewport: DESKTOP,
        theme,
        assertions: BASELINE,
      });
    }
    checks.push({
      name: `${page.name} on a phone`,
      path: page.path,
      viewport: PHONE,
      theme: "dark",
      assertions: BASELINE,
    });
  }

  checks.push(
    {
      name: "Trends explains its own numbers",
      path: "/",
      viewport: LAPTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        ...USAGE_BAND,
        { kind: "text", contains: "not a bill", why: "Cost is derived, not billed - saying so prevents it being quoted as a bill." },
        { kind: "text", contains: "second opinion", why: "Two different cost figures side by side must be labelled or they look like a bug." },
        { kind: "text", contains: "imported", why: "A figure nobody can tell is stale is worse than an empty page: the empty page sends you to fix it, and this one gets acted on. The age of the import has to be beside the numbers." },
        { kind: "visible", selector: ".hero-v", why: "The page needs one figure it leads with; five equal tiles give the eye nowhere to land." },
        { kind: "visible", selector: ".k-icon", why: "The tiles are meant to be scannable at a glance, which is what the icons are for." },
        { kind: "visible", selector: ".tile-alert", why: "The lapsed-cache figure is the one red thing on the page. Without its tone the number is still there but reads as one more tile, and the reason it was singled out is gone." },
        { kind: "text", contains: "cache misses", why: "A bare count in red reads as an accusation. Naming what was counted - caches that went cold, not mistakes made - is what keeps it a measurement." },
      ],
    },
    {
      name: "The period is changeable from the page",
      path: "/?period=week",
      viewport: LAPTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        { kind: "text", contains: "this week", why: "The period in the URL must be reflected on the page, or the filter looks broken." },
        { kind: "visible", selector: ".segmented a.on", why: "A filter with no visible current selection leaves you guessing which is active." },
        { kind: "visible", selector: ".rail a.on", why: "Without a highlighted nav item there is no way to tell which page you are on." },
      ],
    },
    {
      name: "Bucket size is offered only where it changes the answer",
      path: "/?period=quarter&by=month",
      viewport: LAPTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        { kind: "text", contains: "By month", why: "Three months can be bucketed by month, so the control must be there and reflect the URL." },
        { kind: "visible", selector: ".chart-table", why: "Every chart needs its table twin, or the hover layer becomes the only way to read a value." },
      ],
    },
    {
      name: "A single day offers no bucket choice",
      path: "/?period=today",
      viewport: LAPTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        { kind: "absent", text: "By month", why: "One day bucketed by month is a one-point chart. A dead option is worse than no option." },
        { kind: "text", contains: "Today so far", why: "The live figure must be present whichever period is selected." },
        { kind: "text", contains: "by hour", why: "A day bucketed by day is a single dot. Hours are the only bucket that shows today any shape, so the heading has to say that is what it did." },
      ],
    },
    {
      name: "The cost is also shown as something you can count",
      path: "/",
      viewport: LAPTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".coins svg", why: "A dollar figure at 48px is precise and hard to feel; the stack is the reading that has a size, and a broken SVG would take it away silently." },
        { kind: "text", contains: "a coin", why: "A unit chart that does not say what one unit is worth cannot be counted, only admired." },
        { kind: "text", contains: "a coin", why: "The stack rounds down. The coin's value and the money that did not become one both have to be stated, or the picture rounds in silence." },
      ],
    },
    {
      name: "The cost says which models spent it",
      path: "/",
      viewport: LAPTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".mix-bar", why: "The hero states one total and nothing else says what it was spent on. Without the split, a bill that doubled because one model was picked differently is indistinguishable from one that doubled because there was more work." },
        { kind: "visible", selector: ".mix-list .mix-name", why: "Four hues in a bar are not a reading. The names beside the marks are, and they are the only channel left for anyone who cannot separate the colours." },
        { kind: "visible", selector: ".mix-list .mix-usd", why: "The dollars are the base of every share on this card, and they used to be reachable only by hovering a row - which is to say not reachable by touch at all. A percentage with no base is the shape of a claim rather than of evidence, and this assertion is what keeps them on the page." },
        { kind: "text", contains: "share of derived cost", why: "A bare percentage invites the reader to assume it counts messages. The one it actually divides is the money, and the strip is too small to make that obvious any other way." },
      ],
    },
    {
      name: "Habit badges show their own arithmetic",
      path: "/",
      viewport: LAPTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".badges", why: "The badges are a reading of the same slice as the cost; losing them silently would leave the page saying only what was spent, never how it was worked." },
        { kind: "visible", selector: ".badge-measure", why: "A badge with no figure under it is a verdict with no evidence, which is the one thing this project will not ship." },
      ],
    },
    {
      /**
       * The Today filter is where every "not enough evidence" message used to
       * land, and the one window that could never satisfy one: it cannot hold
       * three active days or two chart buckets however hard the reader works.
       * All of those floors are gone, and this is the check that they stay
       * gone - a one-day window divides by one, and the page says so.
       */
      name: "A single day is banded, and says what it divided by",
      path: "/?period=today",
      viewport: LAPTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        { kind: "text", contains: "How you worked today", why: "The same chip means \"this is how you work\" over a month and only \"this is what today held\" over a day. Nothing else on the row separates the two, so the heading has to." },
        { kind: "absent", text: "Badges need", why: "Three active days cannot happen inside a one-day window. Asking for them here was an impossibility dressed as advice, and it read as \"you have not worked enough\" on a day the reader worked plenty." },
        { kind: "absent", text: "one busy afternoon is not a habit", why: "The habit floor is gone: the bands are rates per active day, and a one-day window divides by one. Quoting a floor the window cannot reach answers a question the reader did not ask." },
        ...USAGE_BAND,
        { kind: "visible", selector: ".chart", why: "Today is the period most likely to hold one bucket or none, and it is exactly where the charts used to refuse to draw and print a note about sample size instead. The axes are what the reader asked for." },
        { kind: "absent", text: "trend needs at least", why: "A chart that withholds itself to lecture the reader about how many buckets they have answers a question nobody asked." },
        { kind: "absent", text: "too few to trend", why: "Same verdict in a tile. \"Days with data\" is a count, and on the Today filter that phrase was the only thing it could ever say." },
        { kind: "visible", selector: ".chart-table", why: "Today is the period most likely to be padded backwards, and the table twin is the only place a reader can see which buckets the chart actually drew." },
      ],
    },
    {
      /**
       * Structural assertions only, and deliberately so: this page renders
       * whichever repository is selected in app_state, so a check that named a
       * capability or a path would pass or fail on which repo the machine
       * happened to be pointed at rather than on whether the page works.
       */
      name: "AI maturity leads with the count",
      path: "/static",
      viewport: LAPTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".scan-figure", why: "The count is the page's one answer. Without it the grid is eight equal cells and the eye has nowhere to land - which is what eight identical full-width cards used to do." },
        { kind: "visible", selector: ".cap", why: "The capability grid is the page. A cell that does not render takes a capability off the page entirely, and an absence nobody can see reads as a capability nobody checked." },
        { kind: "visible", selector: ".chevrons", why: "Every cell carries a band now, and the chevrons are where it is drawn. All eight rendering without one would say the page had measured nothing." },
        { kind: "visible", selector: ".cap-next", why: "A band with no unmet condition beside it is a grade. This is the line that says what would change it, which is what keeps the colour a measurement." },
        { kind: "text", contains: "Nothing was written to it", why: "The page reads someone's repository off disk. That it only reads has to be stated on the page, not trusted to the README." },
        { kind: "text", contains: "No model has seen any of it", why: "The page now assigns tiers, which is the closest this tool comes to judging. That the tiers are arithmetic over files and not a model's opinion has to be on the page beside them." },
        { kind: "text", contains: "is bronze", why: "The whole rule is three numbers, and the page has to print them. A reader who cannot see the thresholds cannot check a band, and an unpublished threshold is a grade however simple the arithmetic behind it." },
        { kind: "text", contains: "on average", why: "The seal shows a count and the band shows an average of eight bands. Without the line saying so, the colour reads as if it were derived from the number struck beside it." },
        { kind: "visible", selector: "#repo-select", why: "The control that decides every figure on the page has to be on the page, above them. It used to be a button in the header that threw the choice away, and a second copy of the picker below the grid." },
        { kind: "absent", text: "Change project", why: "Changing project is the select, and nothing else. A button that clears the choice as well is two ways to do one thing, and the one that clears it leaves the page with nothing on it." },
      ],
    },
    {
      /**
       * The grid is the page's new responsive risk. The full-width panels it
       * replaced could not overflow; a grid of fixed-minimum cells holding
       * absolute paths can, and a path is the longest string here.
       */
      name: "The capability grid holds at phone width",
      path: "/static",
      viewport: PHONE,
      theme: "light",
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".cap", why: "A grid that collapses to nothing on a phone loses the whole answer, and the baseline heading check would still pass." },
        { kind: "visible", selector: "#repo-select", why: "The picker is two columns on a laptop and has to stack rather than disappear: a phone reader who cannot change project can only see whichever repo was chosen elsewhere." },
      ],
    },
    {
      /**
       * Structural, like the AI maturity checks and for the same reason: this
       * page reads whichever repository is selected in app_state, and every
       * verdict on it depends on settings files that differ per machine. What
       * can be asserted is that the page states a verdict at all, and that the
       * unmet requirements carry the two things that make them actionable.
       */
      name: "Observability states the gate and names what is missing",
      path: "/observability",
      viewport: LAPTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".gate", why: "The gate is the page's one answer, and the only thing on it a reader acts on. Without it the page is a list of tiers and the reader has to work out the verdict themselves." },
        { kind: "text", contains: "In-depth tracing", why: "The gate has to be a sentence. It replaced a coloured light on purpose - a mark that only changes hue says nothing in greyscale, in a printed screenshot, or to a screen reader." },
        { kind: "visible", selector: ".rp-pipe", why: "The pipe is the page. Without it the badge is a verdict with nothing behind it, and where the water stops is the only thing that says what to do next." },
        { kind: "visible", selector: ".rp-node", why: "The nodes are the requirements. A pipe drawn with none of them would be a progress bar, which cannot show which requirement is the gap." },
        /* The panel that explains a node is shut until the URL names it, so
           it is correctly absent here. What must hold on arrival is that the
           thing which opens it is a real link: `:target` is driven by the
           fragment, and a vessel that is not an anchor could not set one. */
        { kind: "visible", selector: ".rp-node[href]", why: "Each vessel is a link to its own panel. Without that it is a hover target, which is unreachable by keyboard and invisible to touch - and the panel behind it carries the only statement of what the setting was found set to and the only line the reader can copy." },
        { kind: "visible", selector: ".rp-manifold .rp-node", why: "The content settings are the only way to see what a remote agent said, and they are off by default. Drawn nowhere, a reader pointing this receiver at another machine has no way to learn they exist - and half the sessions arriving here already have no transcript on this disk." },
        { kind: "text", contains: "only record of what was said", why: "The branch has to say why it is optional rather than required. Four unexplained switches beside a run that is explained is an invitation to set them because they are there." },
        { kind: "visible", selector: ".rp-drop", why: "The drop is the only thing that says where the content branch comes from. Four vessels under the run with no pipe between them is the dashed box this replaced - a footnote a reader cannot relate to anything above it." },
        { kind: "visible", selector: ".rp-end", why: "The terminus is what the run is for. Without it the pipe leads nowhere and the diagram stops being about tracing at all." },
        { kind: "visible", selector: ".rp-manifold .rp-end", why: "The branch needs its own terminus, or four switches are drawn with nothing said about what turning them on produces - which is the question a reader arrives at them with." },
        { kind: "visible", selector: ".rp-manifold .rp-stop-end .rp-tag", why: "The content terminus has to state its outcome in words - `text arrives` or `text stays redacted` - and not only as a vessel that is full or empty. Fill is the one channel that survives neither greyscale nor a screen reader." },
        { kind: "visible", selector: ".rp-legend-go", why: "Each tier has to open the first requirement it is missing. Without it a reader who has read the caption and wants the fix has to work out which of the nodes above it is the unset one." },
        { kind: "absentSelector", selector: ".rp-scroll:target", why: "Every panel is shut on arrival. One open by default would put a wall of settings advice under a diagram whose whole job is to answer at a glance, which is what deleting the Telemetry and Hooks tabs was meant to stop." },
        { kind: "absentSelector", selector: ".scan-source", why: "The list of settings files read moved onto the nodes, which each name the file their value came from. A footer repeating all three put the page's least-used detail in its most permanent slot." },
        { kind: "absentSelector", selector: ".tiles", why: "What has arrived is one line inside the panel for the setting responsible for it, not a row of counters. A tile row under the diagram put a second question on a page whose whole point is having one." },
        { kind: "visible", selector: "#repo-select", why: "The control that decides which settings files are read has to sit above the verdicts it produces, or the page names a project the reader did not choose." },
        { kind: "absent", text: "$0.00", why: "The house rule, checked here too: this page reports counts and states, and a currency figure appearing on it would mean something upstream coalesced a null." },
      ],
    },
    {
      /**
       * The pipe is this page's responsive risk. Seven vessels in a row with
       * a tag under each cannot stay a row at 390px, so it turns and runs
       * down the page - and the captions and their links go with it.
       */
      name: "The observability pipe holds at phone width",
      path: "/observability",
      viewport: PHONE,
      theme: "light",
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".rp-node", why: "The pipe turns and runs down the page at this width. If the nodes go with it the diagram is gone and the baseline heading check would still pass." },
        { kind: "visible", selector: ".gate", why: "The verdict is the one thing worth reading on a phone. If anything is dropped at this width it must not be this." },
        { kind: "visible", selector: ".rp-legend-go", why: "The captions stack at this width, and the link is the item most likely to be pushed off. It is also the only way to the fix." },
      ],
    },
    {
      /**
       * The panels are the two tabs that were deleted. If a node opens
       * nothing, the settings advice for seven variables is gone from the app
       * rather than moved into it - and every other check on this page would
       * still pass, because they all describe the diagram.
       */
      name: "A node opens the panel that says how to set it",
      path: "/observability#req-OTEL_LOGS_EXPORTER",
      viewport: LAPTOP,
      theme: "light",
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".rp-scroll:target", why: "The panel is opened by the URL fragment and nothing else. If :target does not open it, every node is a link to blank space and the fixes are unreachable without JavaScript this app does not ship." },
        { kind: "text", contains: "OTEL_LOGS_EXPORTER", why: "The panel has to name the variable it is about. A fix a reader cannot match to a node is a fix for something else." },
        { kind: "visible", selector: ".rp-scroll:target .rp-scroll-line", why: "The line to copy is the reason this panel exists. Prose telling someone to set a variable to otlp is a line they retype, which is a line with a typo in it." },
        { kind: "visible", selector: ".rp-scroll:target .rp-scroll-shut", why: "A panel opened by URL must offer the way back, or the only way to shut it is to edit the address bar." },
      ],
    },
    {
      /**
       * The terminus is the one vessel that opens something other than
       * settings advice, and the only place on the app where the records
       * themselves are printed. What can be asserted is machine-independent
       * and structural, like every other check on this page: the window
       * opens, and it carries the tally. Which of its three states it lands in
       * depends on whether this machine's exporter has ever sent anything, so
       * that split is pinned in `tests/trace-tap.test.ts` instead.
       */
      name: "The trace terminus taps the line",
      path: "/observability",
      viewport: LAPTOP,
      theme: "dark",
      /* The trace terminus, not the content one: there are two `.rp-end` on
         this page and only this one is a button. Named by its cell as well, so
         the day the other becomes a control this check still clicks the one it
         is about. */
      /* Open the window, then flip one switch off. The second gesture is the
         only exercise this suite gets of the stored-selection path on this
         page, and `log` rather than `span` because it is the stream that is
         never the last one on - `toggleTapKind` disables the switch that
         would leave the window reading nothing, and a disabled button would
         make this step assert nothing at all. */
      steps: [
        { click: ".rp-cell-end button.rp-end" },
        { click: ".mon-kinds .mon-kind[data-kind=\"log\"]", settle: 300 },
      ],
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".mon[open]", why: "The vessel has to open something. A reader who has set all seven nodes wants to know whether anything is arriving, and every other statement of that on the page is a single count inside the panel for one setting - nobody opens seven panels to add up three numbers." },
        { kind: "text", contains: "trace-tap", why: "The window has to name what it is tapping. An unlabelled terminal full of attribute pairs could be read as this app's own log rather than as what Claude Code sent." },
        { kind: "visible", selector: ".mon-tally dd", why: "The counts are the answer the window exists to give, and they are figures rather than dashes because the receiver runs in this process: it was asked, so a zero here is a measurement." },
        { kind: "text", contains: "last heard", why: "A count with no clock beside it cannot distinguish a receiver that is working from one that stopped an hour ago, which is the exact confusion this page exists to clear up - OpenTelemetry reads its settings at launch and never backfills." },
        { kind: "visible", selector: ".mon-kinds .mon-kind[data-kind=\"span\"]", why: "The window reads three streams and remembers which. Without the switches a reader whose metric exporter lands thirty points a minute has a log they cannot read, and no way to quiet it; whether any given stream has lines on this machine is state, and is pinned in tests/trace-tap.test.ts instead." },
        { kind: "visible", selector: ".mon-kinds .mon-kind[data-kind=\"log\"][aria-pressed=\"false\"]", why: "A switch has to answer the click that flipped it. This is a stored selection, and a control that does not visibly change when clicked is one the reader clicks twice - which used to be the honest reading of it, because the whole page re-rendered behind an import pass before anything moved." },
        { kind: "text", contains: "otel/", why: "The prompt line has to say what is being tailed, and which streams - a window showing spans under a command that names events would be a window misreporting itself." },
        { kind: "visible", selector: ".mon-shut .btn", why: "A modal opened by a click must offer the way out on the page. Escape and the backdrop both work, and neither is discoverable by a reader who has never been shown them." },
        { kind: "absent", text: "$0.00", why: "The house rule, inside the window too: it prints counts and attribute values, so a currency figure appearing here would mean something upstream coalesced a null." },
      ],
    },
    {
      /**
       * The count at the end of a row opens the record whole, and doing that
       * must not cost the reader the tail they were reading. Two windows open
       * at once is the assertion; which record lands in the second one is
       * machine-dependent, so what it contains is pinned in
       * `tests/trace-tap.test.ts` instead.
       *
       * Its own check rather than more steps on the one above, because that
       * one ends with a stream switched off and this needs a row on screen to
       * click - and a check that depends on the state another check left is a
       * check that fails in isolation.
       */
      name: "A row's count opens the record whole",
      path: "/observability",
      viewport: LAPTOP,
      theme: "dark",
      steps: [
        { click: ".rp-cell-end button.rp-end" },
        { click: ".mon-out .mon-more", settle: 250 },
      ],
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".mon-detail[open]", why: "The count is the only thing on a row that names something the reader cannot otherwise reach - a row saying it has eight more attributes and offering no way to read them is a record half-reported." },
        { kind: "visible", selector: ".mon-detail .mon-pairs dt", why: "The window has to print the attribute names, not just their values: an unlabelled column of ids and numbers is not a record, and the keys are what a reader is scanning for." },
        { kind: "visible", selector: ".mon[open]:not(.mon-detail)", why: "Opening one record must not shut the tail it came from. The reader is mid-read of a live window, and losing forty lines to a click that was meant to expand one of them is the thing this control would otherwise cost." },
        { kind: "text", contains: "whole, not cut to the width of a line", why: "The window has to say how it differs from the row it was opened from, or a reader who sees the same truncated values twice has no reason to believe the second copy." },
        { kind: "absent", text: "$0.00", why: "The house rule, in the one place on this page that prints an attribute value in full - a coalesced null would surface here first." },
      ],
    },
    {
      name: "A trace row opens to show what was actually sent",
      path: "/observability/trace",
      viewport: LAPTOP,
      theme: "dark",
      /*
       * Three clicks now, because the tree starts shut and a tool call is
       * three levels down: the prompt, the model turn it caused, then the
       * call. That is worth walking rather than working around - it is the
       * route a reader actually takes, and if any step of it will not open
       * there is no way to the arguments at all.
       *
       * Every selector is `:has()`-qualified so each click lands on a row that
       * leads to the next one. Without that the second click picks the first
       * message in the document, which need not be one that called a tool, and
       * the third then waits on a row that is still inside a shut parent.
       */
      steps: [
        { click: ".tr-prompt:has(.tr-tool) > summary", settle: 250 },
        { click: ".tr-prompt[open] .tr-message:has(.tr-tool) > summary", settle: 250 },
        { click: ".tr-prompt[open] .tr-message[open] .tr-tool > summary", settle: 250 },
      ],
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".tr-body pre", why: "The argument a tool was called with is the whole point of this page. A tree that will not open is a list of tool names, which the run list beside it already gives you." },
        { kind: "absentSelector", selector: ".tr[open] .tr[open] .tr[open] .tr[open]", why: "Rows open because someone opened them. Four levels deep without four clicks would mean the tree had gone back to opening itself, which is what made a long run arrive as a transcript dump." },
      ],
    },
    {
      /*
       * Two clicks, not one, and that is the point of it.
       *
       * Collapsing writes a stored choice against the reader's own database,
       * so a check that only collapsed would leave the list shut for whoever
       * runs the suite. Closing it and opening it again proves the whole round
       * trip - the form posts, the action writes, the page comes back - and
       * leaves the page exactly as it was found. A check with a side effect is
       * a check nobody runs twice.
       */
      name: "The run list can be put away and brought back",
      path: "/observability/trace",
      viewport: LAPTOP,
      theme: "light",
      /*
       * The second click is on the button the first one re-rendered, so it
       * must not be sent until that has arrived - and this page re-renders a
       * tree that can run to hundreds of rows, so "has arrived" is a real wait
       * rather than a formality. Generous on purpose: a check that passes four
       * times out of five is worse than no check, because the failure teaches
       * everyone to re-run rather than to look.
       */
      steps: [{ click: ".runs-toggle button", times: 2, settle: 1_500 }],
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".runs .run", why: "The rows have to survive the round trip. A toggle that collapses and cannot re-expand takes the page's index away with one click and no way back." },
        { kind: "text", contains: "in this project", why: "The count stays whichever state the list is in, so putting the runs away never looks like losing them." },
      ],
    },
    {
      /*
       * Same shape as the collapse check, and for the same reason: the OTEL
       * filter is a stored choice, so a check that only turned it on would
       * leave every later run of this suite filtering the reader's own
       * database. The second click proves the way back exists.
       */
      name: "Runs can be filtered to OTEL spans and back",
      path: "/observability/trace",
      viewport: LAPTOP,
      theme: "light",
      steps: [{ click: ".otel-toggle button", times: 2, settle: 1_500 }],
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".runs .run", why: "Turning the filter back off has to bring every run back, not just the OTEL ones - otherwise the control is a one-way door and the reader loses the list for the rest of the visit." },
        { kind: "text", contains: "in this project", why: "The denominator has to read as the whole project again once the filter is off, the same rule the date filter is held to." },
      ],
    },
    {
      /*
       * A preset, then All time. Same shape as the collapse check and for the
       * same reason: filtering writes a stored choice against the reader's own
       * database, so the check has to put it back. The second click also
       * proves the way out exists, which is the half of a filter that gets
       * forgotten.
       */
      name: "The run list can be filtered by date and cleared again",
      path: "/observability/trace",
      viewport: LAPTOP,
      theme: "light",
      steps: [
        { click: ".runs-col .gear", settle: 400 },
        { click: ".filter-presets button", settle: 1_500 },
        { click: ".runs-col .gear", settle: 400 },
        { click: ".filter-presets button:last-of-type", settle: 1_500 },
      ],
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".runs .run", why: "All time is the way back. A filter that can be applied and not cleared leaves the reader with an empty list and no way to find out why." },
        { kind: "text", contains: "in this project", why: "With no filter on, the count is the project's own and says so - it only claims to be a subset when it is one." },
      ],
    },
    {
      /*
       * Tapping a step, not hovering one.
       *
       * The card opens three ways - pointing, tabbing, tapping - and only the
       * third is available to a touch screen, which is the whole reason the
       * chips are labels over radios rather than a hover rule. So the check
       * exercises the one that would otherwise go untested, and it is a real
       * behaviour check: a card hidden by CSS is out of `innerText` and out of
       * the visibility probe, exactly like a closed <details>.
       */
      name: "Pointing at a path step opens a card at the cursor",
      path: "/observability/trace",
      viewport: LAPTOP,
      theme: "dark",
      /*
       * Hovered, not clicked. A click on the same chip opens the window
       * instead - the card is a peek and the window is the whole of it - so
       * this was passing for the wrong reason until the click stopped pinning
       * the card, and then failing for the right one. It is the gesture the
       * feature is, so it is the gesture the check makes.
       */
      steps: [{ hover: ".tp-strip .tp-step .tp-node", settle: 300 }],
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".tp-card", why: "Every fact the chips do not print - the MCP server, the skill's arguments, how long the step took and who timed it - lives in the card. Without it the strip is five words per step and the detail is unreachable except by scrolling the tree." },
        { kind: "visible", selector: ".tp-card-ms", why: "A step with no duration beside it invites the reader to assume it was instant. The dash, and the sentence saying how many of the step's calls were timed, are what keep an unmeasured step from reading as a fast one." },
      ],
    },
    {
      /*
       * The one check that lets the page move.
       *
       * Every other check runs with motion reduced, so the probe measures what
       * a page settles to rather than a frame of it arriving - see
       * `UiCheck.motion`. That makes the suite deterministic and it would also
       * make the animation itself untested, which is how a flourish that never
       * finishes ships: rows stuck at `opacity: 0` look identical to rows that
       * were never rendered, and no still check can tell those apart.
       *
       * So this one plays it, clicks the panel to cut it short, and then
       * asserts the state it is supposed to end in. The click is the feature
       * as much as it is the wait: an animation a reader cannot skip is an
       * obstacle, and this is the only thing that proves the skip works.
       */
      name: "The terminal prints itself in, and a click jumps to the end",
      path: "/observability/trace",
      viewport: LAPTOP,
      theme: "dark",
      motion: "play",
      steps: [{ click: ".term-panel", settle: 500 }],
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".term-panel.printed", why: "Clicking the terminal is what ends the printing. Without the class the rows are still on their own delays, so a reader who asked to see the run is still watching it arrive." },
        { kind: "visible", selector: ".tr-prompt", why: "The rows have to be there and painted once the printing is over. A row left at zero opacity by an animation that never completed is indistinguishable from a row that was never rendered, and this is the assertion that separates them." },
        /*
         * The caret is a `::after` on `.term-panel:not(.printed)`, and
         * `querySelector` cannot match a pseudo-element - an assertion naming
         * one would pass whatever the page did. It is covered by the class
         * above instead: once `.printed` is on, the selector the caret hangs
         * off no longer matches anything.
         */
      ],
    },
    {
      /*
       * The window a chip opens, and the two things about it that can fail
       * quietly.
       *
       * It grows out of the chip, and the growth is a `transform-origin`
       * measured from the chip and the dialog. That measurement was wrong the
       * first time - the rect was read while the grow animation was already
       * running, so it reported the box mid-transform and every window grew
       * from roughly its own corner. It looked deliberate. Nothing but an
       * assertion on the untruncated body and the facts would have caught that
       * the window was showing the right step, so what is checked here is the
       * content; the origin is arithmetic and pinned by measurement in the
       * browser rather than by a still screenshot.
       */
      name: "A path step opens a window with the whole of what it was given",
      path: "/observability/trace",
      viewport: LAPTOP,
      theme: "light",
      steps: [{ click: ".tp-strip .tp-step .tp-node", settle: 400 }],
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".tp-window[open]", why: "Clicking a step is a request for the whole of it. The card that follows the cursor clamps the argument to three lines; if the window does not open, the untruncated text is reachable nowhere on the page." },
        { kind: "visible", selector: ".tp-window pre", why: "The uncut argument is the reason the window exists rather than a bigger tooltip. A window that opens without it is a heading and a duration, both of which the chip already had." },
        { kind: "visible", selector: ".tp-window-shut button", why: "A modal a reader cannot see how to leave is a trap. Escape and the backdrop both work, but neither is visible, so the button is the one that has to be there." },
        { kind: "text", contains: "Step 1 of", why: "The window is opened from a chip in a strip of forty and says which step it is. Without that it is a panel about something the reader has to remember they clicked." },
      ],
    },
    {
      /*
       * Expanding the strip, which writes a stored choice - so this puts it
       * back, the way the run-list checks do. Two submits: one to grow it, one
       * to return it to the first forty. A check that left the budget raised
       * would leave whoever ran the suite with a seven-row strip for good.
       */
      name: "The path strip can be expanded and put back",
      path: "/observability/trace",
      viewport: LAPTOP,
      theme: "light",
      steps: [
        { click: ".tp-more", settle: 1_500 },
        { click: ".tp-fewer button", settle: 1_500 },
      ],
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".tp-strip .tp-step", why: "The steps have to survive the round trip. An expand that cannot be undone leaves a reader carrying a strip of hundreds of chips into every later visit, because the budget is stored." },
        { kind: "text", contains: "not only the rows drawn above", why: "The caption is rebuilt on every expansion and is the only thing separating the strip's step count from the tree's row count. Losing it during a round trip would make both numbers read as the same denominator." },
        { kind: "absentSelector", selector: ".tp-fewer", why: "Back to the first forty is the way out, and it must disappear once taken - a way back from nowhere is a control that does nothing." },
      ],
    },
    {
      name: "The trace page dashes what it did not measure",
      path: "/observability/trace",
      viewport: LAPTOP,
      theme: "light",
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".tr", why: "The tree is the page. If no row renders there is nothing here worth opening." },
        { kind: "visible", selector: ".runs .run", why: "One run is on screen and there are hundreds. Without the list beside it the page shows a trace nobody chose, and choosing again next visit." },
        { kind: "visible", selector: ".runs-cols", why: "Two unlabelled columns of hex and dates is a table the reader has to decode before using. The header is what makes the id and the date tell themselves apart." },
        { kind: "visible", selector: "#trace-project", why: "The page is scoped to one project now, and the control that scopes it has to be on it - otherwise the run list names a project the reader never chose." },
        { kind: "visible", selector: ".section-action a[download]", why: "Exporting the run is why someone opens a trace they cannot read in full on screen, and it belongs on the section's own line rather than buried under its note." },
        { kind: "text", contains: "Export this run", why: "\"Export JSON\" beside a list of five hundred runs did not say which run it meant - it only ever wrote the one on screen, and naming it is the difference between a reader trusting that and guessing it." },
        { kind: "text", contains: "Export all", why: "The other half of the question the one button was answering. Without it, exporting a project means clicking through every run in the list by hand." },
        { kind: "visible", selector: ".rc-top .rc-bar", why: "What a run cost is the first thing asked of it, and where the money went is the more useful half of that. The bar frames the tree; four figures alone said only how much." },
        /*
         * The path strip. Its whole claim is that it summarises the run rather
         * than the rows below it, and the two assertions that matter are the
         * two ways that claim can quietly fail: the strip not rendering at all
         * (the page falls back to a tree nobody can see the shape of), and a
         * step printing a count it did not collapse.
         */
        { kind: "visible", selector: ".tp-strip .tp-step", why: "The strip is what makes a run of thousands of rows readable at a glance. Without it the page opens on a capped tree and the shape of the run - which tools, which server, which subagent, in what order - can only be reconstructed by scrolling." },
        { kind: "visible", selector: ".tp-node .tp-name", why: "Five glyphs in a row are a texture, not a path. The name beside each is the channel that survives greyscale and is the only thing a screen reader carries - the colours are measured to separate, but they are never the only encoding." },
        { kind: "text", contains: "not only the rows drawn above", why: "The tree above the strip is capped at 500 rows and the strip is not. A reader just told they are seeing 500 of 47,628 rows will read the strip as a summary of those 500 unless it says otherwise, and every step count on it would then be wrong by orders of magnitude." },
        { kind: "visible", selector: ".tp-legend li .tp-glyph svg", why: "Five colours are an encoding only once something names them. The legend is what turns the strip from a row of coloured marks into a reading, and it names only the kinds this run used. It used to live in the card's reserved slot; with the card following the pointer there is no slot, and this is what stops it being dropped with it." },
        { kind: "visible", selector: ".rc-top .rc-chip.rc-total", why: "The bar is a proportion and the total cannot be read back out of it. Replacing the figures with the bar rather than adding to them would have traded one kind of information for another." },
        { kind: "visible", selector: ".rc-top .rc-chip.rc-cacheRead", why: "The four token classes are the answer to where the money went, and they are only here now - the section that used to carry them was removed as a second copy. If the chips go, the breakdown goes with them." },
        { kind: "visible", selector: ".rc-chip-icon svg", why: "The four hues are the model-mix palette and near enough in lightness that colour alone will not separate them. The glyph is the channel that survives greyscale, and it is what ties a chip to its segment." },
        { kind: "visible", selector: ".run-cell .marks-cost", why: "Which run to open is the question this list exists to answer, and until the cost was on every row it could only be answered by opening each one." },
        { kind: "visible", selector: ".run-cell .marks-tools", why: "A run's tool count is the other half of how big it was. Cost alone cannot tell a long cheap run from a short expensive one." },
        { kind: "visible", selector: ".run-cell .run-fig", why: "The marks are a band and the figure is the measurement. A column of glyphs with no numbers beside them is a verdict with no evidence, which is the one thing this project will not ship." },
        { kind: "visible", selector: ".runs-toggle button[aria-expanded]", why: "The run list is the taller half of the page on a project with hundreds of runs. Collapsing it is how the tree gets the screen, and the control has to say which state it is in." },
        { kind: "visible", selector: ".otel-toggle button[aria-pressed]", why: "The list otherwise mixes runs OTEL never touched with ones it did, and a reader trying to judge OTEL coverage has no way to see just the second kind - the control has to say whether that filter is on." },
        { kind: "absentSelector", selector: ".trace-controls .segmented", why: "The time window sat above the run list and scoped a chart, not the list - so it looked like it narrowed the runs and did not. It belongs in the Ended column with the dates it filters, and having both would be two controls for one job." },
        { kind: "visible", selector: ".term-panel", why: "The tree is raw machine output and reads as a terminal. Losing the surface would leave monospace text on a page-coloured panel, which is neither." },
        { kind: "absentSelector", selector: ".runchart", why: "The bar-per-run chart was a second index of the same runs the list already holds, and the list gained the cost of each one as a column - so the chart was two ways to spot an expensive run, and the reader had to check they agreed." },
        { kind: "absentSelector", selector: ".rc-keys", why: "The four classes had a section of their own further down, saying what the chips above the tree now say. Two objects agreeing with each other twenty lines apart is one object too many, and the reader has to check they still agree." },
        { kind: "absent", text: "Neither backfills", why: "The three standing explanations about em dashes, thinking rows and cut bodies moved to the docs. They described the tool rather than this run, and they were longer than the run's own summary." },
        /*
         * The em-dash rule, asserted by selector rather than by absent text.
         *
         * Every other page can assert `absent: "0 ms"`, because every string
         * on it is one the page wrote. This page renders transcript content
         * verbatim, and a transcript can contain any string at all - a session
         * that happened to discuss durations put four "0 ms" on screen while
         * this check was being written. An absent-text rule here fails when
         * the page quotes a zero, which is not the bug it is looking for.
         */
        { kind: "visible", selector: ".tr-ms .dash", why: "With traces off - the default, and true of every session imported before today - a duration is unknown and must render an em dash. A fabricated zero is the exact bug this project exists to avoid, and this is the element that proves it did not happen." },
        /*
         * The thinking explanation used to be asserted here as a page-level
         * paragraph. It is a row-level note now - rendered inside the thinking
         * row that needs it, where a closed <details> keeps it out of
         * innerText - so this check can no longer see it. What is asserted
         * instead is the property that made the paragraph necessary: an
         * unmeasured duration is an em dash and never a zero.
         */
        { kind: "absent", text: "Neither backfills", why: "The three page-level explanations moved out. They described how the tool works under every trace rather than anything about this run, and together they were longer than the run's own summary." },
      ],
    },
    {
      name: "Setup says what the archive is holding",
      path: "/setup",
      viewport: LAPTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        { kind: "text", contains: "Transcript archive", why: "The archive is the only thing here that is not derived. A reader who does not know it exists cannot know their transcripts are being kept." },
        { kind: "text", contains: "expires", why: "The archive only makes sense once you know Claude Code deletes transcripts on its own. Without that sentence it reads as a pointless copy." },
        /*
         * The dials, and the two things that keep a dial honest.
         *
         * A pointer states a band, which is a judgement. The window under it
         * carries the figure the band was read off, and the rule beside the
         * bank carries the three numbers that turn one into the other. Drop
         * either and the panel is giving grades - which is the one thing every
         * other page here is careful not to do.
         */
        { kind: "visible", selector: ".knob .knob-index", why: "The dial is the reading. A knob with no pointer on a machine that has measured something is an instrument showing nothing. Assumes the shipped default, archiving on - the fresh-clone suite checks the other way round." },
        { kind: "visible", selector: ".readout", why: "A band with no figure under it is a grade. The exact number has to sit in the window beneath the pointer that summarised it." },
        { kind: "text", contains: "high 1,000 and over", why: "\"High\" means nothing until the page says where high starts. The thresholds are printed beside the dials so a reader can check the pointer against arithmetic." },
      ],
    },
    {
      name: "Setup never hides a missing source",
      path: "/setup",
      viewport: LAPTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        { kind: "text", contains: "normal state", why: "An unconfigured source must not read as a failure." },
      ],
    },
    {
      name: "Setup survives a phone",
      path: "/setup",
      viewport: PHONE,
      theme: "light",
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".sheet-where code", why: "The paths are the reason someone opens this page on a second device. An absolute path is longer than a phone is wide, so this is the assertion that catches it overflowing rather than wrapping." },
        { kind: "visible", selector: ".knob", why: "The dials must survive the narrowest viewport. A bank that collapses to nothing takes the archive's whole reading with it." },
      ],
    },
  );

  // The top-bar button steps system -> light -> dark -> system. Driven for
  // real, reading back the attribute the app actually applies to <html>.
  checks.push(
    {
      name: "One click on the top bar pins light",
      path: "/",
      viewport: LAPTOP,
      theme: "dark",
      steps: [{ click: ".cycler" }],
      assertions: [
        ...BASELINE,
        { kind: "rootAttribute", name: "data-mode", equals: "light", why: "The first click must leave the system default, or the button does nothing visible on a dark machine." },
      ],
    },
    {
      name: "Clicking through to dark",
      path: "/",
      viewport: LAPTOP,
      theme: "light",
      steps: [{ click: ".cycler", times: 2 }],
      assertions: [
        ...BASELINE,
        { kind: "rootAttribute", name: "data-mode", equals: "dark", why: "Two clicks must reach dark, or the order of the three modes is wrong." },
        { kind: "text", contains: "Dark", why: "The button must name the mode now in use, not the one before it." },
      ],
    },
    {
      name: "Cycling all the way round returns to the system setting",
      path: "/",
      viewport: LAPTOP,
      theme: "light",
      steps: [{ click: ".cycler", times: MODES.length }],
      assertions: [
        ...BASELINE,
        { kind: "rootAttribute", name: "data-mode", equals: null, why: "A full lap must clear the attribute, or clicking eventually dead-ends." },
      ],
    },
    {
      name: "Pinning dark from Setup overrides a light system setting",
      path: "/setup",
      viewport: LAPTOP,
      theme: "light",
      steps: [{ click: ".picker-row .swatch:last-of-type" }],
      assertions: [
        ...BASELINE,
        { kind: "rootAttribute", name: "data-mode", equals: "dark", why: "Choosing dark on a light machine must actually pin dark." },
      ],
    },
  );

  checks.push({
    name: "Light and dark are both reachable",
    path: "/setup",
    viewport: LAPTOP,
    theme: "light",
    assertions: [
      ...BASELINE,
      { kind: "visible", selector: ".cycler", why: "Without a control in the top bar, someone who wants dark has to find the Setup page first." },
      { kind: "visible", selector: ".picker", why: "Setup must offer the three modes directly, not just a button that cycles." },
      ...MODES.map((m): Assertion => ({
        kind: "text",
        contains: m.label,
        why: `${m.label} must be listed by name so it can be chosen directly rather than cycled to.`,
      })),
    ],
  });

  return checks;
}

/**
 * Checks for a fresh clone with nothing imported.
 *
 * The `absent` assertions are the point of this whole suite. A dashboard that
 * shows "$0.00" before anything is imported is not empty - it is wrong, and it
 * is wrong in the exact way the project claims not to be.
 */
export function emptyStateChecks(): UiCheck[] {
  const noMisleadingZeros: Assertion[] = [
    { kind: "absent", text: "$0.00", why: "Before an import there is no cost figure. Zero is a claim, not a blank." },
    { kind: "absent", text: "Low user", why: "Ranking someone before anything is imported is a verdict invented out of nothing. With no data the badge must read as an em dash." },
    { kind: "text", contains: "no band yet", why: "The badge must say why it is blank, rather than leaving an unexplained dash in the top bar." },
    { kind: "text", contains: "nothing imported yet", why: "The reason the page is empty must be stated." },
    { kind: "text", contains: "npm run run", why: "The next command must be on screen, not in the README." },
  ];

  /*
   * Observability readiness is deliberately not a GUIDED_PAGE - it reads
   * settings files off disk and has a real answer before anything is
   * imported - but it still has to be checked here. "Works on a fresh clone"
   * is a claim, and an unchecked claim is a wish: the page renders a different
   * branch when no project is known, and nothing else would exercise it.
   */
  const freshClone: UiCheck[] = [
    {
      name: "Observability readiness answers before anything is imported",
      path: "/observability",
      viewport: DESKTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        { kind: "absent", text: "nothing imported yet", why: "This page reads Claude Code's settings, which have nothing to do with whether transcripts were imported. Sending a new reader to run the importer would send them to fix the wrong thing." },
        { kind: "absent", text: "npm run run", why: "Same reason. The next command for someone on this page is a settings edit, not an import." },
        { kind: "visible", selector: "#repo-path", why: "With no transcripts there are no known projects to list, so the free-text box is the only way in. Without it the page is a dead end on exactly the machine it claims to work on." },
        { kind: "absent", text: "$0.00", why: "The house rule, checked here too: there is no cost on this page at all, and a currency figure appearing on an empty install would mean something coalesced a null." },
      ],
    },
    {
      name: "Observability readiness is usable on a phone with nothing imported",
      path: "/observability",
      viewport: PHONE,
      theme: "light",
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: "#repo-path", why: "The only way in on a fresh clone has to survive the narrowest viewport, or the page is unreachable for the reader who has done least." },
        { kind: "absent", text: "$0.00", why: "The house rule, on every empty-state check without exception: a currency figure on an install with nothing imported is a claim invented out of nothing." },
      ],
    },
    /*
     * The two rules meeting on one instrument.
     *
     * The empty run switches archiving off, so the archive was never asked and
     * has no answer. A pointer resting on NONE would be the panel showing a
     * reading nobody took - the same bug as "$0.00" before an import, drawn
     * instead of written, and invisible to every text assertion in this file.
     */
    {
      name: "Setup shows no reading it did not take",
      path: "/setup",
      viewport: LAPTOP,
      theme: "dark",
      assertions: [
        ...BASELINE,
        { kind: "visible", selector: ".knob-dead", why: "With archiving off the dials have no pointer at all. A knob resting on NONE would state a measured nothing, which is a different fact from not having measured." },
        { kind: "absent", text: "$0.00", why: "The house rule, checked here too: there is no cost figure on this page, so a currency figure would mean something coalesced a null." },
        { kind: "text", contains: "Archiving is off", why: "An instrument with no pointer must say why, or it reads as broken rather than as switched off." },
        /* Two lamps are guaranteed dark in this mode - the archive and the
           background import are both switched off by the empty run - which is
           why the assertion lives here. In populated mode it would depend on
           whether the reader happens to have an admin key set, and a check
           that passes for that reason says nothing about the page. */
        { kind: "visible", selector: ".lamp:not(.lamp-live) .lamp-detail", why: "A dark lamp has to say why it is dark on the page itself. A tooltip is not an answer on a phone, and most of this panel is optional extras." },
      ],
    },
  ];

  return [
    ...GUIDED_PAGES.flatMap((page): UiCheck[] => [
      {
        name: `${page.name} guides a new user`,
        path: page.path,
        viewport: DESKTOP,
        theme: "dark",
        assertions: [...BASELINE, ...noMisleadingZeros],
      },
      {
        name: `${page.name} guide on a phone`,
        path: page.path,
        viewport: PHONE,
        theme: "light",
        assertions: [...BASELINE, ...noMisleadingZeros],
      },
    ]),
    ...freshClone,
  ];
}
