# IND — Data Model

Covers the conventions every table follows, how money is represented, how time is represented,
and a provisional entity sketch. The two representation sections are the important ones: money
and time are where a shift tracker actually goes wrong, and both are effectively impossible to
change after real data exists.

## Schema conventions

### Every syncable table carries these columns, from migration 001

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

Why this is in migration 001 rather than added when sync ships: retrofitting ordering and
replication columns onto tables that already hold real financial records is a genuinely risky
migration, and the cost of including them now is a few columns that go unused for a while.
Sync-readiness is close to free on day one and expensive later.

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

Every monetary value is stored as two columns:

```
amount_minor  INTEGER   -- 1234 means 12.34 in a 2-exponent currency
currency      TEXT      -- ISO 4217, e.g. 'USD', 'GBP', 'JPY'
```

`0.1 + 0.2 !== 0.3` in IEEE 754, and that error compounds across a year of shift totals. For an
app whose whole purpose is telling someone what they earned, and whose output may end up on a
tax return, floating-point money is not acceptable at any level of the stack — storage,
arithmetic, or transport.

The `Money` type in `domain/money` is the only way monetary values are represented in code.
There is no path where an amount exists as a bare `number`.

### The exponent is per-currency

Two decimal places is not universal. JPY and KRW have none; several currencies have three. The
minor-unit exponent is a property of the currency, resolved from a table in `domain/money`, and
never hardcoded as 100.

### Division uses largest-remainder allocation

Splitting is common in this domain — tip pools, tip-outs to bar and bussers, a shared total
across a section. Naive division loses or invents cents.

Splitting 100 pennies three ways gives 33, 33, 34 — not 33.33 three times, and not 33 three
times with a penny evaporating. `domain/money` provides an `allocate()` that distributes the
remainder deterministically and **guarantees the parts sum exactly to the original**. That
invariant is a property test.

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
started_at   INTEGER   -- epoch ms UTC. An instant.
ended_at     INTEGER   -- epoch ms UTC. An instant. May be on the next calendar day.
work_date    TEXT      -- 'YYYY-MM-DD'. The business day this shift belongs to.
tz           TEXT      -- IANA zone, e.g. 'America/New_York'. Zone at time of work.
```

These cannot be derived from one another, which is exactly why all four are stored.

**Instants** answer "how long did this take" and "did these overlap." They are unambiguous and
timezone-free.

**`work_date`** answers "which day's shift is this," which is a _human_ concept, not a
derivable one. A bartender who clocks out at 3am universally considers that the previous
night's shift. Deriving the date from `started_at` breaks for split shifts; deriving it from
`ended_at` breaks for every overnight shift. It is entered or defaulted, then stored.

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

### Weeks and pay periods are per-job configuration

Overtime thresholds depend on where the week boundary falls, and that is a property of the
employer, not the user or the locale. Two jobs can disagree. Pay periods likewise — weekly,
biweekly, semi-monthly, monthly, each with its own anchor date.

These live on the job, and `domain/pay` evaluates against them. Hardcoding a Monday week start
or a calendar-month period would produce numbers that are wrong for a large share of users
without ever looking wrong.

## Provisional entity sketch

**Subject to product work.** Recorded so the conventions above have something concrete to
apply to; the shapes will change before implementation.

**`jobs`** — an employer or gig platform. Name, colour, currency, base pay rate, pay-period
configuration, week-start, overtime rules, tip-out rules, active flag.

**`shifts`** — one worked shift, belonging to a job. The four time columns above, break
duration, optional scheduled-vs-actual, note.

**`tip_entries`** — tips against a shift, split by kind (cash, card, pooled) because they are
taxed and reported differently and people track them separately. Amount and currency.

**`pay_periods`** — derived, materialised for reporting. Rebuildable from shifts, so it is a
cache rather than a source of truth, and is safe to drop and recompute.

**`user_settings`** — locale and display preferences, default job, entitlement cache.

Two things to note. `pay_periods` being derived means it must not be the only home for any
fact. And `tip_entries` is a separate table rather than columns on `shifts` because a single
shift can produce several tips of different kinds, and flattening that would force a schema
change the first time someone needs two.
