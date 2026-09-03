# IND — agent instructions

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any
code. Do not rely on remembered API shapes.

## Read this first

Architecture and reasoning live in `docs/`, and they are current:

| Document                                | What it covers                                    |
| --------------------------------------- | ------------------------------------------------- |
| [PRODUCT.md](docs/PRODUCT.md)           | What IND is, free vs. Pro, product principles     |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, dependency rules, the backend port        |
| [DATA-MODEL.md](docs/DATA-MODEL.md)     | Schema conventions, money handling, time handling |
| [SYNC.md](docs/SYNC.md)                 | The sync protocol specification                   |
| [DECISIONS.md](docs/DECISIONS.md)       | ADR trail — every choice and why                  |

Making an architectural decision? Add an ADR to `DECISIONS.md`. If implementation contradicts
a doc, stop and raise it rather than silently changing the architecture.

## Non-negotiables

Two are enforced by ESLint and will fail the build:

- **`src/domain` is pure.** No React, React Native, Expo, Drizzle, or Supabase imports, and no
  imports from other layers. Plain TypeScript that runs in Node unchanged. (ADR-015)
- **Supabase lives behind a port.** `@supabase/*` only inside
  `src/data/sync/adapters/supabase/`. Everything else uses `AuthPort` / `SyncTransport`.
  (ADR-010)

Two that review has to catch:

- **Money is never a float.** Integer minor units via `domain/money`, always. (ADR-007)
- **Durations come from instants**, never from subtracting wall-clock times. A shift across a
  DST boundary is not the difference between two clock faces. (ADR-008)

Local SQLite is the source of truth, not a cache. The app must work fully offline. (ADR-002)

After changing `src/data/db/schema.ts`, run `npm run db:generate` and commit the generated
migration. CI fails if schema and migrations disagree. Never edit a released migration.

Before claiming done: `npm run typecheck && npm run lint && npm run test:ci`.

## Git — the human drives it

Do **not** run `git commit`, `git push`, `git checkout -b`, `git merge`, `gh pr create`, or
delete branches. Write the code, leave it in the working tree, and report what changed and in
which files. Read-only git (`status`, `log`, `diff`, `branch -vv`) is fine any time.

If asked for a specific git action in a specific message, do that one action. Approval does not
carry to the next one. Describing this workflow tells you _how_ to do git when asked — it is
not permission to do it unasked.

### The workflow, for when it is asked for

A fork model, even where write access exists:

```
origin      the fork        git@github.com:danicodes01/<repo>.git
upstream    the real repo   git@github.com:<org>/<repo>.git
```

Never commit to main. Every piece of work is its own branch, prefixed `dev/`.

```sh
git checkout main
git fetch upstream main
git pull upstream main          # main only ever fast-forwards
git checkout -b dev/feature-branch
# edit, git add, git commit
git fetch upstream main         # optional: see incoming changes first
git pull upstream main
git push origin dev/feature-branch
# open PR: danicodes01:dev/feature-branch -> <org>:main
```

Once merged:

```sh
git checkout main
git pull upstream main
git push origin main            # keep the fork's main in sync
```

New work always starts from a freshly pulled main — never off another feature branch, and
never off a branch whose PR is already merged.

Two traps:

- `git pull upstream main` while standing on a feature branch merges main into that branch.
  Check the branch first; main is almost always where you want to be.
- Once a PR is merged its branch is dead. New commits on it are stranded, since pushing will
  not reopen a merged PR. Start a fresh branch.
