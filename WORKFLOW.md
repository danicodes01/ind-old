# Development Workflow

Day-to-day commands for IND. Architecture and reasoning live in [`docs/`](docs/) — this file is
just the how.

## Quick Start

```bash
# 1. Sync with upstream
git checkout main
git pull upstream main

# 2. Install any new dependencies
npm install

# 3. Branch and start working
git checkout -b dev/your-feature-name
npm start                     # dev server; the installed dev build connects to it
```

Database migrations apply themselves when the app launches — there is no sync step to run.

## Prerequisites

- **Node 22+**
- **Xcode** for iOS. **A JDK** for Android (`brew install --cask zulu@17`) — Android builds fail
  without one.
- Remotes configured: `origin` = your fork, `upstream` = `Mikanoko-Studio/ind`
- `.env.local` is optional. The app runs fully without a backend — see [`.env.example`](.env.example).

## Running the App

IND uses native modules, so **Expo Go will not work**. You need a development build — a build of
IND itself that contains the native modules and can load JS from a dev server.

### Day to day

Once a dev build is installed, this is all you need:

```bash
npx expo start --dev-client
```

JS changes hot-reload. You do **not** need a new build to change screens, domain logic, or the
database schema.

### When you need a new dev build

Only when something **native** changes: adding or removing a native module, or editing
`app.json`'s native config (plugins, bundle identifier, permissions).

```bash
eas build -p ios --profile development-sim    # simulator build
eas build:run -p ios --latest                 # download + install it
npx expo start --dev-client
```

For a physical device use `--profile development` instead, and register the device first with
`eas device:create`.

### Local builds (fallback)

`npx expo run:ios` builds natively on your machine instead of in the cloud. Faster and works
offline, but it **generates an `ios/` directory**, and once that exists `app.json` stops taking
effect — config plugins only run during prebuild. If you use it, re-run
`npx expo prebuild --clean` after any `app.json` change, or delete `ios/` when you are done.

`ios/` and `android/` are gitignored. `app.json` is the source of truth; never hand-edit the
native projects.

| Command                       | What it does                               |
| ----------------------------- | ------------------------------------------ |
| `npx expo start --dev-client` | Dev server for an installed dev build      |
| `npx expo start --clear`      | Same, discarding the Metro cache           |
| `eas build:list`              | Build history                              |
| `npx expo run:ios`            | Local native build (creates `ios/`)        |
| `npx expo prebuild --clean`   | Regenerate native projects from `app.json` |
| `npm run doctor`              | Environment sanity check                   |

## Database

The local SQLite database is the source of truth. `src/data/db/schema.ts` is the source of truth
for its shape, and the SQL under `src/data/db/migrations/` is generated from it.

### Changing the schema

```bash
# 1. Edit the schema
vim src/data/db/schema.ts

# 2. Generate the migration
npm run db:generate

# 3. Commit BOTH the schema and the generated migration
git add src/data/db/schema.ts src/data/db/migrations
```

Migrations apply automatically at app start. Relaunch the app to pick up a new one.

### Rules

- ✅ Always run `npm run db:generate` after editing `schema.ts`, and commit the result. CI fails
  if the two disagree.
- ✅ Every syncable table carries the columns in [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) —
  UUIDv7 `id`, `updated_at`, `deleted_at`, `_sync_state`, `_base_updated_at`, `_local_updated_at`.
- ❌ **Never edit a migration that has shipped.** It has already run against real data. Write a
  new one.
- ❌ **Never hand-edit `migrations/meta/`.** It is drizzle-kit's bookkeeping.
- ❌ Never use `drizzle-kit push`. We generate versioned migrations; push reconciles by dropping.

### Resetting your local database

There is no reset command — the database lives inside the app sandbox. Delete the app from the
simulator and relaunch; migrations run from scratch on a fresh file.

### Supabase (not active yet)

`supabase/migrations/` will hold the Postgres schema and RLS policies as SQL, and that SQL is the
source of truth — no schema changes through the dashboard. Nothing there yet; see
[`docs/SYNC.md`](docs/SYNC.md).

## Before You Push

```bash
npm run typecheck
npm run lint
npm run test:ci
```

All three must pass. CI runs the same three plus a migration-drift check.

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run typecheck` | `tsc --noEmit`                                 |
| `npm run lint`      | ESLint, including the architectural boundaries |
| `npm run lint:fix`  | Autofix what it can                            |
| `npm run format`    | Prettier write                                 |
| `npm test`          | Jest, watchable                                |
| `npm run test:ci`   | Jest with coverage thresholds                  |

Two boundaries are enforced by lint and will fail the build: `src/domain` stays pure, and
`@supabase/*` is confined to `src/data/sync/adapters/supabase/`. See [`AGENTS.md`](AGENTS.md).

## Git

Fork model. `origin` is your fork, `upstream` is the real repo.

```
origin      git@github.com:danicodes01/ind.git
upstream    git@github.com:Mikanoko-Studio/ind.git
```

**Never commit to main.** Every piece of work is its own `dev/` branch.

### Starting work

```bash
git checkout main
git pull upstream main          # main only ever fast-forwards
git checkout -b dev/your-feature-name
```

### Finishing work

```bash
git status                      # know what you are committing
git add <files>                 # specific files, not `git add .`
git commit -m "feat: ..."

git pull upstream main          # only while on main — see traps below
npm install                     # in case main brought new deps
npm run typecheck && npm run lint && npm run test:ci

git push origin dev/your-feature-name
# open PR: danicodes01:dev/your-feature-name -> Mikanoko-Studio:main
```

### After the PR merges

```bash
git checkout main
git pull upstream main
git push origin main            # keep the fork's main in sync
git branch -d dev/your-feature-name
```

New work always starts from a freshly pulled main — never off another feature branch, and never
off a branch whose PR is already merged.

### Two traps

- `git pull upstream main` **while standing on a feature branch** merges main into that branch.
  Check the branch first; main is almost always where you want to be.
- Once a PR is merged its branch is dead. New commits on it are stranded, since pushing will not
  reopen a merged PR. Start a fresh branch.

## Native Commands

> **EAS is not configured yet.** There is no `eas.json` and no linked EAS project, so every
> `eas build` command below fails until the setup step is run. Local simulator builds
> (`npx expo run:ios`) work today and need none of this.

### Simulators and emulators

```bash
xcrun simctl list devices available          # what you can boot
xcrun simctl boot "iPhone 17 Pro"            # boot one
open -a Simulator                            # bring the window up
xcrun simctl uninstall booted studio.mikanoko.ind   # wipe the app AND its database
xcrun simctl erase all                       # nuclear: reset every simulator
```

`simctl uninstall` is the reset-the-database command — the SQLite file lives in the app sandbox,
so removing the app removes it. Relaunch and migrations run from scratch.

Android:

```bash
emulator -list-avds                          # available emulators
adb devices                                  # attached devices/emulators
adb logcat | grep -i ind                     # device logs
```

### Dev client

```bash
npx expo start --dev-client   # Metro for an installed dev build
npx expo start --clear        # same, discarding the Metro cache
```

| In the simulator | Does              |
| ---------------- | ----------------- |
| `Cmd+R`          | Reload JS         |
| `Cmd+D`          | Open the dev menu |
| `Cmd+Ctrl+Z`     | Shake gesture     |

### EAS setup (once)

```bash
npm install -g eas-cli
eas login
eas init                # links the project, writes extra.eas.projectId into app.json
eas build:configure     # creates eas.json with build profiles
```

Then commit `eas.json` and the `app.json` change.

### EAS builds

Cloud builds. Needed for anything that leaves your machine — physical devices, testers,
TestFlight, the stores.

```bash
eas build -p ios --profile development       # dev client, native modules baked in
eas build -p ios --profile development-sim   # simulator build (needs ios.simulator: true)
eas build -p ios --profile preview           # internal/ad-hoc distribution
eas build -p ios --profile production        # App Store / TestFlight

eas build -p android --profile development
eas build -p android --profile production

eas build:run -p ios --latest                # download + install the last simulator build
eas build:list                               # build history
```

A **rebuild is required** after adding any native module or changing `app.json`'s native config.
JS-only changes never need one.

### Registering test devices (ad-hoc)

Each tester's device UDID has to be registered before an ad-hoc build will install.

```bash
eas device:create      # prints a QR code; the tester scans it on their iPhone
eas device:list        # who is registered
```

### Credentials

```bash
eas credentials                    # interactive: certs, provisioning profiles, keystores
eas credentials -p ios             # iOS only
```

EAS can generate and store Apple certificates and the Android keystore for you. **Do not lose
the Android keystore** — Play Store updates must be signed with the same one, and there is no
recovery if it is gone and Play App Signing was not enabled.

### Submission

```bash
eas submit -p ios --latest         # → App Store Connect / TestFlight
eas submit -p android --latest     # → Google Play
```

### Store prerequisites

Neither is needed until you submit, but both take time to sort out:

|            | Apple                              | Google                                               |
| ---------- | ---------------------------------- | ---------------------------------------------------- |
| Account    | Apple Developer Program, $99/year  | Play Console, $25 one-time                           |
| Also needs | App record in App Store Connect    | App record + a service-account JSON for `eas submit` |
| Both need  | Privacy policy URL and support URL | (planned: hosted on `mikanoko-web`)                  |

Bundle identifier is `studio.mikanoko.ind` on both platforms — set in `app.json`, trivial to
change now and disruptive after the first TestFlight build.

## Troubleshooting

### Build fails after adding a dependency

```bash
npx expo install <package>      # use this, not npm install, for Expo-compatible versions
npx expo prebuild --clean
npx expo run:ios
```

### Metro serving stale code

```bash
npx expo start --clear
```

### App crashes at launch with a migration error

The schema and the database disagree. Delete the app from the simulator and relaunch. If it
persists, check that `npm run db:generate` was run and the migration was committed.

### CI fails on "schema changed without a generated migration"

```bash
npm run db:generate
git add src/data/db/migrations
```

### `npx expo run:android` fails with "Unable to locate a Java Runtime"

```bash
brew install --cask zulu@17
```
