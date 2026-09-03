# IND — Architecture

## The shape in one paragraph

IND is a local-first React Native app. SQLite on the device is the source of truth. All reads
and writes go through repositories against that local database, synchronously and offline. A
separate sync engine reconciles the local database with a remote server in the background, on
its own schedule, and **nothing in the UI ever waits on it**. Supabase is one implementation of
that remote, reached through a narrow port, and no code outside the adapter knows it exists.

## Why local-first

The alternative — server as source of truth with a local cache — was rejected. It makes offline
the hard case, and for IND offline is the _normal_ case: shifts get logged in basements, walk-ins,
and car parks. It also introduces latency into the one interaction that has to feel instant
(recording a shift you just finished), and puts loading states and error handling in front of
data the user already owns.

The cost of local-first is that we must write a sync protocol. That cost is real but bounded,
because IND's data is close to the easiest case sync has: single-writer, small rows,
append-mostly, no collaborative editing. See [SYNC.md](SYNC.md).

## Layers and the dependency rule

```
┌─────────────────────────────────────────────────────────────┐
│  app/          expo-router routes — wiring only, no logic   │
├─────────────────────────────────────────────────────────────┤
│  features/     screens, components, hooks per feature area  │
├─────────────────────────────────────────────────────────────┤
│  data/         repositories, local DB, sync engine, ports   │
├─────────────────────────────────────────────────────────────┤
│  domain/       pure TypeScript — entities, money, time,     │
│                pay rules. No I/O of any kind.               │
└─────────────────────────────────────────────────────────────┘
         dependencies point downward, never upward
```

**The dependency rule:** a layer may import from layers below it and never from layers above.
`ui/`, `theme/`, and `lib/` are shared leaves that any layer may use, subject to the domain
restriction below.

### `domain/` is pure, and this is enforced

`domain/` contains the logic that is genuinely hard to get right and genuinely expensive to get
wrong: money arithmetic, time and duration arithmetic, pay-rule evaluation, and the entity
types themselves.

It imports **nothing** from `react`, `react-native`, `expo-*`, `drizzle-orm`, `@supabase/*`, or
any other layer. It is plain TypeScript that would run in Node, in a browser, or on a server
unchanged.

This is enforced by an ESLint `no-restricted-imports` rule scoped to `src/domain/**`, not by
good intentions. Two reasons it matters:

1. **Testability.** The riskiest logic in IND runs as fast unit tests with no simulator, no
   database, and no mocking. That is the difference between a test suite that gets run and one
   that doesn't.
2. **Reuse without a monorepo.** If a server-side validator, a web surface, or a watch app ever
   needs the same pay-period or tip-split math, `domain/` lifts out to a package with no
   untangling. We are not building that today, but we are not foreclosing it either.

## The backend boundary

**Requirement: Supabase is an implementation detail, not an architectural commitment.**

The entire remote surface is two interfaces, defined in `src/data/sync/ports.ts`. These are the
only shapes the rest of the app knows about.

```ts
/** Identity. Knows nothing about how identity is established. */
export interface AuthPort {
  getSession(): Promise<Session | null>;
  onSessionChange(listener: (session: Session | null) => void): Unsubscribe;
  signInWithApple(): Promise<Session>;
  signInWithGoogle(): Promise<Session>;
  signInWithEmail(email: string): Promise<void>; // magic link
  signOut(): Promise<void>;
}

/** Movement of rows to and from the remote. Knows nothing about auth or storage. */
export interface SyncTransport {
  pull(request: PullRequest): Promise<PullResponse>;
  push(request: PushRequest): Promise<PushResponse>;
}
```

Rules that keep this honest:

- `@supabase/supabase-js` may be imported **only** inside `src/data/sync/adapters/supabase/**`.
  Enforced by ESLint `no-restricted-imports` everywhere else.
- No Supabase type ever crosses the port. `Session` is our type, not theirs. Postgres error
  shapes are translated into our `SyncError` taxonomy at the adapter edge.
- The sync engine is written against the ports and has no knowledge of HTTP, Postgres, or RLS.
- A `FakeTransport` implementing the same interface backs the sync engine's tests, so the
  protocol is testable without a network or a Supabase project.

What this buys: replacing Supabase with a self-hosted Postgres and a Hono API means writing one
new adapter directory. Nothing in `app/`, `features/`, `domain/`, or the local database layer
changes. Given that Supabase is a reasonable but reversible choice, this seems worth the one
indirection it costs.

What it deliberately does **not** do: abstract the local database. Drizzle and SQLite _are_ the
architecture, not a detail, and pretending otherwise would add a layer that pays for nothing.

## Folder structure

```
src/
  app/                          expo-router routes. Thin — layout, params, and composition.
    _layout.tsx
    (tabs)/
    settings/

  features/                     one directory per feature area
    shifts/                       components/, hooks/, screens live beside each other
    jobs/
    earnings/
    account/                      sign-in, account state, entitlement UI
    export/                       CSV/JSON export — free tier, unrestricted

  domain/                       PURE. No React, no RN, no I/O. Fully unit tested.
    money/                        minor-unit arithmetic, allocation, formatting inputs
    time/                         instants, business dates, durations, DST-safe math
    pay/                          pay rules, overtime, pay periods, tip-outs
    entities/                     Job, Shift, TipEntry, PayPeriod — types and invariants

  data/
    db/
      schema.ts                   Drizzle table definitions
      migrations/                 generated by drizzle-kit — committed, never edited
      client.ts                   database handle, pragmas, migration runner
      repositories/               the only place queries are written
    sync/
      ports.ts                    AuthPort, SyncTransport — the backend boundary
      engine.ts                   pull/push orchestration, written against ports only
      reconcile.ts                conflict resolution — pure, heavily tested
      state.ts                    sync cursors and bookkeeping
      adapters/
        supabase/                 the ONLY place @supabase/* is imported
        fake/                     in-memory transport for tests

  ui/                           design-system primitives: Text, Button, Screen, Card, Field
  theme/                        semantic tokens over PlatformColor / HIG palette
  lib/
    env/                          typed, validated environment configuration
    telemetry/                    error reporting behind an interface
    format/                       locale-aware display formatting (currency, dates, durations)

supabase/
  migrations/                   Postgres schema, RLS policies — SQL is the source of truth

docs/                           this folder
```

### Notes on the structure

**`features/` over `components/` + `screens/` + `hooks/`.** Feature-area colocation keeps
related code together and makes it obvious what can be deleted when a feature is removed.
Cross-feature reuse gets promoted to `ui/` or `domain/` deliberately, rather than accumulating
in a shared bucket by default.

**`app/` stays thin.** Routes compose feature screens and read params. Business logic in a route
file is a bug — it can't be tested and it can't be reused.

**Repositories are the only place SQL lives.** Features call `shiftRepository.listForPeriod()`,
never a Drizzle query builder directly. This keeps query patterns reviewable in one place and
means sync bookkeeping columns (see [SYNC.md](SYNC.md)) are maintained centrally rather than
being every caller's responsibility to remember.

## Data flow

**Read.** Feature hook → repository → Drizzle `useLiveQuery` against local SQLite. Queries
re-render automatically when the underlying rows change, including changes written by the sync
engine. No cache layer, no invalidation, no `TanStack Query` — there is no server in the read
path.

**Write.** Feature → repository → local SQLite transaction. The write is durable and visible
immediately. The repository marks the row pending for sync. The UI does not wait for, or know
about, anything remote.

**Sync.** The engine runs on app foreground, on network regain, and debounced after local
writes. It pulls remote changes, reconciles, and pushes pending local rows. Every stage is
resumable and idempotent. Failures are logged and retried; they never surface as a blocking
error, because the user's data is already safe locally.

**Entitlement.** The sync engine is gated on an active Pro entitlement. Free users accumulate
pending rows that are never sent — the local database behaves identically either way, which is
what makes the tier a single check rather than a second code path.

## Testing strategy

| Layer        | Approach                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `domain/`    | Exhaustive unit tests. Money, DST boundaries, overnight shifts, pay periods, tip allocation. This is where the bugs that cost people money live. |
| `data/db/`   | Repository tests against an in-memory SQLite database, including migration tests that assert old databases upgrade correctly.                    |
| `data/sync/` | Protocol tests against `FakeTransport` — offline edits, conflicts, interrupted syncs, resumed cursors, purge-window expiry. No network.          |
| `features/`  | React Native Testing Library for interaction behaviour, kept light.                                                                              |
| E2E          | Maestro for the handful of flows that must never break: log a shift, sign in, export data.                                                       |

Migration tests deserve specific mention: an app that records financial history cannot ship a
migration that loses or corrupts rows. Every migration gets a test that seeds the previous
schema, migrates, and asserts the data survived.

## What we are deliberately not doing

- **No monorepo or workspaces.** One app, one package. `domain/` purity means promoting it to a
  package later is mechanical. Metro resolver configuration and EAS workspace builds are a
  permanent tax that buys nothing until a second app exists. ([ADR-009](DECISIONS.md#adr-009))
- **No admin application.** A single-user tracker has no users or content to administer. If a
  support surface is ever needed, Supabase Studio and SQL cover it for a long time.
- **No server state library.** There is no server in the read path.
- **No abstraction over SQLite or Drizzle.** They are the architecture.
- **No dependency injection framework.** Ports are passed explicitly at composition time.
