# IND — Sync Protocol Specification

Specifies how the local SQLite database reconciles with the remote server. Written against the
ports in `src/data/sync/ports.ts`; nothing here assumes Supabase.

## Assumptions

These are what make the design tractable, and they should be re-examined if any stops holding:

- **One user, no sharing.** One person owns the data and nobody else can read or write it. With
  Pro they may write from more than one device, so there genuinely can be two writers — but only
  ever the same person, and rarely at the same moment. It is the absence of _sharing_, not the
  presence of a single writer, that makes this tractable.
- **No collaborative editing.** No shared jobs, no team shifts, no merge semantics to invent.
- **Small rows, append-mostly.** A year of one person's shifts is a few hundred KB. Edits are
  overwhelmingly to recent rows.
- **Conflicts are rare and low-stakes**, so per-row last-write-wins is genuinely correct here
  rather than a shortcut — provided nothing is destroyed silently. See
  [Conflicts](#conflict-resolution).

**Non-goals:** real-time updates, partial/selective sync, operational transforms or CRDTs,
server-side computation. All are unnecessary at this data shape and each would cost real
complexity.

## What syncs

Three tables replicate: **`jobs`**, **`shifts`**, **`expenses`**.

Everything else is local-only and never leaves the device — `local_account`, `sync_state`,
`sync_conflicts`, `settings`, and the underscore-prefixed columns on syncable rows. See
[DATA-MODEL.md](DATA-MODEL.md).

## State

### Server (per row, in Postgres)

`id`, `user_id`, `updated_at`, `deleted_at`, plus domain columns.
`updated_at` is set by the server on every write and is the only ordering authority.

### Client (local-only, SQLite)

Per row: `_sync_state`, `_base_updated_at`, `_local_updated_at` — defined in
[DATA-MODEL.md](DATA-MODEL.md). Local rows carry **no** `user_id`; account identity lives once
in `local_account`.

Plus one bookkeeping table:

```sql
CREATE TABLE sync_state (
  table_name        TEXT PRIMARY KEY,
  cursor_updated_at INTEGER,  -- last pulled row's server updated_at
  cursor_id         TEXT,     -- last pulled row's id (tiebreak)
  last_pulled_at    INTEGER,  -- server clock at last successful pull
  last_pushed_at    INTEGER
);
```

And a table that exists so that principle 1 is never violated:

```sql
CREATE TABLE sync_conflicts (
  id           TEXT PRIMARY KEY,
  table_name   TEXT NOT NULL,
  row_id       TEXT NOT NULL,
  losing_json  TEXT NOT NULL,  -- the version that lost, verbatim
  detected_at  INTEGER NOT NULL
);
```

## The cursor

Pagination is **keyset on the tuple `(updated_at, id)`**, not an offset and not a bare
timestamp.

A bare `updated_at` high-water mark is subtly broken: if two rows share a timestamp and the page
boundary falls between them, advancing the cursor past that timestamp skips the second row
permanently. Including `id` as a tiebreaker makes the ordering total, so no row can hide in a
gap. Offset pagination is worse again — rows shift between pages as writes land mid-sync.

```
WHERE user_id = :uid
  AND (updated_at, id) > (:cursor_updated_at, :cursor_id)
ORDER BY updated_at, id
LIMIT :page_size          -- 500
```

The cursor advances only to the last row actually received and committed. An interrupted pull
resumes from where it stopped, and never re-reads more than one page.

## Pull

1. Request a page from the cursor. Soft-deleted rows are included — a deletion is a change like
   any other, and excluding them would prevent deletes from propagating.
2. For each incoming row `R`, find local row `L` and apply:

| Condition                                  | Action                                                                                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| no `L`                                     | Insert `R` as `synced`, `_base_updated_at = R.updated_at`. (Including if `R` is soft-deleted — the tombstone matters)                                |
| `L._sync_state = synced`                   | Overwrite `L` with `R`. The server is authoritative for clean rows                                                                                   |
| `L._sync_state = modified` or `local_only` | **Keep `L`.** Copy `R` into `sync_conflicts`; adopt `R.updated_at` as `L._base_updated_at` — this is the conflict policy, not bookkeeping. See below |

3. Commit the page and advance the cursor in the **same transaction**. A crash between the two
   would otherwise either lose rows or replay them.
4. Repeat until a page returns fewer rows than the limit.

### Why locally-changed rows are not overwritten — and why the base moves

If someone edits a shift on this phone and a copy arrives from the server, silently replacing what
they just typed is the single most user-hostile thing sync can do. So local content survives the
pull.

**Adopting `R.updated_at` as the new base is not bookkeeping — it is the conflict policy.** By
recording the version it has now seen, the row earns the right to overwrite it: the next push
carries a base that matches, so it succeeds. A locally changed row can only ever overwrite a
server version it has observed.

That single line is what makes the policy read-before-write last-write-wins rather than
first-writer-wins. See [Conflict resolution](#conflict-resolution).

## Push

1. Select rows where `_sync_state != 'synced'`, ordered by `_local_updated_at`, in batches of 500.
2. Send each row with its `_base_updated_at` — `null` for `local_only` rows, which the server
   treats as "must not already exist."
3. The server upserts by `id`, **conditional on the base matching** the stored `updated_at`. On
   match it writes the row, sets `updated_at = now()`, and returns the stored row. On mismatch
   it writes nothing and returns a conflict for that row.
4. The client applies each returned row, sets `_sync_state = 'synced'`, and stores the new
   `_base_updated_at`.
5. For each conflict returned: the server's version is written locally as `synced`, and the
   losing local version goes to `sync_conflicts`.

### Why optimistic concurrency rather than blind last-write-wins

Blind LWW would be simpler and would be _fine_ almost always, given one person editing from one
device at a time. The reason to spend a field on it: blind LWW cannot tell the difference between
a normal write and one device silently clobbering another's newer edit. Detection is what lets us keep the losing
version instead of destroying it, which is what principle 1 requires. The cost is one field on
the wire.

### Idempotency

Push is safe to retry at any point. It is an upsert keyed by a client-minted `id`, so a retry
after an ambiguous network failure either applies the same write again (identical result) or is
rejected as a conflict and reconciled. No request ids or dedup table needed.

## Conflict resolution

**Last write wins — but a write must be preceded by observing the version it overwrites.**

A locally changed row may overwrite the current server version only after it has _seen_ that
version and adopted it as its base. That is what the pull step does, and it is why the base check
on push then succeeds.

So optimistic concurrency is not choosing the winner. It is preventing a **blind** overwrite by a
device that has not seen current state. Once a device has pulled, it may overwrite — and in
practice **the device that completes a sync cycle last is the one whose version survives.**

That is good behaviour here rather than a compromise: sync runs on foreground, so the last device
to sync is almost always the last device the person actually used, which is almost always the
edit they meant to keep.

There is no special handling for deletes. A soft delete is an ordinary field change and the same
rules resolve it.

| Situation                                  | Resolution                                                 |
| ------------------------------------------ | ---------------------------------------------------------- |
| Clean local row, remote change             | Remote wins                                                |
| Locally-changed row, remote change on pull | Local content kept, remote version adopted as the new base |
| Push with matching base                    | Local wins; becomes the new server version                 |
| Push with stale base                       | Server wins; local version → `sync_conflicts`              |

The last row is now **rare**. Because pull refreshes the base of a locally changed row, a stale
base is only reachable when the server moves in the window _between_ this device's pull and its
push — a genuine race with another device. It is not the ordinary conflict path.

### Convergence

The delete/edit case is the one worth proving, because it is where an asymmetric rule looks
tempting. Both devices hold row `R`, synced at `T0`. Both go offline. **A edits** `R` to `X`;
**B deletes** `R`.

**Case 1 — A syncs first.**

1. A pushes `R=X` with `base=T0`. Server holds `T0`: match. Server writes `X`, stamps `T1`.
   A is `synced`, base `T1`.
2. B pulls, receives `X@T1`. B's row is `modified`, so B keeps its local delete and stashes the
   incoming version. B's base becomes `T1`.
3. B pushes its delete with `base=T1`. Server holds `T1`: match. Server writes the deletion,
   stamps `T2`. B is `synced`.
4. A pulls, receives the tombstone `@T2`. A is `synced`, so it accepts.

Final: **deleted**, on A, B, and the server.

**Case 2 — B syncs first.**

1. B pushes the delete with `base=T0`. Match. Server deletes, stamps `T1`. B is `synced`.
2. A pulls, receives the tombstone `@T1`. A's row is `modified`, so A keeps its edit and stashes
   the tombstone. A's base becomes `T1`.
3. A pushes `R=X` with `base=T1`. Match. Server writes `X` — undeleting the row — stamps `T2`.
4. B pulls, receives `X@T2`, accepts it.

Final: **row exists as `X`**, on A, B, and the server.

**Note what the two cases have in common.** In Case 1 the device that pushed first was A, and the
final state is B's. In Case 2 it was B, and the final state is A's. **In both orderings the device
that completes a sync cycle second is the one whose version survives** — because pulling refreshed
its base, which is precisely what licenses it to overwrite.

Both orders converge: every replica agrees, and no version was destroyed — the loser of each step
is in `sync_conflicts`. The outcome differs by ordering, which is inherent to last-write-wins and
acceptable here.

**It also terminates.** A row at `synced` is never pushed, so once editing stops, one further
cycle on each device brings every replica to the same version and the exchange ends. Continued
back-and-forth requires continued editing.

### Why the asymmetric delete rule was removed

An earlier draft specified "a local edit beats a remote delete, a local delete beats a remote
edit." Walking the two cases above shows the mechanism never consults such a rule — the base
check decides everything before delete-versus-edit reasoning could apply, and the pull-side
"keep local" step only defers. The rule described an intent the protocol did not implement.

Implementing it for real would require a re-push-as-undelete round trip, and would let a stale
edit on a forgotten device silently revive a record the user deliberately deleted. Since the
losing version is retained either way, first-writer-wins is simpler, has no special cases, and
is provably convergent. See [ADR-006](DECISIONS.md#adr-006).

## Deletes and the purge window

Soft-deleted rows are retained for **90 days**, then hard-deleted on the server and locally.

This creates one hazard that must be handled explicitly. A device that has not pulled for longer
than the purge window may hold rows whose tombstones have already been purged. Pulling
incrementally would leave those rows alive locally forever — and worse, push them back up,
resurrecting data the user deleted.

**Rule:** if `now - last_pulled_at > purge_window`, the client must not sync incrementally. It
performs a **full resync**: clear the cursor, pull the entire dataset, and reconcile against it,
treating any local `synced` row absent from the server as deleted. Rows that are `local_only` or
`modified` are preserved and pushed as usual.

## Lifecycle scenarios

### Anonymous use, then signing in

Every local row is already `local_only`, which already means "has never been replicated." So
linking an account writes **one row**: `local_account.remote_user_id`. No pass over the data, no
mass update, nothing to backfill.

The first sync then pushes everything that isn't `synced`, which is the ordinary push path in
ordinary batches — resumable and idempotent by construction. For a heavy user this may be a
large first upload, so it reports progress, but it needs no special-case code.

This is the payoff from keeping identity out of the rows and from `_sync_state` naming
replication rather than pendency. Both changes were made during foundation review; see
[ADR-016](DECISIONS.md#adr-016) and [ADR-017](DECISIONS.md#adr-017).

### New device

Sign in, then pull from an empty cursor. Ordinary pull, no special path.

### Signing out

Local data **stays on the device**. Sync stops; the local database is untouched;
`local_account.remote_user_id` is cleared. Rows keep their `_sync_state` and
`_base_updated_at`, so signing back into the same account resumes rather than re-uploading.

Deleting a signed-out user's local data would be destroying records they own, on a device they
control, over an identity change. There is a separate, explicit, confirmed "delete local data"
action for people who want it. Sign-out is not that action.

### A different account signs in on the same device

IND supports **one account per installation**. The sync engine compares the signed-in account to
`local_account.remote_user_id` and **refuses to sync on mismatch** rather than mixing two
people's financial records.

Identity linking ([ADR-020](DECISIONS.md#adr-020)) makes genuine mismatches rarer than they would
otherwise be: signing in with Google on a user who has already linked Google resolves to the
_same_ user id, so it is not a mismatch at all. What remains is a real second account — someone
else's phone, or a second identity that was never linked.

**There is no adoption path.** Local records are never moved into a different account, with or
without confirmation. The two safe exits are:

1. **Sign out and use the original account.** Non-destructive, and the right answer almost every
   time.
2. **Delete the local data and start fresh with this account.** Destructive, and requires explicit
   confirmation.

Adoption was considered and rejected. The failure it risks is the worst one this app has —
uploading one person's income records into another person's cloud account, irreversibly — and the
moment it would be offered is exactly when someone is confused about which account they are in.
Family devices, second Apple IDs and hand-me-down phones all produce this state.

If moving records between accounts is ever genuinely needed, it should be a deliberately designed
feature — most naturally export, sign in, import — and not a branch inside the sign-in flow.

### Signing in to an account with no records

Distinct from a mismatch, and easier to get wrong. When authentication succeeds but the server
returns nothing, the client cannot tell a genuine new user from someone who reached for the wrong
provider.

**Rule: do not push local rows until the user confirms.** Ask first — _"This sign-in has no
backup. If you have used a different sign-in before, try that one instead."_ Uploading
optimistically is what turns a recoverable wrong-provider tap into two divergent cloud histories,
and [ADR-020](DECISIONS.md#adr-020) does not support merging those.

### Losing Pro — sync behaviour

Scoped to sync only. What else Pro gating does or doesn't restrict is a product question and is
not settled here — see [PRODUCT.md](PRODUCT.md).

Sync stops. Local records are untouched and export stays available. Rows that change go to
`modified` and are simply not transmitted; they are sent if the subscription resumes. Nothing is
deleted locally or remotely.

## Entitlement gating

The engine checks for an active Pro entitlement before running. Free users write to exactly the
same local schema with the same bookkeeping columns — their rows stay `local_only`, which is an
accurate description of the state rather than a queue that never drains.

This is why the tier is a single boolean at one call site rather than a second code path: the
local database is unaware of tiers. It also means upgrading needs no migration and no marking
pass, because the set to push is already correct.

## Scheduling

| Trigger             | Behaviour                                    |
| ------------------- | -------------------------------------------- |
| App foreground      | Full cycle: pull, then push                  |
| App backgrounded    | Push                                         |
| Local write         | Push, debounced 5s, coalesced                |
| Network regained    | Full cycle                                   |
| Manual, in Settings | Full cycle, with visible progress and result |
| Periodic background | Optional optimisation — see below            |

Only one cycle runs at a time; overlapping triggers coalesce into the running cycle.

### What these triggers do and don't cover

They cover the ordinary case completely: a shift logged with a connection is replicated within
seconds, and one logged offline is replicated the moment connectivity returns or the app is next
opened or backgrounded.

**The gap is a shift logged offline where the app is never opened again before the device is
lost.** That record is not backed up. This should be stated honestly rather than described as
continuous backup.

**Periodic background execution does not reliably close that gap**, which is why it is an
optimisation and not something the promise rests on. iOS grants `BGAppRefreshTask` windows based
on usage patterns, so an app that has not been opened for a week receives few or none — it is
least reliable in precisely the situation where it would matter. Android is more permissive but
subject to Doze and vendor battery management.

Adding it later narrows the window. It does not change what we can honestly claim.

## Errors and retry

| Class            | Examples                            | Handling                                                 |
| ---------------- | ----------------------------------- | -------------------------------------------------------- |
| Transient        | Offline, timeout, 5xx               | Exponential backoff with jitter, cap 5 min. Silent       |
| Auth             | Expired or revoked session          | Refresh once; on failure mark signed-out and prompt      |
| Conflict         | Stale base                          | Reconcile per rules above. Not an error path             |
| Account mismatch | Signed-in account ≠ `local_account` | Stop; require an explicit user decision                  |
| Permanent        | 4xx, schema mismatch, bad payload   | Stop the cycle, report to telemetry, surface in Settings |

Sync failure is **never a blocking or modal error**. The local record remains available, so a
failed sync is a background condition, not an interruption. It surfaces as state
in Settings ("Last synced 2 hours ago"), and the only failures worth actively interrupting for
are an expired session and an account mismatch, because both need a human.

## Security

- Every table has RLS enabled with `user_id = auth.uid()` on select, insert, update, and
  delete. Enforced in Postgres, never in the client.
- `user_id` is never accepted from the client payload; the server derives it from the verified
  JWT. This is why local rows do not carry one.
- `updated_at` and `deleted_at` are server-controlled and rejected if client-supplied.
- Postgres SQL — schema, policies, functions — lives in `supabase/migrations/` and is the source
  of truth. No schema changes are made through the dashboard.

## Testing

The protocol is tested against `FakeTransport`, with no network and no Supabase project. The
cases that must be covered:

- Both convergence walkthroughs above, asserted to reach identical state on both replicas
- Offline edits on two devices, reconciled on reconnect
- Interrupted pull resumes at the cursor, loses and duplicates nothing
- Interrupted push resumes, and retried pushes are idempotent
- Rows sharing an `updated_at` across a page boundary are not skipped
- Delete propagation in both directions
- Purge-window expiry forces a full resync rather than resurrecting deleted rows
- Sign-in links an account without rewriting rows, and the first push uploads everything
- Sign-out then sign-in to the same account resumes without re-uploading
- Account mismatch refuses to sync
- Conflicts land in `sync_conflicts` in every branch of the resolution table
- Entitlement loss stops transmission without touching local data

These are ordinary fast unit tests, because the engine depends only on ports.
