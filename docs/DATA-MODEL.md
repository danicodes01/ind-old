# IND — Data Model

Covers the conventions every table follows, how money is represented, how time is represented,
and the entity model. The two representation sections are the important ones: money and time are
where a shift tracker actually goes wrong, and both are effectively impossible to change after
real data exists.

## Schema conventions

### Every syncable table carries these columns

| Column       | SQLite    | Postgres        | Purpose                                             |
| ------------ | --------- | --------------- | --------------------------------------------------- |
| `id`         | `TEXT PK` | `uuid PK`       | UUIDv7, generated on the client                     |
| `updated_at` | `INTEGER` | `timestamptz`   | **Server-assigned.** Epoch ms locally. LWW ordering |
| `deleted_at` | `INTEGER` | `timestamptz`   | Soft delete. `NULL` when live                       |
| `created_at` | `INTEGER` | `timestamptz`   | Informational only, never used for ordering         |
| `user_id`    | —         | `uuid NOT NULL` | **Postgres only.** Owner, for RLS                   |

And these **local-only** columns, which exist in SQLite and are never sent to the server:

| Column              | Purpose                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| `_sync_state`       | `local_only` \| `synced` \| `modified` — see below                            |
| `_base_updated_at`  | Server `updated_at` this device last saw for the row. `NULL` iff `local_only` |
| `_local_updated_at` | Device clock. Orders _local_ edits only. Never trusted remotely               |

These are present from the first migration. Sync ships in the initial product for Pro, so they
are in use immediately; for free users they sit at `local_only` and stay there. Either way,
retrofitting ordering and replication columns onto tables already holding real financial records
would be a genuinely risky migration, and there is no reason to take it.

### Local rows carry no user identity

`user_id` exists in Postgres, where RLS depends on it, and **nowhere in SQLite**.

An installation holds exactly one account's data, so a per-row owner would be the same value on
every row — carrying no information, meaningless while anonymous, and requiring a mass `UPDATE`
across the entire database at sign-in. It would also embed Supabase's notion of identity in the
middle of the financial model, which is precisely the coupling the port boundary exists to
prevent.

The server never trusts a client-supplied owner in any case: it derives `user_id` from the
verified JWT and rejects it from the payload. So the column is not merely redundant on the
device, it is unused on the wire.

Account identity is held once, in a singleton table:

```sql
CREATE TABLE local_account (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  remote_user_id TEXT,      -- NULL while anonymous
  linked_at      INTEGER
);
```

The sync engine is the only reader. Its other job is to be a guard: if the signed-in account
does not match `remote_user_id`, sync refuses to run rather than mixing two people's records.
See [ADR-016](DECISIONS.md#adr-016).

### Replication state, not a dirty flag

`_sync_state` distinguishes two facts a single boolean would conflate:

| State        | Meaning                                                                                 |
| ------------ | --------------------------------------------------------------------------------------- |
| `local_only` | Never replicated to any server. Every row a free user owns, and every newly created row |
| `synced`     | Replicated, and the local version matches what the server last returned                 |
| `modified`   | Replicated once, then edited locally                                                    |

The distinction matters because a free user's rows are not _pending_ anything. Nothing is
queued, nothing is retrying, nothing is stuck — those records simply live on one device, which
is the product working as designed. Calling that state "pending" for years would misdescribe
the system to anyone reading the schema, and would make any "changes waiting to sync" figure
meaningless.

It also makes the upgrade path fall out for free. `local_only` already means "needs upload," so
enabling sync requires no pass over the data to mark anything — the set to push is already
correct. Combined with identity living outside the rows, **signing in is a single-row metadata
write** rather than a rewrite of the entire database. See [ADR-017](DECISIONS.md#adr-017).

### UUIDv7 primary keys, not autoincrement

Rows are created offline on multiple devices, so the client must be able to mint an id that will
never collide with one minted elsewhere. Autoincrement integers cannot do this without a
server round-trip, which would defeat local-first.

UUIDv7 specifically, rather than v4, because it is **time-ordered**. That gives locality in
B-tree indexes on both SQLite and Postgres — inserts land at the end of the index rather than
scattering — which matters for a table that grows monotonically for years.

### Soft deletes

Deleting sets `deleted_at`. A `synced` row becomes `modified`; a `local_only` row stays
`local_only`. Rows are never hard-deleted by the application.

A hard delete cannot be synced: a row that is simply gone is indistinguishable from a row the
device has never seen, so the deletion would silently fail to propagate — and worse, the next
pull would resurrect it. Soft deletes make deletion an ordinary change like any other.

Purging is a separate, deliberate maintenance operation. See the purge window in
[SYNC.md](SYNC.md#the-purge-window).

### `updated_at` is server time, always

Device clocks are wrong. They are wrong by seconds routinely, by hours across timezone changes,
and occasionally by years when a battery dies. Any conflict-resolution scheme that orders by
device time will eventually let a device with a skewed clock silently overwrite good data.

So `updated_at` is assigned by Postgres (`now()`) and returned to the client on push. Devices
use `_local_updated_at` only to order their own pending edits before sending them.

## Money

### Integer minor units. Never floating point.

Every monetary value is stored as an integer count of minor units, alongside the currency it is
denominated in:

```
amount_minor  INTEGER   -- 1234 means 12.34 in a 2-exponent currency
currency      TEXT      -- ISO 4217, e.g. 'USD', 'GBP', 'JPY'
```

`0.1 + 0.2 !== 0.3` in IEEE 754, and that error compounds across a year of shift totals. IND's
whole purpose is telling someone what they actually earned, and people check that against cash
they physically counted — a total that is off by a few cents reads as the app being broken.
Floating-point money is not acceptable at any level of the stack: storage, arithmetic, or
transport.

The `Money` type in `domain/money` is the only way monetary values are represented in code.
There is no path where an amount exists as a bare `number`.

### The exponent is per-currency

Two decimal places is not universal. JPY and KRW have none; several currencies have three. The
minor-unit exponent is a property of the currency, resolved from a table in `domain/money`, and
never hardcoded as 100.

### Aggregation never crosses currencies

Someone working two jobs in two countries, or travelling, can hold rows in different
currencies. Summing them requires exchange rates, which requires a rate source, a rate date,
and a decision about which rate applies — none of which we have.

So totals are computed and displayed **per currency**. A mixed-currency period shows separate
totals rather than a single wrong number. Cross-currency conversion is out of scope until
there's a product answer for it.

## Time

The hardest part of the domain, and the most common source of quietly wrong numbers in shift
trackers.

### Three separate concepts, stored separately

```
started_at   INTEGER   -- epoch ms UTC. The instant work ACTUALLY began. NULL until worked.
ended_at     INTEGER   -- epoch ms UTC. The instant it ACTUALLY ended. NULL while in progress.
work_date    TEXT      -- 'YYYY-MM-DD'. The day this shift belongs to.
tz           TEXT      -- IANA zone, e.g. 'America/New_York'. Zone at time of work.
```

These cannot be derived from one another, which is exactly why all four are stored.

`started_at` and `ended_at` **always and only mean what actually happened**. A scheduled shift
carries its plan in the separate `scheduled_start_at` / `scheduled_end_at` pair and has null
actual times until it is worked; a shift logged directly has actual times and no plan; a
scheduled shift that gets worked carries both. Neither pair is ever overloaded to stand in for
the other, so any code reading `started_at` is reading a fact about the past.

**Instants** answer "how long did this take" and "did these overlap." They are unambiguous and
timezone-free.

**`work_date`** answers "which day's shift is this." It is **defaulted from the calendar date the
shift actually starts**, resolved in the shift's own zone, and then owned by the user.

It is stored rather than derived on read because the default is not always right and only the
person who worked it knows. Clock in at 8pm and out at 3am and the start date gives Saturday,
which is exactly what a bartender would call that night. Clock in at 12:30am for the tail of the
same night and the default gives Sunday, when they'd say Saturday. That is a one-tap correction
on a screen they are already on — and storing the answer means nothing silently recomputes it
later. Deriving it on every read would also break for split shifts, where two rows share a day
but not a start time.

**`tz`** is stored per shift, not per user, because people travel and relocate. Rendering a
February shift's start time requires the offset that applied _then and there_, not the one
that applies now. Storing the zone rather than the offset is what makes that possible — offsets
change, zones don't.

### Duration comes from instants, display comes from wall clock

This is the DST rule, and it has to be stated explicitly because the two answers genuinely
differ twice a year.

A shift from 11pm to 7am across the spring-forward boundary is **seven** hours of work, not
eight — an hour didn't exist. Across autumn's fall-back it's **nine**. Someone gets paid for
what actually elapsed.

So: duration is always `ended_at - started_at`, computed on instants. Wall-clock times are only
ever used for _display_, resolved through `tz`. Any code computing a duration by subtracting
local times is a bug, and `domain/time` is the only place duration arithmetic is written.

### Weeks start where the user says, once

`week_starts_on` is a single app-wide preference in `settings`, defaulted and editable.

It lives there rather than on a job because its only purpose is weekly reporting, and someone
with three jobs needs one boundary to total across them — three different week starts cannot be
summed into "this week." A per-job week start would only have been justified by overtime
calculation, which IND does not do.

## Entity model

### `jobs`

An employer or gig platform. Created with three things — **name, hourly rate, colour**. Everything
below that is optional and edited later.

```
name, color_token, currency
base_pay_minor          hourly rate. NULL for tips-only or commission work
withholds_tax           nullable. See Tax
tips_covered            nullable. See Tax
is_active, sort_order
```

There is no pay-period, overtime, or business-day configuration on a job. IND records what
someone actually worked and made; it does not model what an employer owes. Wage earnings are
**actual worked time × the job's rate** (or the shift's override), plus tips, minus tip-out.

That means the wage figure will understate for anyone genuinely earning overtime. This is
deliberate: computing overtime correctly needs daily thresholds, weekly thresholds and
jurisdiction rules, and it would produce a number that has to match a real pay stub. A figure
that disagrees with someone's actual pay is worse than no figure.

### `shifts`

One shift, scheduled or worked. Scheduling is a Pro feature; the free tier only ever creates
rows with `status = 'worked'`.

```
job_id

status                  'scheduled' | 'worked' | 'cancelled'

scheduled_start_at      the plan
scheduled_end_at
started_at              what actually happened. NULL until worked
ended_at                NULL while a shift is in progress

series_id               links shifts materialised from one recurring pattern

work_date, tz
break_minutes
pay_rate_minor_override the hourly rate for this shift, when it differs from the job's

tips_cash_minor
tips_card_minor
tips_other_minor
tip_out_minor           what was paid out. Subtract to get what was kept

note                    free text
feeling                 nullable 1–5

_external_event_id      LOCAL ONLY
_external_calendar      LOCAL ONLY
```

**Scheduled times always describe the plan; actual times always describe what happened.** Neither
pair is ever overloaded to mean the other. A shift scheduled and then worked carries both, which
is what lets the "How did tonight go?" flow open prefilled.

This also makes a whole class of bug structurally impossible: an earnings query that forgets to
filter on `status` finds no actual times on a scheduled shift, so there is nothing to
accidentally count as income.

**`pay_rate_minor_override` is an hourly rate, not a total.** It means "this shift was paid at
this rate per hour instead of the job's usual one" — a training rate, a holiday rate, a
different position covered for one night. Wage earnings are still worked time × whichever rate
applies.

It is explicitly **not** an override of calculated total wages, and **not** an overtime or
payroll mechanism. If IND's computed figure ever needs to be replaced with what someone was
actually paid, that is a different field and a deliberate design decision, not this one.

**Tips are columns rather than their own table.** A shift has cash tips, card tips, possibly
something else, and possibly a tip-out. That is four numbers, not a relation — and keeping them
on the row means the most common aggregate needs no join and sync carries fewer rows.

Tip-out is **a number the user types in**: what they handed over. There is no tip-pool
configuration and no allocation system.

**`series_id`** links shifts materialised from one recurring pattern. Recurrence creates real
rows rather than virtual events, so editing or cancelling one occurrence is an ordinary row edit
with no exception-rule machinery.

**`note` and `feeling`** are the shift journal. The note is free text; `feeling` is an optional
1–5 marker recorded alongside it. Reading them back across shifts is the Pro journal feature.

### `expenses`

Simple work-expense tracking. Not bookkeeping.

```
date        'YYYY-MM-DD'. A calendar day, not an instant
amount_minor, currency
category    nullable
job_id      nullable — not every expense belongs to one job
note        nullable
```

### `settings`

One row, ever. Device preferences and the tax configuration.

```
default_job_id
locale_override
week_starts_on           default 0 (Sunday). App-wide, for weekly totals
pro_entitlement_cached, pro_entitlement_checked_at

tax_enabled              default 0
set_aside_percent_bp     nullable — basis points, NULL until the user chooses
tax_reminders_enabled    default 0
```

### Local-only tables

`local_account`, `sync_state`, `sync_conflicts` — never replicated. See [SYNC.md](SYNC.md).

## Tax

A Pro feature, and the whole of it is one multiplication:

```
included earnings  ×  the user's chosen percentage  =  set-aside target
```

Shown per shift and year to date. Nothing else.

### What we ask, and what we don't

IND does not decide whether someone is W-2 or 1099, and makes no determination about the legal
tax status of anyone's income. It asks two factual questions per job, and **the answers decide
which earnings are included** in the calculation:

| Column          | Question                                              |
| --------------- | ----------------------------------------------------- |
| `withholds_tax` | "Does this job take taxes out of your pay?"           |
| `tips_covered`  | "Are your tips already included in what's taken out?" |

Both nullable, where **null means not answered**. What is included:

- **Wages** when `withholds_tax = 0`
- **Tips** when `withholds_tax = 0` or `tips_covered = 0`
- **Nothing**, if either field is null — that job is excluded and the UI says it needs setup

Mixed income needs no special handling, because these are properties of a job rather than of a
person. Someone serving on withheld wages three nights a week and driving for an app at weekends
gets the right answer without ever telling IND what they are.

### The percentage belongs to the user

`set_aside_percent_bp` ships empty. IND explains what the setting does and which income it
applies to; it does not suggest a number.

There is deliberately **no self-employment tax constant**. The 15.3% × 92.35% relationship is
real, but the Social Security wage base caps it, W-2 wages consume part of that base, and
Additional Medicare applies above a threshold — so the effective rate is not a universal
figure, and encoding one would make IND a partial tax engine that is wrong for exactly the
people with mixed income.

There is also **one percentage, not a federal and state split**, because splitting it would
imply we know what belongs in each. The copy notes that state and local taxes should be included
if they apply.

### Nothing is stored

Every tax figure is computed from jobs and shifts at read time. There is no tax ledger and no
record of what someone actually set aside — that would be a savings tracker needing
reconciliation, which is a different product.

One consequence to be explicit about: **changing the percentage recalculates every displayed
target, including past ones.** Set 25% in January and 30% in July, and January's figure moves.

That is intentional: the set-aside figure answers "using my current percentage, how much of this
income would I set aside?" It is not a historical record of what percentage was configured at the
time. Keeping rate history would make it one, at the cost of versioned settings and no benefit to
anyone.

### Estimated payment dates

For users with earnings included in the set-aside calculation, IND can show the general dates
federal estimated payments are due — around April 15, June 15, September 15 and January 15 —
with a link to the official IRS page. Informational only. It is never phrased as a determination that the user owes a payment,
and no date arithmetic is performed.

### What tax tools never do

No filing. No IRS connection. No refund or amount-owed prediction. No deductions, credits, or
filing status. No actual tax-liability calculation.

## Calendar integration

`_external_event_id` and `_external_calendar` link a shift to an event in the device's Apple or
Google calendar, so an imported event isn't imported twice and an exported shift can be updated
in place.

They are **local-only and never synced**. Apple's EventKit identifiers are local to a device's
own calendar store — an identifier from an iPhone means nothing on an iPad, and syncing them
would produce silent mismatches and duplicate imports. The same caution applies to Google
calendar ids, which are scoped to the calendar a particular device has connected.

IND's own scheduling model is the source of truth. External calendars are representations we
import from and export to, never the database.
