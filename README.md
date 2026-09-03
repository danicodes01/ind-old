# IND

A private tool for people who work in the service industry to track shifts, tips, hours,
earnings, and income across multiple jobs.

IND is **local-first**. The SQLite database on your phone is the source of truth, not a cache.
The app is fully functional with the radio off — you can log a shift in a basement bar at 2am
with no signal, and nothing about that is a degraded experience. Cloud sync, when enabled, is a
durability and multi-device feature layered on top; it is never in the critical path of using
the app.

## Status

**Foundation stage.** Architecture, tooling, the local schema, and the domain layer are in
place. No product features are built yet.

Implemented:

- Expo SDK 57 project with strict TypeScript, expo-router, ESLint and Prettier
- Architectural boundaries enforced by lint (domain purity, Supabase containment)
- Drizzle schema and migration 001, sync-ready from the first migration
- `domain/money` and `domain/time` — the money and time arithmetic, fully tested
- Jest with a coverage floor on the domain layer, and GitHub Actions CI

Not yet built: the sync engine, the Supabase adapter, repositories, the design system, and
every product feature.

## Stack

| Concern        | Choice                                                         |
| -------------- | -------------------------------------------------------------- |
| Runtime        | Expo SDK 57, React Native 0.86, React 19.2 (New Architecture)  |
| Language       | TypeScript (strict), React Compiler enabled                    |
| Navigation     | expo-router v6 (file-based, typed routes)                      |
| Local database | SQLite (`expo-sqlite`) with Drizzle ORM + generated migrations |
| Backend        | Supabase (Postgres + Auth + RLS) — behind a port, see below    |
| Client state   | Zustand (ephemeral UI state only)                              |
| Theming        | Typed semantic tokens over Apple `PlatformColor` / HIG palette |
| Platforms      | iOS and Android, iOS-first feel                                |

## Getting started

Requires Node 22+ and Xcode (iOS) or Android Studio (Android).

```sh
npm install
cp .env.example .env.local   # optional — the app runs fully without a backend
npm run ios                  # or: npm run android
```

Expo Go is not sufficient once native modules are in play; use a development build.

### Scripts

| Script                | What it does                                        |
| --------------------- | --------------------------------------------------- |
| `npm start`           | Start the Expo dev server                           |
| `npm run ios`         | Run on the iOS simulator                            |
| `npm run android`     | Run on an Android emulator                          |
| `npm run typecheck`   | `tsc --noEmit`                                      |
| `npm run lint`        | ESLint, including the architectural boundary rules  |
| `npm run format`      | Prettier write                                      |
| `npm test`            | Jest                                                |
| `npm run test:ci`     | Jest with coverage and thresholds                   |
| `npm run db:generate` | Regenerate Drizzle migrations after a schema change |
| `npm run doctor`      | `expo-doctor` environment check                     |

### After changing the database schema

`src/data/db/schema.ts` is the source; the SQL in `src/data/db/migrations/` is generated and
committed. Run `npm run db:generate` and commit the result. CI fails if the two disagree.
Generated migrations are never edited after release — they have run against real data.

## Documentation

Read in this order:

| Document                                | What it covers                                                |
| --------------------------------------- | ------------------------------------------------------------- |
| [PRODUCT.md](docs/PRODUCT.md)           | What IND is, who it's for, free vs. Pro, product principles   |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, dependency rules, folder structure, the backend port  |
| [DATA-MODEL.md](docs/DATA-MODEL.md)     | Entities, money handling, time handling, schema conventions   |
| [SYNC.md](docs/SYNC.md)                 | The sync protocol specification                               |
| [DECISIONS.md](docs/DECISIONS.md)       | Architecture decision record — every choice and its reasoning |

Every significant technical choice is recorded as an ADR in `DECISIONS.md`. If you are about to
make one, add an entry.

## Architectural rules worth knowing before you write code

Two boundaries are enforced by ESLint rather than by convention, and both will fail your build
rather than degrade quietly:

- **`src/domain` is pure.** No React, React Native, Expo, Drizzle, or Supabase imports, and no
  imports from other layers. It is plain TypeScript that would run in Node unchanged. This is
  what keeps the money and time arithmetic testable without a simulator. (ADR-015)
- **Supabase lives behind a port.** `@supabase/*` may only be imported inside
  `src/data/sync/adapters/supabase/`. Everything else depends on `AuthPort` and
  `SyncTransport`. (ADR-010)

Two more that lint cannot check, but which review should:

- **Money is never a float.** All amounts are integer minor units via `domain/money`. (ADR-007)
- **Durations come from instants, never from wall-clock subtraction.** A shift across a DST
  boundary is not the difference between two clock faces. (ADR-008)
