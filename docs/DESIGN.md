# IND — Design

Product context, the constraints design works within, and the current visual direction.

Read alongside [PRODUCT.md](PRODUCT.md) for what we're building and why, and
[DECISIONS.md](DECISIONS.md) for the reasoning behind anything here marked settled.

## What IND is

A personal work-and-income tracker for people in the service industry. You log what you worked
and what you made, and it shows you your schedule, your income, where money is going, and roughly
what to set aside for tax.

It answers three questions: **When am I working? What did I work? How much did I actually make?**

Especially for people with tips, irregular schedules, overnight shifts, and more than one job.

## What IND is not

Worth stating early, because it rules out a lot of screens that would otherwise look reasonable:

Not payroll software. Not accounting software. Not tax-filing software. Not employer software.
No bank connection, no IRS connection, no employer reporting.

IND records what someone worked and made. It never calculates what an employer owes, never files
anything, and never claims to know someone's tax liability. See
[ADR-024](DECISIONS.md#adr-024).

## Who it's for, and when they use it

Not a desk. Not two hands. Not good light.

IND gets opened at 2am in a dim bar, in a car park, on a bus home, standing up, holding something
else, tired, wanting to be done. Every decision below follows from that. A design that is
beautiful in a screenshot and slow at 2am has failed.

Three consequences, up front:

- **Dark is the primary case**, not a preference. Blinding someone at closing time is a usability
  failure, not a style choice.
- **One-handed reach matters.** Primary actions live in the lower half of the screen. Nothing
  essential sits in a top corner.
- **The nightly path must be near-thoughtless.** If logging a shift takes real attention, people
  stop doing it — and an income record with gaps is worse than none, because it misleads.

## What's settled, and what's yours

| Settled — please design within these              | Yours — please own these                  |
| ------------------------------------------------- | ----------------------------------------- |
| The context above: dark-first, one-handed, fast   | Palette, including whether amber survives |
| Free vs Pro boundaries                            | Typography and type scale                 |
| Interaction model (below)                         | Layout, hierarchy, composition            |
| Honest-claims rules (below)                       | How a shift is visualised                 |
| Theming architecture — what can and can't animate | Motion, and where it's spent              |
| Accessibility floor                               | Iconography and illustration              |
| Platform-native conventions first                 | Empty states and first-run                |
| What IND is not                                   | The overall feel                          |

If something in the settled column looks wrong, say so — several of these have already changed
once. But they're decisions with consequences elsewhere in the system rather than open questions.

---

# Product constraints

## Free and Pro

**Free** is a complete tracker and requires no account and no sign-in of any kind: jobs, shifts,
hours, breaks, tips and tip-outs, per-shift earnings, effective hourly rate, week/month/year
totals, a calendar of completed shifts, job comparisons, basic insights, expenses, and
unrestricted export — all fully offline.

**Pro** adds cloud backup and cross-device sync, scheduling, the shift journal, and tax tools.

Design rules that follow:

- **A free user never encounters authentication.** There is no sign-in screen, no account, no
  "create an account" anywhere. Signing in appears only as a step inside turning on backup.
- **Free users must never hit a wall mid-task.** Pro surfaces are discoverable, never
  interruptive, and never block something already started.
- **Export is never gated**, never nagged about, and always complete.

## Interaction model

**One screen by default. Guided flows only where a question needs a reason attached.**

A guided one-question-per-screen flow earns its place when the answer needs explaining:

> **Does this job take taxes out of your pay?**
> This helps IND know which earnings to include in your set-aside target.

That's worth a screen. _"What's this job called?"_ is not — so **adding a job is a single screen**:
name, hourly rate, colour. Three fields across three screens is ceremony that makes a trivial
task feel long.

**Logging a shift is one screen**, arriving mostly pre-filled — last job used, work date from
when the shift started. The common case should be **confirming, not filling in**. This happens
five nights a week while tired; splitting it across screens would be faithful to a pattern and
fatal to the product. See [ADR-023](DECISIONS.md#adr-023).

### Input preferences

Prefer tappable rows, segmented controls, and sheets. **A dropdown is usually a signal that the
options deserve more room than a dropdown gives them** — but it's a strong preference, not a
prohibition. Use one where it's genuinely the clearest fit.

Dates and times use native pickers, where muscle memory already lives. Money gets a purpose-built
numeric entry rather than a text field and the system keyboard — amount entry is the most-used
control in the app and happens one-handed and tired, so it earns bigger targets.

### It shouldn't feel like a spreadsheet

Every competitor in this space is a spreadsheet with an app skin, and that's the register to
avoid.

The test isn't whether a screen contains rows — it's whether it feels like **data entry** or like
**seeing your work**. Lists and tables are fine where they're genuinely the clearest
representation; a list of shifts in a period is a list. What's forbidden is the feeling of a grid
you have to keep up with.

## Honest claims

Some words here are load-bearing. These aren't tone preferences — they're the difference between
a claim we can stand behind and one we can't.

**Backup.** "Never lose your records" is a **Pro** claim and may only appear there. Free records
live on one device and can be lost with it; nothing may imply otherwise.

**Sync is durability, not security.** Moving data to a server doesn't make it safer from
attackers, it makes it survive a lost phone. Say "never lose your records", not "keep your
records safe".

**Tax.** It is **"set aside"**, never "you owe", "your tax bill", or "your refund". The percentage
is the user's own choice and should read as theirs. IND never displays a refund or amount-owed
figure. Quarterly dates are informational, with a link out to the IRS — never a statement that a
payment is due.

**Earnings.** The wage figure is worked time × rate. It doesn't model overtime and will understate
for anyone who earns it. Don't label it in a way that implies it's what their paycheck will say.

## Theming architecture

Settled in [ADR-022](DECISIONS.md#adr-022). The part that affects design work:

Tokens come in two layers. **Chrome** — labels, separators, backgrounds, fills — resolves natively
through the OS, so light and dark switch with no redraw and Increase Contrast comes free.
**Content** — the money figure, any visualisation, charts, the accent — uses values we own.

The practical constraint: **anything that needs a gradient, a blend, or an animation has to be a
content colour.** Natively-resolved colours are opaque and can't be interpolated. So a
visualisation with a gradient works; a gradient built from system label colours does not.

**IND follows the system appearance. There is no in-app light/dark switch.** Both appearances need
to work; neither is an afterthought.

## Accessibility floor

Not polish. These ship with the first screen.

- **Dynamic Type**, including the hero figure. It must reflow, not clip or truncate.
- **VoiceOver** reads data, not decoration. Any shift visualisation carries a label with the real
  values: "Friday 14 March, six hours, eighty-two dollars in tips."
- **44pt minimum** on every target. Bigger for numeric entry, which gets used tired.
- **4.5:1 contrast minimum**, verified in both appearances.
- **Reduced motion** respected everywhere.
- Never colour alone to carry meaning — several of these people work with colleagues who share
  their phone screen, and colour-blindness is as common here as anywhere.

## Platform-native conventions first

IND ships on iOS and Android, and should feel native on both rather than like one design ported
to the other.

Follow **Apple's Human Interface Guidelines on iOS** and **Android's platform conventions on
Android**: navigation patterns, sheets and dialogs, back behaviour, typography defaults, date and
time pickers, share and system integrations. Where a platform has an opinion, it wins.

Two departures from stock are deliberate and shouldn't be "corrected" back:

- **Custom numeric entry for money**, rather than a text field and system keyboard. Apple does the
  same in Wallet and Apple Cash; the reasoning is one-handed use in bad light.
- **Guided one-question flows** for onboarding and tax setup. Not a stock pattern on either
  platform, but both have precedent in setup experiences.

Everything that looks non-standard beyond those — the accent, a hero figure, a custom
visualisation — is what platforms expect an app to bring itself.

## Data realities

Practical things worth designing against:

- Someone can have **several jobs**, each with its own rate and colour.
- A shift can carry **multiple tip amounts plus a tip-out** — what was taken in, and what was
  handed over. What someone actually kept is the difference.
- **Totals are per currency.** Someone who works across a border sees separate totals, never one
  merged number.
- **Two years of use is several hundred shifts.** Lists, calendars and insights need to work at
  that scale, not just with a demo dataset.
- Shifts **cross midnight routinely**, and the day a shift "belongs to" is the user's call.
- A shift may be **scheduled, worked, or cancelled** — see below.

---

# Screens and flows

## First use and empty states

The most important flow in the app, and the easiest to leave until last.

A new install has no jobs, no shifts, no history — so earnings, calendar and insights all have
nothing to show. Each needs a first-run state that **invites rather than apologises**, and the
path from install to first logged shift should be as short as it can honestly be.

Worth deciding: does someone create a job first, or can they log a shift and name the job on the
way through? The second is fewer steps but front-loads a decision.

## Logging a shift

The nightly ritual, and the screen that matters most. One surface, mostly pre-filled, with the
common case being confirmation. Job, date, times, break, tips in and tip-out.

## Earnings

What you made — tonight, this week, this month, this year. Wages and tips, and **effective hourly
including tips**, which is the number people can't compute in their heads and most want to know:
_was that shift worth it?_ It's also what makes comparing jobs meaningful.

## Jobs

One screen to add: name, hourly rate, colour. Everything else is optional and edited later.
Comparing jobs — hours, earnings, effective hourly — lives here or in insights.

## Calendar and scheduling — Pro

**A scheduled shift and a worked shift are the same object in two states.** They should read as
one thing at different stages, not two different entities in two different places.

The calendar shows completed and upcoming together. Free users see the same calendar with
completed shifts only — not a degraded version of a Pro screen, just a calendar of what happened.

Scheduling includes creating upcoming shifts, recurring shifts, editing and cancelling, and
reminders. It should not feel like a separate calendar product bolted onto a tracker.

## Scheduled → worked — Pro

The moment the whole scheduling feature exists for.

A reminder after a scheduled shift ends: **"How did tonight go?"** Tapping it opens the shift
_already there_, with the plan filled in — you add what actually happened: real end time, tips,
anything else.

It should feel like **completing** something, not creating something. The plan is shown and
corrected rather than re-entered.

## Journal and feeling — Pro

**Attached to a shift, never a separate journaling product.**

The note lives on the shift, where it's written. The journal view is a **lens over shifts** — a
way to read your notes back across time — not a new kind of content with its own timeline.

`feeling` is an optional 1–5 marker recorded beside the note. Optional means optional: never a
required step, never blocking the save, and never presented as mood tracking.

## Tax set-aside — Pro

Answers one question continuously: **how much of what I've made should I not spend?**

- A set-aside target that grows as shifts are logged — per shift, and year to date
- The user's own percentage, visibly theirs and editable
- Jobs that haven't been set up are **surfaced as needing setup**, not silently excluded from
  the total
- Optional informational reminders around the general quarterly dates, with a link out

Read the Honest claims section before designing any of this. The wording rules there are not
stylistic.

## Backup & sync — Pro

Where signing in appears, and the only place it does. Sells durability, in the words that section
allows.

States that need designing: not backed up; backed up and current; sync failing (non-blocking —
local records remain available); Pro lapsed (sync stopped, records and export untouched); and
signing in to an account with no records, which needs to ask before doing anything.

## Export

Free, complete, never gated. CSV and JSON through the system share sheet.

---

# Current visual direction

**Everything in this section is a proposal, not a requirement.** It exists so there's something
concrete to react to rather than a blank page. Replace any of it.

## The anti-spreadsheet idea: a night is a shape

The current signature concept, and the strongest answer we have to "don't feel like a
spreadsheet."

Each shift renders as a bar spanning the hours actually worked, weighted by what was earned. A
week becomes a horizon of shapes you can read at a glance — Friday was huge, Tuesday was dead —
without reading a single number.

The reasoning is worth keeping even if the execution changes: **a table makes you read; a shape
lets you see.** Whether it's bars, arcs, or something else entirely is yours.

If it survives, it needs a VoiceOver label carrying the real values — see the accessibility
floor.

## Palette

Proposed: a warm-biased dark ground with a single amber/brass accent — low bar light, brass
fittings, the colour of the room this app lives in. Deliberately not the fintech green or the
terracotta every finance app reaches for.

```
ground #12100E   raised #1C1917   hairline #2B2622
ink #F5F0E8      ink dim #9A9086
accent #F2A93B → #C4761E
light ground #FAF7F2
```

Neutrals are warm-biased toward the accent so the palette reads as one set rather than an accent
dropped onto stock grey. The accent is spent in one place: the money figure, the shift shapes, and
an on-shift indicator.

The hex values are a starting point. The amber is the boldest thing here and the first thing
worth arguing about.

## Typography

Proposed: system faces throughout, with **numerals set in the rounded system variant** (SF Pro
Rounded on iOS). Rounded figures read warm where the default reads like a ledger, and it costs
nothing in nativeness. Money always uses tabular figures so digits don't jitter as totals change.

One hero number per screen; everything else recedes.

## Motion

Proposed: one orchestrated moment rather than scattered effects — saving a shift counts the total
up with a single haptic. Everything else is standard platform transitions.

Reduced motion turns the count-up into an instant set. The haptic stays.

## Mockups

Four screens — Tonight, Log a shift, Add a job, Back up & sync — with the palette and the shift
shapes rendered live, plus an appearance toggle:

**https://claude.ai/code/artifact/9fb77b6d-a21c-4452-8b6f-0955480cd303**

**Starting material, explicitly not a spec.** Some of it predates decisions in this document —
the job-creation screen there still shows a guided flow, which is no longer how it works.

---

# Writing

Words are design material. The interface's vocabulary is how people learn their way around.

- **Name things by what people do.** "Back up & sync", never "create an account". "Log shift",
  never "Submit".
- **An action keeps its name through the whole flow.** The button that says "Log shift" produces
  "Shift logged."
- **Active voice, sentence case, plain verbs.** No filler, no cleverness. Specific beats clever.
- **Errors say what happened and what to do**, in the interface's voice. They don't apologise and
  they're never vague.
- **Empty states are invitations, not decoration.** "No shifts yet. Log your first one," with the
  action right there.

---

# Open questions

Things genuinely undecided, where a design answer would settle them:

- Does the amber survive? It's the boldest call in here and the cheapest to change now.
- Does "a night is a shape" hold up across a full week, a month, and someone with three jobs?
- What does a brand-new install look like on every screen that has nothing to show?
- How are Pro features indicated to a free user — discoverable without nagging, and without
  making the free app feel like a trial?
- Is there a first-run path that gets someone to a logged shift without creating a job first?
