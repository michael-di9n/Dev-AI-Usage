# 2. Reading the dashboard

Five pages. This is what every number on them means, and which ones to ignore.

---

## The usage band, under the cost on Trends

`Power user` on gold, `Medium user` on silver, `Low user` on bronze — or an em
dash. Hover it and it shows the figure it used, the window, and the two
thresholds.

It sits directly under the derived cost, because it is a reading of the same
work. It used to be in the top bar of all five pages, which put a thirty-day
volume rank beside the title of pages that are not about volume, and on Trends
put it above and apart from the one figure it is derived from.

The medal glyph and the word both carry the rank on their own. The three metals
sit at nearly the same brightness, so colour alone would be useless in
greyscale, in print, or to a reader with full colour-vision deficiency.

It ranks on **output tokens per active day** over the last 30 days. Output
because total tokens are about 98% cache reads, which cost a twelfth as much —
ranking on those would put anyone with a long session in the top band for
re-reading context they had already paid for. Per active day because a total
over a window rewards having been around longer, which is not usage. Days with
no sessions are left out rather than counted as zero.

Under 50,000 output tokens a day is low, 500,000 and above is power. **These are
a local heuristic, not an Anthropic tier or a quota.** Nothing in the app
behaves differently because of the band; it exists because a single large number
cannot tell you on its own whether it is a lot.

One active day is enough to band: the denominator is active days, so a window
holding one of them divides by one and the rate is what that day ran at — and
the tooltip says so, which is what stops a gold reading as "this is how you
work". Only a window with no active days, or one that generated nothing, shows
an em dash and `no band yet`, because neither has a rate to rank.

The window is fixed at 30 days and ignores the period filter above it, so the
band means the same thing whichever slice you are reading — and it still shows
when the selected period is empty, because an empty `today` says nothing about
the last thirty days. The band itself says three things and no more: the rank,
the figure it came from, and that window. Both thresholds and the active-day
count are in its tooltip.

---

## Trends — what you spent

### How current the figures are

Beside the session count, the top bar says when the importer last ran:
`imported 4 minutes ago`. While `npm run dev` is up the dashboard re-imports
every fifteen minutes by default, so a tab left open keeps moving. Past three
missed passes the age turns amber — not an error, since the importer can simply
be switched off, but a signal not to read "Today so far" as today.

`never` means the database has never been imported into, which is a different
state from old and reads differently on purpose.

### The period, and the bucket

One filter row, above everything it scopes: **Today**, **This week**, **This
month**, **Last 3 months**. Calendar-relative on purpose. "Last 30 days" is the
wrong question for work — on a Tuesday it quietly includes two weekends and half
of last month, so the figure moves for reasons that have nothing to do with what
you did. These reset when the calendar does.

The three-month view is the one rolling window, because "this quarter" is one day
long on the 1st of January.

Beside it, where the period is wide enough to make a difference, is the bucket
size: **by day**, **by week**, **by month**. It changes how the charts are
grouped, never what is counted — regroup a total and it stays the same total. A
single day offers no bucket choice, because one day bucketed by day is one dot.
Today is bucketed **by hour** instead: it is the only period whose chart shows
shape rather than a single total, and the only place a dead option would be
worse than none.

Every boundary is your local one. On UTC+10 a UTC day boundary would hide
everything before 10am and count last night as this morning — a quiet skew on a
daily total, and a plainly wrong axis on an hourly chart.

Both live in the URL, so a slice is shareable and works with JavaScript off.

### The hero, and today

The big figure is derived cost for the selected period. One hero per page, so
your eye has somewhere to land.

Beside it, **Today so far** is always today, whichever period is selected — the
"what is happening right now" number, which is the one you actually want when
you open this at 4pm.

Under both is a change against **the same elapsed span, one period earlier**, and
the figure it is a change *from*: `↑ ×92 vs $29.23 last month`. On the 3rd of the
month, "this month" is compared against the first three days of last month, not
against all of it — that comparison would invent a 90% collapse every time the
calendar turned over. Past ten-fold the change is shown as a multiplier (`×80`)
rather than a percentage, because `+7,851%` is arithmetically true and tells you
nothing you can picture.

The arrow is gold going up and bronze coming down. Metals rather than red and
green: spending more is not failing and spending less is not winning, and a
green "down" would be this tool telling you what to want. The glyph, not the
colour, is what carries the direction — the two metals sit at nearly the same
luminance on purpose.

### Which models spent it

Directly under the figure, a bar dividing it by model, and under that a row per
model: the mark, the name, **the dollars**, and the share. The dollars are the
point — a share with no base is a claim rather than evidence, and the rows add
up to the figure above them, so you can check it.

The bar is the same total, taken apart. It draws the three dearest models
individually and folds the rest into one slate segment, because four hues is as
many as separate cleanly; every model keeps its own row regardless, so nothing
is folded out of the reading, only out of the drawing.

Two things it will not do. A model the price table has no rate for shows an em
dash for its money and its share and draws no segment, and the caption then
says how many are in that state — pricing it at zero would say it was free. And
a share too small for one decimal reads `<0.1%`, never `0.0%`: a model that cost
$0.48 out of $9,137 is 0.005% of the money, and rounding that to zero is the
same false zero this tool exists to avoid.

A sliver gets a minimum width of 0.6% of the bar so it is visible at all, paid
for out of the largest segment. It is the one place the bar is not to scale, and
the exact figure is on the row beneath it either way.

A pie would be the obvious shape for this and is the wrong one. A real corpus
here runs 99% to a single model; as a circle that is a solid disc, and the
smallest arc a reader can see would draw twenty times the truth.

### The coins

Beside the figure, one gold coin for every **$100** of derived cost, stacked ten
to a column so a full column is $1,000. The same number with a size: `$2,463.11`
is precise and hard to feel, a pile you can count is not.

It rounds down, so the caption always says what did not fit — `26 coins · $100 a
coin · $82.25 beyond the last`. Past $10,000 the stack stops and says how many
coins it is not drawing, because a hundred coins is a wall rather than something
countable.

Three states that must never look alike: no cost figure at all draws no coins
and says so; a window you spent nothing in draws an outlined coin and says
`$0.00 so far`; and a window under $100 draws the same outline with the money
you did spend. The first is a gap, the other two are measurements.

### How you worked

On the right, badges describing the period **per active day**, not per window.
Twenty skill calls means one thing over two days and another over twenty, and a
total would quietly demote anyone who took a fortnight off.

| Badge | Measured on |
|---|---|
| Skill power user / Skill user / Occasional skills / No skills | `Skill` calls a day |
| Heavy delegator / Delegator / Occasional delegate / Works solo | `Agent` calls a day |
| Wide / Broad / Narrow toolkit | distinct tools reached for a day |
| Adaptive / Consistent | days you used more than one model |

The first three are ranks, so they wear gold, silver and bronze — more really is
more. The last is not: using one model all week is not the bronze version of
using four, it is a different way of working, and this tool has no view on which
is better. It stays a neutral colour for that reason.

Every badge carries the figure it came from underneath it, and the full
arithmetic — counts, denominator, and every threshold — in its tooltip. The
bands are rates per active day, so a one-day window divides by one and is
banded like any other: `Today` gets the same metals, and the tooltip says it
was one active day, which is what stops a gold reading as "this is how you
work".

All four badges are always there. A window that recorded nothing gets four
zeroes rather than a sentence where the chips would be — you used no skills
that day, which is a measurement. What such a badge does *not* print is a rate:
"0 a day" over no active days is 0 ÷ 0, so it reports the count and says in its
tooltip that there was no day to divide by.

### The tiles

**Output tokens** — everything the model wrote, including its thinking.

**Thinking share** — how much of that output was reasoning rather than answer.
Somewhere in the twenties is normal for real work. Much higher on mechanical
tasks means the effort level is set higher than the job needs.

**Cache read share** — **the most useful number on the page.** Reading from cache
costs about a twelfth of writing to it, so this being high is what keeps your
bill down. Above 95% is healthy. If it starts sliding, something is making your
sessions rebuild context they already paid for.

**Days with data** — how much history you have. Below about ten days, treat every
trend as noise.

**Days with data** — how many days in the period had a session on them.

**Messages** — how many messages, over how many sessions.

### The charts

Cost, output tokens and cache reads, bucketed as you chose. Look for steps, not
wiggles. A step usually maps to something real: a new project, a different model,
a change in how you work.

Each chart labels only its peak and its last point — a number on every point is
chaos and goes unread. Hover anywhere for a single bucket; the crosshair snaps to
the nearest one, so you aim at a date rather than at a 2px line.

A chart is always drawn. A period with nothing in it is the frame with its line
along the floor, because that is what an empty window measured, and no case
withholds the axes to tell you the sample is small.

Where the period holds fewer than **seven** buckets, the chart pads backwards
to seven so a lone point has something to be read against. Those extra buckets
are real, and they are from before the period, so they are drawn muted to the
left of a divider and the line under the chart counts them. Everything else on
the page — the cost, the tiles, the badges — is still the period alone, so the
chart's own table will not add up to the figure above it, and that is why the
padding is marked rather than blended in. The lookback is bounded to seven
buckets before the window starts, so an hourly chart cannot reach back three
weeks for its seventh point.

Every chart also carries **all its values as a table**, collapsed underneath. The
hover layer only ever enhances: on a touch screen, with a keyboard, or through a
screen reader, nothing is out of reach.

### By project

Which repositories cost what. The useful comparison is **cost against lines
changed**, not cost alone — a project that is genuinely harder should cost more.

### Tool mix

Which tools ran, how often, and how often they failed. A double-digit failure
rate on a tool you use constantly is worth a look; that is usually a missing
script or an unclear instruction, not a model problem.

Average duration is blank until you do
[exercise 02](../exercises/02-register-hooks.md). Nothing else can measure it.

### Second opinion

Your derived cost beside the figure Claude Code recorded for itself.

**They will not match, and neither is broken.** Claude Code's number resets when
you resume a session, only counts the main conversation, and uses its own token
accounting. Ours adds up every message in the file, subagents included. Both are
shown because seeing two numbers is more honest than picking one and hiding the
other.

---

## Observability — what unlocks the trace

**Observability** and **Trace** are what is left of a group of four.
Hooks and Telemetry were separate tabs, and between them they held the settings
advice for seven environment variables and one handler — which meant the page
that found the gap could not close it. Their advice is on the Observability page
now, one panel per setting, on the node that owns it.

The page says how far along you are, and nothing else until you ask. The
requirements are a pipe, each one a vessel with water in it: full when the
setting is right, part-full and in the fault colour when it is set to something
that breaks, empty when it is not set at all. Under every vessel is its name and
its state — and for a wrong one, the value itself, so `wrong: console` says why
without opening anything.

**Every vessel is a link, and opens a panel.** Clicking one unrolls a scroll at
the foot of the diagram: what the setting is for, what it was actually found set
to and in which file, the exact line to add and where to put it, what reaching
that tier buys, and how much has arrived because of it. One is open at a time
and the open one is in the address bar, so a node can be linked to and a reload
comes back to it. No JavaScript is involved — it is the `:target` selector.

The water stops at the first thing that is not set, so the gap is a position you
can see rather than a line you have to find, and the terminus is the trace
itself, which fills when the run is unbroken. Each tier's caption links to the
first requirement it is missing.

**The terminus opens the line itself.** It is the one vessel that does not lead
to settings advice: clicking `Trace` opens a terminal onto the receiver — how
many events, metric points and spans have arrived, from how many sessions, when
the last one was heard, and then the last forty records with their attributes,
newest first. Every record is a line, whichever of the three streams it came
down, and each line says which in a word — `log`, `metric`, `span` — and then in
a colour: green, amber, sky. The colour means which table the row came out of
and nothing else. Three switches under the title bar turn a stream off and on,
because a metric export lands ten to thirty points at once and would otherwise
drown the events; the choice is remembered, and the last stream on cannot be
switched off. The attributes that are the same on every record — the machine,
the account, the correlation ids — are dropped, and the ones a reader turned a
setting on to see — the prompt, the reply, `tool_parameters`, `tool_input` —
are printed first, so the four per row are the ones about the work. Anything
cut is counted at the end of the row rather than dropped in silence. If nothing
has ever arrived it says so as a sign, and names the variable that would fill
it; if something has arrived but nothing on the streams switched on, it says
that instead and names the streams that are off, because a receiver holding
forty thousand metric points is not a receiver that has heard nothing.

**What your settings say and what the receiver has heard are two questions, and
the page answers both — separately.** The last line of a node's panel counts
what has actually arrived because of that setting, named for that setting and
no other. The two readings can disagree, and the disagreement is the point:
OpenTelemetry reads its variables when a session launches and never backfills,
so a machine you configured correctly a minute ago is right and silent until the
next session starts. A page that only read the settings file would call that
success; one that merged the two would call it failure.

| Tier | What it needs | What it buys |
|---|---|---|
| 1 | The telemetry switch, the metrics and logs exporters, the wire format, the endpoint | Cost, token and active-time metrics, and the events behind Trends |
| 2 | The traces exporter, and the enhanced-telemetry beta flag | Trace gets real durations instead of em dashes |
| 3 | A PostToolUse hook running `bin/hook-spool.mjs` | Per-tool wall-clock |

**The content settings are drawn as a branch under the run, and are never
counted.** A pipe drops out of the run where tier 1 ends and feeds a manifold
below it, with `OTEL_LOG_USER_PROMPTS`, `OTEL_LOG_ASSISTANT_RESPONSES`,
`OTEL_LOG_TOOL_DETAILS` and `OTEL_LOG_TOOL_CONTENT` hanging off it and a
terminus of its own on the end. The drop is where it is because it is a rule:
the words are attributes on the events, so nothing here travels until
everything that makes an event is set. Every length of that manifold is wet or
dry together, unlike the run above — these four do not depend on each other,
and a pipe that dried up at the first unset one would say they did.

**Its terminus is the whole of what turning them on influences.** `Words` reads
`text arrives` once tier 1 is complete and at least one of the four is set —
either alone sends nothing — and `text stays redacted` otherwise. Each of the
four vouches for itself with the attribute it adds: `prompt` and `response` on
the two text events, `tool_parameters` on tool events for
`OTEL_LOG_TOOL_DETAILS`, `tool_input` and `tool_output` on tool events for
`OTEL_LOG_TOOL_CONTENT`. Those two are also carried on span events, which this
receiver does not read, so their counts can only ever be low, never high.
Nothing else on the page moves: no band, no tier count, no figure anywhere in
the app. On
this machine the four are redundant, because the transcript already holds every
prompt, reply and tool argument in full and these copy a 60 KB-capped subset
into a second store nothing here reads. Pointed at an agent on another machine
they are the only record there is: the receiver takes OTLP from any host that
can reach the port, and a session with no transcript on this disk arrives with
`prompt` and `response` set to `<REDACTED>`. They used to be listed as settings
to remove, which was an answer that only held for one of those two deployments.

**Every vessel says what it is on hover, and the whole of it when clicked.**
The hover note is a preview: the name, the state, what the setting does, and
the exact line to add — `"OTEL_LOGS_EXPORTER": "otlp"`, not just the name of
the variable, because a reader with the name still has to guess the value and
`otlp` versus `console` is the commonest way this page ends up saying "wrong".
The hook is the one vessel with no line to quote, since it is a command with a
matcher, so it names its settings key instead. None of it is the only place
anything is said: the two words under each vessel carry the name and the state,
and the panel carries the file, the line and what has arrived.

**A set vessel fills by how much has arrived, and never below the murk.** Every
vessel that is set, and both termini, read their water line off one rule: 40%
with nothing yet received — set, and waiting for the next session to start —
climbing by the order of magnitude to 76% at ten thousand records, where the
crest still fits inside the circle. By decades rather than by count, because a
reader comparing two vessels by eye can tell ten from a thousand and cannot tell
three hundred from four hundred. The rule is one function, so Args and Output
sit at the same rule as Prompts and Replies beside them; two of the four used to
have no count behind them and took the stylesheet's flat fill instead, which
drew the two vessels with the least evidence as the two brimming ones.

**A vessel the water has not reached holds murk, not nothing.** Dead water, a
near-neutral slate, a fifth to a third of the way up, sloshing at a quarter of
the speed of the live stuff. An empty circle used to say "not set" by leaving
the shape blank, which is also what a vessel looks like while the page is still
loading or when a browser has dropped the stylesheet — and the state that reads
as an accident is the one worth drawing. The murk sits far enough from the
accent to separate in greyscale as well as in colour, and it is still never the
only channel: the water line is lower, the border is unlit, and the tag
underneath says `not set` in words.

**In-depth tracing is on once tiers 1 and 2 are complete.** They are the run.
Tier 3 is a riser coming up into the same terminus, not a length of the line.
The PostToolUse hook feeds durations to Trace whether or not a single OTEL
variable is set. Putting it in the line would draw a dependency that does not
exist. It is the one thing here that is pumped in rather than running downhill.
Its caption prints no count: a tier of one, beside a vessel already saying
`not set`, does not need "0 of 1" as well.

**Where one tier ends is said by the caption under it, and only there.** A
drifting wavy mark in the tier's metal used to run under its vessels as well,
on the theory that the boundary should be visible without looking away. Three
squiggles under a row of circles read as barriers chopping the run into
sections instead — the opposite of what a single unbroken line is drawn to
say — so they are gone. The captions span the same columns, and each names
and counts its tier.

**Configured is not the same as working, and the page says both.** OpenTelemetry
reads its variables when a session launches and never backfills, so a machine
you configured two minutes ago has received nothing and is not broken. The band
is what your settings say; the panel underneath is what actually arrived.

**If a variable says "not set" and you are certain you set it,** look at the box
above the diagram. It names the user-scope file that answered and why — when
`CLAUDE_CONFIG_DIR` is set, that is the file inside it, and every verdict below
comes from there. A full and plausible `~/.claude/settings.json` often exists too.
The same box says so. It is valid, `jq` parses it, and neither this page nor
Claude Code loads it. "Which of the two did I edit" is usually the whole
question. The box offers that file as one click, and a path box for a file kept
anywhere else. Whatever you choose is remembered.

It is a typed path rather than a file chooser. That is a browser limitation,
not a preference. A file input hands over a file's contents and deliberately
not its location, so a chooser could not name the file to read on the next page
load. A choice that does not survive the page is not a setting.

---

## Trace — one project's runs, and one of them step by step

Scoped by the project picker at the top. That is the same choice AI maturity
and Observability make, so the app has one current project rather than two, and it
survives leaving the tab. It is the only control above the list now: the time
window that used to sit beside it has moved into the list's own **Ended**
column, where what it filters is obvious. Above the list it looked like it
narrowed the list and did not — it scoped a chart that no longer exists.

**Recorded runs**, down the left, are that project's runs, headed by four
columns: the trace id, the time each ended, what it cost, and how many tools it
called. The id is the handle — it is what the export is named after and what a
bug report quotes. The time is how you recognise which run it was. Cost and tool
calls are the two that answer the question the list exists for, which is which
run to open; before they were on every row it could only be answered by opening
each one in turn. The rows print themselves in on arrival, one line at a time,
the way the tree's rows do. Only on arrival: choosing a run or re-sorting
reorders rows that are already there, so nothing replays under a reader using
the list. Past the first screenful the stagger stops growing. A project with
four hundred runs should not take twelve seconds to appear.

Both are drawn as marks you can count as well as printed as figures. One mark is
under the first threshold, two is between them, three is at or above the second,
and clicking the sliders in either heading opens the thresholds and changes them
— they are yours, stored, and default to $10 and $50 for cost and 10 and 50 for
tool calls, all four read off a real corpus rather than chosen. Three states,
three pictures: a run with no cost figure at all shows an em dash and no marks, a
run that genuinely cost nothing shows the figure and no marks, and everything
else shows one, two or three.

The sliders in the **Ended** heading filter the list by date. Four presets —
last day, week, month, or all time — are one click, and two date boxes under
them take an exact range for the questions a rolling window cannot ask: one
week in March, everything before a release, the single day something went
wrong. Both ends are optional and both count as whole days, so the same date in
both boxes means that day. A range this build cannot read, or one that ends
before it starts, shows every run rather than none: a filter that fails open
shows you rows you did not ask for, which you can see, and one that fails
closed hides rows, which you cannot. While a filter is on, the count above the
rows reads "8 of 23" and names the range — a filtered list that does not say so
lets you count what is on screen and believe it is everything.

Clicking a column heading sorts by it — again by it reverses the direction, and
a run with no cost figure sorts last in both directions, because a missing
number is not a small one. The caret at the top right puts the whole list away
when the tree needs the screen; the count of runs stays whichever state it is
in, so collapsing never looks like losing them. The sort, the thresholds and
whether the list is open all survive leaving the tab.

**The run** draws as a nested tree on a terminal surface — the prompt, each
model turn under it, each tool call under that with the arguments it was really
given, and the result under that again. Every row starts shut. What you arrive at is
the run's prompts in order and nothing else, and a click opens one onto the
turn it caused. It used to open the first two levels, because a closed tree is
a page with six lines on it. That argument lost its premise when the path strip
arrived: the shape of the run is drawn under the tree now, so the tree no
longer has to be the thing that shows it.

Two export links sit on the heading line. **Export this run** writes the run on
screen as one structured document — it always did, but beside a list of five
hundred runs a button reading only "Export JSON" did not say which one it
meant. **Export all** writes every run the page is currently offering: this
project, narrowed by the date filter on the **Ended** column. The file records
what that scope was, because the same button gives a different file depending
on it, and nothing inside would otherwise say which. It is written a run at a
time as it downloads rather than assembled in memory first, so a project of
five hundred runs does not have to fit in one.

The rows print themselves in, one line at a time, the way a terminal fills.
Clicking anywhere in the panel jumps to the end. That includes the click that
opens a row, which is the first thing anybody does, so it is never something to
sit through. It replays whenever a different run is chosen. Ask your system for
reduced motion and it does not happen at all — every row is simply there.

The figures in the cost chips arrive the same way, as blocks of green that
resolve into their own colours — and they start as blocks, rather than showing
the finished figure and then taking it away to decode it. The label under each
one is real from the first frame. The server rendered the figure itself. With
scripting off or motion reduced, every number is simply there. Nothing here
ever waits on an animation to become readable.

Above the tree sits that run's cost as a bar split into input, cache read,
cache write and output, and under the bar the chips that read it: the total
first, then the four classes it divides into, then the tool calls. Each segment
is those tokens priced on their own by the same calculator that priced the
whole, so the parts add up to the total by construction rather than by a second
multiplication that could drift from it. Each chip carries its class's own
glyph, its rim and its figure in that class's colour — the shape is still what
tells the four apart, because the four hues are near enough in lightness that
colour alone would not, but the row is no longer six identical grey pills with
the encoding hidden in a 14px icon. The chips use a slightly different set of
values from the bar: `--ink-*` rather than `--mix-*`. A figure is text and owes
the 4.5:1 contrast floor. A segment is a graphic and owes 3. One of the four
does not clear the text floor on the surface a chip wears. Each ink stays within
a measured distance of its segment, so a chip can still be matched to its slice
by eye.
Hovering one gives the token count, the share and what that class actually is.

Tool calls are counted beside the money and deliberately not in it: a tool call
is never billed directly, and what it costs is the input tokens its result
becomes on the next turn, which are already in the input segment. Counting it
as a slice would be the same money twice.

These used to be two things — a row of four bare figures here, and a whole
section further down repeating the four classes under a heading. One object in
the place the reader is already looking beats two that have to be checked
against each other.

### The path — the run as one line

Under the tree, the same run is drawn as a strip of steps:
you, then whatever it reached for, in the order it reached for it. It exists
because the tree is complete and, for that reason, cannot be read at a glance —
a long run spreads its shape over more rows than anybody scrolls, so the tree
answers "what was sent to Bash on line 3,000" and not "what did this run do".

Five kinds of step, and the legend under the strip names the ones this run
actually used rather than all five. A prompt is one step; a built-in tool, an
MCP tool, a skill and a subagent are the four kinds of doing. The distinction
worth having is the tool against the MCP server: the transcript records both
identically, and one of them crossed a connection to a server somebody else is
running.

Each kind has its own colour — violet, blue, bronze, green, rose — on the
glyph and the chip's edge, never on the label, which stays ink. The five were
searched rather than picked, against four gates at once: none reads grey, every
one of the ten pairs separates for a reader with full colour vision, every pair
still separates under simulated red-green colour blindness, and each clears the
contrast floor on the surface it sits on. The red-green pair is the one that
costs — on hue alone it collapses to nothing under deuteranopia, so the green
and the rose differ in lightness too. `tests/styles.test.ts` measures all of
it, and the legend under the strip names the kinds the run used, so colour is
never the only channel.

A run of the same call folds into one step with a count — `Bash ×12`. Only a
consecutive run: twelve Bash calls with a Read between each pair are a
different thing, and folding those would draw a path the run did not take. One
prompt never folds into the prompt before it, whatever else does, because a
turn boundary is what divides the run into turns.

**The strip counts the whole run and the tree below it does not.** A long run
shows "500 of 5,082 rows" over the tree and, on the same screen, "40 of 203
steps" over the strip — those are two different denominators and the caption
says so. The strip is built before the tree is capped, deliberately: a summary
of the first 500 rows would be a summary of the scroll position.

Pointing at a step opens a card that follows the cursor. It carries what the
chip has no room for: which MCP server, which skill and its arguments, how long
the step took and which source timed it, and the first few lines of what was
actually sent. Near the right or bottom edge it flips to the other side of the
pointer rather than hanging off the page.

Hovering follows the cursor. Tabbing to a step places the card against that
step's own chip, since a keyboard has no cursor to follow. The step's name and
its count stay printed on the chip, never hidden in the card: a fact reachable
only by hovering is a fact a phone does not have.

**Clicking a step opens a window**, which grows out of the chip you clicked.
The card is a peek and clamps the argument to three lines; the window is where
the whole of it fits, along with every fact, the step's place in the run and
when it started. Escape, the backdrop and the Close button all dismiss it. On
a touch screen this is the only way in, which is the other reason the click
opens something substantial rather than pinning a tooltip.

**+40 more** draws the next batch of steps, and they attach to the strip one
after another rather than the whole thing redrawing. **Back to the first 40**
is the way out — the budget is stored, so without it a reader who expanded a
203-step strip once would carry seven rows of chips into every later visit.
The strip is expanded a batch at a time rather than sent whole because of what
a step carries: the largest run here reaches around eleven thousand steps and
5.6MB of arguments between them, which is the same document-size mistake the
tree's row cap exists to avoid.

**A step's duration is a dash unless every call in it was measured.** A step of
twelve calls with nine timed has a sum available and refuses it, and the card
says "9 of 12 calls timed" instead: nine calls' worth of milliseconds printed
under the whole step's name is a smaller number wearing a bigger one's label.

Arguments are read out of each call as recorded — the skill's own name, the
subagent's type and what it was asked to do. Those bodies are capped, so a call
with a long prompt in it arrives as JSON that stops mid-string; the name is
usually still there in the text, because an `Agent` call writes its
`description` and `subagent_type` before its `prompt`, and it is read straight
out. When it genuinely is not there, the step keeps the tool's own name. A
nameless step is a worse answer than a named one and a better answer than an
invented one.

### Four things the tree will not tell you, and why

These used to be printed under every trace. They describe how the tool works
rather than anything about the run in front of you, so they live here now; the
rows that need a word carry it themselves.

**Durations are em dashes until you switch on a source that measures them.**
Nothing on this machine times a tool call by default. OpenTelemetry traces
measure them ([exercise 01](../exercises/01-enable-otel.md)) and the PostToolUse
hook measures tool time ([exercise 02](../exercises/02-register-hooks.md)).
Neither backfills, so runs recorded before you turn them on stay dashed. A zero
there would be a measurement nobody took.

**Thinking rows show a token count and no text.** Claude Code writes the
signature and blanks the body before the transcript is saved, in every version
this tool has seen. There is no source on this machine that has it. The row says
so when you open it.

**Long bodies are shown cut.** `DEV_AI_USAGE_TRACE_CHARS` sets how much of each
block is stored — 2000 characters by default, and `off` stores none. A cut row
prints how much of the true length you are seeing.

**A long run is drawn 500 rows at a time.** The tree shows the beginning of the
run and says how much it is holding back — `Showing the first 500 of 47,628
rows`. **Show 500 more** extends it and **Back to the first 500** undoes that,
and whichever you choose is remembered. Drawing every row of the longest run
here took 17 seconds and produced a 121MB page, almost all of it spent building
47,628 collapsible rows rather than reading the database, which answered in
150ms. Nothing is lost by the cap: **Export this run** always writes all of it,
and the two numbers on screen are what tell you there is more.

**The run list is not every session.** It is built from runs that actually have
captured text. Most of the sessions in the database came from transcripts Claude
Code has since expired, and offering one of those would offer a page guaranteed
to be empty.

## Telemetry — what OpenTelemetry is sending

Empty until you finish [exercise 01](../exercises/01-enable-otel.md), and it
says so rather than showing zeros.

**The four tiles** are counts of what the receiver has actually heard: log
records, metric points, distinct sessions, and the time of the last one. A zero
here is a real zero — the receiver is running, so "none arrived" is a
measurement. The last-record tile is the exception: it shows an em dash, because
"never" is not a time.

**The live feed** is the newest sixty events, newest first, the way a log
scrolls. Resource attributes that repeat on every line — service name, host,
session id — are hidden, because sixty copies of them bury the two fields that
actually differ. Toggle the refresh with the button in the top bar; it pauses
itself when the tab is hidden.

**Metrics** shows a total and the latest point for each name, because the two
shapes need different readings. A counter like `claude_code.token.usage` means
something summed. A gauge only means its most recent value. The page shows both
rather than guessing which a name is.

The endpoint printed on the empty state is this server's real address. It is not
always port 3000 — if another dev server already had it, Next moved this one,
and the exercise's copy-pasted endpoint would point at the wrong process.

---

## Hooks — what the hooks measured

Per-tool wall-clock exists in exactly one place: the `duration` field on the
`PostToolUse` hook payload. The transcript has no tool timing and OpenTelemetry
times the API request rather than the tool. So two panels here need
[exercise 02](../exercises/02-register-hooks.md) and two do not, and the page
says which.

**Calls timed** is the coverage figure. It is an em dash before the hooks are
registered, not `0%` — "no durations recorded" and "none of your calls were
slow" are different claims.

**Slowest tools** ranks by total time, not by p90. A tool that takes twenty
seconds and runs twice costs you less than one that takes two seconds and runs
four hundred times. p90 is there because one slow outlier hides behind a mean.
It is a nearest-rank percentile, so every figure shown is a duration that
actually happened.

**Hook events** covers all five hooks the exercise registers, not just the timed
one. A `PermissionDenied` that keeps recurring is a permission entry you have
not added yet. A `PreCompact` is a context blowout, with the cost of the turns
leading into it sitting on the Trends page.

**Tool mix** and **Friction** are read from the transcript and work with no
hooks at all. Duration is the one column the hooks fill in.

---

## Setup — what is connected

Setup is the back of the machine rather than a page of settings. It is one
panel, and every figure on it is an instrument: a dial where the question is
"is that a lot", a counter window where the question is "how many", a lamp
where the question is "is it on". Under the panel sits a printed sheet with
the paths, because those are a parts list and not a reading.

### The dials

Each dial points at none, low, medium or high, and the exact figure is in the
window beneath it. A band is a judgement, so the three numbers it was read off
are printed beside the bank:

| Dial | Reads | Bands |
|---|---|---|
| Transcripts kept | Files held, and the date the archive first saw one | low under 100, medium under 1,000, high above |
| **Gone from disk** | Files Claude Code has since expired. **The archive is the only copy of these.** | the same three |
| On disk | What the archive occupies, and the ratio against the originals | low under 10 MB, medium under 250 MB, high above |

Two tables and not three, on purpose. Files kept and files expired are both
counts, so they share one; bytes get their own because no shared threshold
could mean anything in both. `src/domain/console.ts` holds them.

**A dial with no pointer has not been measured.** With `DEV_AI_USAGE_ARCHIVE=off`
the archive was never asked, so the pointers come off and the windows show an
em dash. A pointer resting on none would say something different — that the
archive was asked and holds nothing — and that is a reading nobody took.

### The lamps

One per source, lit or unlit, with the state written beside it so the colour is
never the only channel. Under any dark lamp is the reason it is dark and, where
there is one, the exercise file that turns it on.

**`off` is a normal state.** Most of these are optional extras. The page exists
so that a missing number is always explained, and never rendered as a zero that
looks like an answer.

### The counter bank

Row counts, table by table, in odometer windows. They get the panel's other
instrument because a seven-figure number means nothing banded — "high" tells
you less than 3,405,221 does.

### Appearance

One palette, Tide, with a light and a dark version of every colour in it. The
only choice is which: light, dark, or follow-the-system. The button in the top
bar steps through the three if you would rather just keep clicking.

The choice lives in your browser's local storage. It is a preference, not data,
so it never reaches the server.

### The transcript archive

Claude Code expires its own transcripts on a schedule this tool does not
control. Everything else here reads them and stores a parse; when a file goes,
the parse stays, but any question nobody thought to ask can never be asked
again. The archive stores the bytes instead, compressed, so it can.

It runs when the dashboard starts and again on every import, and appends only
what is new — a pass over an unchanged corpus costs a `stat` per file.

It lives in `data/archive.db`, deliberately not in `data/usage.db`. That one is
derived and safe to delete at any time; this one is not, and keeping them in
separate files is what stops one piece of advice destroying the other.

Two commands make it something other than a write-only box:

```bash
npm run archive -- --verify          # decompress every chunk, check every hash
npm run archive -- --restore <dir>   # write the files back out, byte for byte
```

Measured on a 151MB corpus this stores 38.6MB, about 3.9x smaller, and grows by
roughly a megabyte a day of heavy use. `DEV_AI_USAGE_ARCHIVE=off` turns it off,
and the page then says so rather than showing zeros.

---

## Next

[3. Acting on a trend →](03-acting-on-trends.md)
