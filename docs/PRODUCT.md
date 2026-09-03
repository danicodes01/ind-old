# IND — Product

What we're building. The reasoning behind individual decisions lives in
[DECISIONS.md](DECISIONS.md); how it should look and behave is [DESIGN.md](DESIGN.md).

## What IND is

A personal work-and-income tracker for people who work in the service industry. You log what you
worked and what you made, and IND shows you your schedule, your income, where your money is
going, and roughly what to set aside for tax.

It answers three questions:

> **When am I working? What did I work? How much did I actually make?**

It's built for people with **tips, irregular schedules, overnight shifts, and more than one job** —
servers, bartenders, baristas, delivery riders, stylists. People who typically:

- work more than one job, often at different rates
- earn a large and variable share of their income in tips, some cash, some card
- work irregular and overnight shifts that don't line up with calendar days
- are frequently offline, standing up, or in a hurry when they need to record something

IND ships on **iOS and Android**.

## What IND is not

Not payroll software. Not accounting software. Not tax-filing software. Not employer software.
No bank connection, no IRS connection, no employer reporting.

IND records what someone worked and made. It never calculates what an employer owes, never files
anything, and never claims to know someone's tax liability. See
[ADR-024](DECISIONS.md#adr-024).

## How it's used

The rhythm matters more than the feature list.

You add your jobs once. After a shift — walking to the car, on the bus, standing in the back —
you log what you worked and what you made, in seconds. Later in the week you check what you've
earned, and whether the good nights were where you thought they were. If you're on Pro, next
week's shifts are already in the app, and after each one IND asks how it went so logging is
mostly confirming what was already planned.

Most days that's one interaction, tired, one-handed, at an hour when nobody wants to fill in a
form.

## Product principles

**1. Records are treated as irreplaceable.**
IND holds people's income records, often for years, and frequently the only copy. We never
corrupt a record, never silently drop one, never lose one to a migration, and never discard a
version to resolve a conflict.

Being exact about the limit: **without Pro, records exist only on the device.** If the phone is
lost, destroyed, or the app deleted, the records go with it. OS-level backup may incidentally
preserve them, but IND neither promises nor relies on that. What is unconditional is integrity
while the data is in our hands, and unrestricted export so no free user ever depends on us to
hold their own copy.

**2. It works with no signal.**
Logging a shift never depends on the network. The local database is the source of truth, not a
cache. Sync is an enhancement, never a prerequisite.

**3. Your data is yours, unconditionally.**
Full export — every row, CSV and JSON — is available to every user, free or paid, with no gate
and no nagging. We sell automation and convenience. We never hold records hostage.

**4. Honest claims only.**
Sync is a _durability_ feature, not a _security_ one. Moving data to a server doesn't make it
safer from attackers; it makes it survive a lost phone. Tax tools estimate a set-aside, never a
liability. For an app holding financial data, over-claiming is a liability of its own.

**5. No sign-up wall.**
First launch to first logged shift, in seconds, with no account. Utility apps lose most of their
users at a login screen, and you cannot earn the trust of someone who never got in.

## Free — track what happened

The complete tracker. No account, no sign-in, fully offline.

- **Multiple jobs**, each with its own hourly rate and colour
- **Log completed shifts** — date, start and end, breaks
- **Cash and card tips**, and a simple tip-out
- **Earnings per shift**, and **effective hourly rate including tips**
- **Week, month and year totals**
- **Calendar** of completed shifts
- **Job comparisons** — hours and earnings across jobs
- **Basic historical insights** — trends, best-earning days
- **Work expenses**
- **Export** — CSV and JSON, complete and unrestricted
- **Fully offline**, with no account of any kind

Two scope notes:

**Expenses are simple work expenses**, not bookkeeping. A date, an amount, a category, optionally
a job. Nothing that resembles accounting software.

**Insights are historical only.** They describe what already happened. There are **no goals and no
forecasting** anywhere in IND, now or planned.

## Pro — manage your working life

### Backup & sync

Cloud backup. Multiple devices. iPhone ↔ Android.

### Scheduling

IND has its own scheduling, rather than being a viewer for someone else's calendar
([ADR-025](DECISIONS.md#adr-025)).

- Create upcoming shifts
- Recurring shifts
- Edit and cancel
- Shift reminders
- One calendar showing upcoming and completed shifts together
- **Scheduled → worked:** after a scheduled shift, IND asks **"How did tonight go?"** Tapping
  opens the shift already filled in with what was planned — you add the actual end time, tips,
  and anything else, and it becomes a completed shift
- **Apple and Google Calendar integration**, layered on top of IND's own scheduling

### Shift journal

Notes you write on a shift, readable back across shifts, with an optional 1–5 marker for how it
went. It's part of a shift, not a separate journaling product.

### Tax tools

Answers one question: **how much of what I've made should I not spend?**

- **You choose your own set-aside percentage.** IND explains what the setting does and does not
  suggest a number.
- **Two factual questions per job** — does this job take taxes out of your pay, and are your tips
  already included in what's taken out.
- **Per-shift and year-to-date set-aside targets**, calculated as **included earnings × your
  percentage** — where the two settings above determine which earnings are included.
- **Jobs that haven't been set up are surfaced**, not silently excluded from the total.
- **Optional informational reminders** around the general quarterly dates, with a link to the IRS.

No tax liability calculation. No refund or amount-owed prediction. No deductions, credits,
brackets, or filing status. Nothing is filed and nothing is transmitted anywhere.

### When Pro lapses

Records are never deleted, locked, or held hostage. Everything already recorded — shifts,
schedules, notes, expenses, including everything created while on Pro — remains readable on the
device, and export stays free and complete.

Which Pro functionality becomes unavailable, and when, follows the entitlement rules. That
behaviour is not settled yet and will be decided deliberately rather than falling out of an
implementation detail.

## Why the split works

**Free is genuinely useful forever**, not a trial and not a crippled version. Someone can track
their whole working life in IND without ever paying, and the app is designed for that to be a
respectable outcome rather than a failure state.

**What Pro sells is continuity and tools around the tracker** — your records surviving a lost
phone, your schedule already in the app, your work notes available across shifts, and a running
tax set-aside target. Not access to your own data.

The line that keeps this fair is principle 3: **free users can always get everything out.** The
difference we charge for is _"we'll do this for you"_ versus _"pay or lose it."_ The first is a
product. The second, for an app holding years of someone's income history, earns exactly the
reviews it deserves.

## Identity and access

There are no user accounts in the way people usually mean. **Free use involves no authentication
at all** — no sign-up form, no email, no password, no verification, and no sign-in screen
anywhere in the app.

Authentication appears in exactly two places:

- **Turning on Pro backup** — Back up & sync → purchase → Continue with Apple or Google
- **Restoring on a new device** — restore your purchase, sign in, and your records come back

What that means in practice:

- Sign-in is **Apple or Google only**. No email, no password, ever
  ([ADR-018](DECISIONS.md#adr-018)).
- **Both can be attached to the same account**, so someone who signs in with Apple on an iPhone
  and Google on an Android phone doesn't end up with two separate histories
  ([ADR-020](DECISIONS.md#adr-020)).
- **Buying on one platform and signing in with the other provider works.** What you paid for and
  who you are are tracked separately ([ADR-021](DECISIONS.md#adr-021)).
- **Account deletion is available in the app**, and is clear about what it removes.

The internal account is an implementation detail and never presented as one — the app talks about
backing up, not about accounts ([ADR-019](DECISIONS.md#adr-019)).

## Open questions

- **Pricing shape** — subscription, one-time, or both. This audience is price-sensitive and
  seasonal.
- **Whether `IND` is the final name.** It sets the bundle identifier, currently
  `studio.mikanoko.ind` — trivial to change now, disruptive after a TestFlight build.
