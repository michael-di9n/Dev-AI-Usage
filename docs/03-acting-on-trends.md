# 3. Acting on a trend

A dashboard nobody acts on is a waste of everyone's time. This is what to
actually do about each number that moves, in the order the changes pay off.

Everything here is read off the Trends page. Nothing on it is a grade — the
usage band under the cost figure included.

Pick the period that matches the question. "This week" for "how is this week
going", "Last 3 months" for anything you would call a trend.

---

## Start here: the two that pay for themselves

### Cache read share below about 90%

**What it means.** Your sessions are rebuilding context they already paid to
cache. A cache read costs roughly a twelfth of a cache write. That makes this
the single biggest lever on your bill.

**What causes it.** Usually one of three things. Very short sessions that never
get to reuse anything. Something changing early in the conversation on every
turn. Or files being re-read after edits.

**What to do.** Work in longer sessions on one task, rather than many short ones
on the same task. When you need a fresh start, start fresh deliberately instead
of restarting over and over.

**Where to look.** The cache-reads chart, under the cost chart. A read share
that falls while cost climbs is the shape worth chasing. Widen to three months
and bucket by week if the daily view is too noisy to read.

### A tool failing more than one call in ten

**What it means.** Every failure costs twice. Once for the attempt, and once for
the model reading the error and trying again.

**What to do.** The fix is almost always that the correct command is not written
down anywhere. Put it in `package.json` as a script, or in `CLAUDE.md` as a
line, and the failures stop.

**Where to look.** The failure-rate column in the tool mix table. Sort your
attention by calls times failure rate, not by rate alone — a tool used twice
that failed once is noise.

---

## Then: the slower signals

### Cost per day drifting up

Compare it against the output-tokens chart before doing anything. Cost rising
with output rising is just more work getting done. Cost rising while output
stays flat is the one to investigate, and cache read share is usually the
explanation.

### Thinking share climbing

Thinking is what makes the answer right on genuinely hard problems, so a high
share is not a fault. It is worth a look when it climbs on work you would
describe as mechanical. That usually means a task was posed as an open question
when it could have been posed as an instruction.

### One project dominating the by-project table

Expected when it is the project you are actually working on. Worth a look when
it is not — a project you touched twice should not lead on cost, and when it
does, it is usually a handful of very long sessions.

### Average tool duration

Blank until you finish [exercise 02](../exercises/02-register-hooks.md), because
nothing else on the machine records it. Once it fills in, the useful reading is
duration times calls: a slow tool you call once a week costs you nothing, and a
fast one you call four hundred times might.

---

## What not to do

**Do not read a single day as a trend.** The days-with-data tile says whether
there is enough to trend at all. Under ten days, there is not — which is why
"today" is a figure to act on, not a trend to read.

**Do not use derived cost as a bill.** It is list price times tokens. Use it to
compare one week against another, never to reconcile against an invoice.

**Do not reconcile the two cost figures.** The second-opinion table shows the
derived figure beside the one Claude Code recorded for itself. They count
different messages on purpose. A gap there is expected and is not a bug.

**Do not optimise a number you cannot explain.** If you cannot say what caused
it to move, the honest next step is another week of data.

---

## A rhythm that works

Once a week:

```bash
npm run run
```

Read the hero and the tiles. If cache read share dropped or a tool started
failing, fix that one thing. Then close the tab.

That is the whole practice. The value is in the one thing you change, not in
having looked.

---

## Next

[4. When something is wrong →](04-troubleshooting.md)
