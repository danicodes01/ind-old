# IND — Product Model

## What IND is

A private tool for service-industry workers — servers, bartenders, baristas, delivery riders,
stylists — to track shifts, tips, hours, earnings, and income across multiple jobs.

The people IND is for typically:

- work **more than one job**, often with different pay rules for each
- earn a large and variable share of income in **tips**, sometimes cash, sometimes pooled
- work **irregular and overnight** shifts that don't align to calendar days
- need income records at **tax time**, and often for rent applications or loans
- are frequently **offline or in a hurry** when they need to record something

Planned scope beyond the core tracker: scheduled shifts with calendar integration, and simple
earnings insights and graphs.

## Product principles

**1. Records are treated as irreplaceable.**
IND holds people's income records, often for years, and frequently the only copy. That defines
what we owe them: we never corrupt a record, never silently drop one, never lose one to a
migration, and never discard a version to resolve a conflict. Where survival is outside our
control, we say so plainly and give people the means to protect themselves.

Being exact about the limit, because it matters: **without Pro, records exist only on the
device.** If the phone is lost, destroyed, or the app deleted, the data goes with it. OS-level
backup may cover it, but we do not promise that (see below). What is unconditional is integrity
while the data is in our hands, and unrestricted export so that no free user is ever dependent
on us to hold their own copy. "Never lose your records" is a Pro claim, and it should only ever
be made there.

**2. It works with no signal.**
Logging a shift must never depend on the network. The local database is the source of truth,
not a cache. Sync is an enhancement, never a prerequisite.

**3. Your data is yours, unconditionally.**
Full export — every row, CSV and JSON — is available to every user, free or paid, with no gate
and no nagging. We sell automation and convenience. We never hold records hostage.

**4. Honest claims only.**
Sync is a _durability_ feature, not a _security_ feature. We say "never lose your records,"
not "keep your records safe" — because moving data to a server does not make it more secure,
it makes it more durable. For an app holding financial data, over-claiming is a liability.

**5. No sign-up wall.**
First launch to first logged shift, in seconds, with no account. Utility apps lose most of
their users at a login screen, and you cannot earn the trust of someone who never got in.

## Tiers

### Free

- Unlimited local use — unlimited jobs, shifts, and history. No caps.
- **Unrestricted export** of all data, CSV and JSON.
- **No account. No sign-in. No login screen anywhere.**

Free users are not on a trial and are not nagged into a corner. IND is genuinely useful
forever without paying, and a free user never encounters authentication at all.

### Pro

- **Automatic cloud backup and restore** — records survive a lost, stolen, or dead phone.
- **Multi-device sync**, including across platforms (iPhone → Android and back).

### Why this split

> For a financial tracker, "never lose your records" and "it's on my iPad too" is probably
> the most compelling thing you could charge for. More compelling than extra charts. If that's
> what you sell, then yes — the server is coming, and it's a scheduled milestone, not a maybe.

That reasoning is what drove the architecture. Durability is the product, so the server is a
committed part of the plan rather than a hedge, and the sync path is designed deliberately from
the first migration rather than retrofitted. See [ADR-005](DECISIONS.md#adr-005) and
[ADR-006](DECISIONS.md#adr-006).

### The fairness condition

Charging for sync is a standard and well-accepted model — Things, Bear, Day One, and 1Password
all do it. What keeps it fair rather than coercive is principle 3: **free users can always get
all of their data out.** The line we hold is between _"we'll do this for you automatically"_ and
_"pay or lose it."_ The first is a product. The second, for an app holding someone's tax
records, earns exactly the reviews it deserves.

### What OS-level backup does and doesn't cover

Free users get incidental protection from iCloud Backup and Android Auto Backup, which include
app data directories. This is a real safety net, but it has a hole in the middle and must never
be presented to users as a substitute for Pro:

- iCloud's free tier is 5GB; a great many people are silently over it with backups failing
- it does not work across platforms at all — iPhone → Android is total loss
- it restores a snapshot, so a stolen phone can still cost weeks of records
- it only restores at device setup; installing IND later on a fresh phone restores nothing
- deleting the app deletes its data regardless of backup

We treat it as a happy accident, never as a promise.

## Identity and access

### There are no user accounts, from the user's point of view

IND never asks anyone to create an account. There is no email/password, no sign-up form, no
verification step, and no standalone "create account" or "sign in" entry point anywhere in the
product.

What exists internally is a Supabase user, created behind the scenes the first time someone
turns on backup. That is an implementation detail and must never surface as one. The UI sells
and describes **"Back up & sync"** — never "create an account". See
[ADR-019](DECISIONS.md#adr-019).

### The three flows

**Free — no authentication at all.**
Install, log a shift, use it forever. Nothing to sign into.

**Turning on Pro.**
Settings → **Back up & sync** → paywall → purchase → _then_ **Continue with Apple** or
**Continue with Google** → first sync runs. One tap, Face ID, done: no form, no password, no
email.

**New device or reinstall.**
Restore purchase (entitlement comes from the store) → **Continue with Apple/Google** → synced
records come back.

Note the ordering: authentication happens _after_ purchase, as a step inside enabling backup,
not as a gate in front of the app.

### One user, multiple identities

**Apple is not "the iOS option" and Google is not "the Android option."** Both providers are
offered wherever practical, and one internal user can have **both identities attached**:

```
Supabase user 123
  ├── Apple identity
  └── Google identity
```

The failure this prevents: someone signs in with Apple on their iPhone, later signs in with
Google on an Android phone, and silently ends up with two separate cloud histories — the second
one empty. They would reasonably conclude their records were lost.

**Linking is explicit and happens while already signed in.** Supabase can auto-link providers
that return the same verified email, but we do not rely on it: Apple's **Hide My Email** returns
a relay address that will never match a Google address, so automatic linking fails for exactly
the most privacy-conscious users.

Three rules follow:

1. **Prompt to link early.** Once the first sync completes, offer to add the other sign-in
   method — "so you can get back in from any phone." Once, dismissible, and worth showing.
2. **Never push local rows into a freshly created empty account.** If someone authenticates and
   the server has no records for them, that is either a genuine new user or a wrong-provider
   mistake, and the two are indistinguishable. Ask before writing: _"This sign-in has no backup.
   If you've used a different sign-in before, try that one instead."_ Uploading first is what
   turns a recoverable mistake into a split history.
3. **You cannot unlink your last identity.** Doing so would lock someone out of their own
   backup.

See [ADR-020](DECISIONS.md#adr-020).

### Billing is separate from identity

The stores decide **what you have paid for**. Apple and Google sign-in decide **whose records
we are syncing**. These are deliberately independent:

- Entitlement is read from StoreKit / Play Billing, never from Supabase.
- The store account and the sign-in provider need not match. Buying through the App Store and
  signing in with Google is a legitimate, supported combination.
- "Purchased but not yet signed in" is a normal transient state — it is exactly the restore
  flow — and must not be treated as an error.

See [ADR-021](DECISIONS.md#adr-021).

### The states the UI must handle

The second row is the dangerous one: it is where the interface can quietly imply that someone's
income records are safe when they are not.

| State                   | What Settings must convey                                        |
| ----------------------- | ---------------------------------------------------------------- |
| Free, no account        | Default. Offer backup, do not nag                                |
| **Signed in, no Pro**   | **"Your records are not backed up."** Plainly. Restore path only |
| Pro, synced             | "Last synced 2 minutes ago"                                      |
| Pro, sync failing       | Last-synced time. Never a blocking error — data is safe locally  |
| Pro lapsed              | Sync stopped. Records intact, export intact, nothing deleted     |
| Signed in, empty backup | Offer the wrong-provider check before writing anything           |
| Account mismatch        | Explicit keep-or-delete decision — see [SYNC.md](SYNC.md)        |

### Obligations that come with having identities at all

- **In-app account deletion is mandatory** under App Store rules. A real flow, not a link to a
  web page, and it must be honest about what it deletes: the server copy and the internal user,
  not the records on the device.
- **Restore Purchases must work before sign-in**, since the store restores against the Apple ID
  or Google account, not against ours.

## Open product questions

Not blocking the foundation, but they need answers before a paid launch:

- **What else is in Pro?** Sync alone may be enough, but insights, reports, tax-ready exports,
  calendar integration, and widgets are candidates.
- **Pricing shape.** Subscription, one-time, or both. This audience is price-sensitive and
  seasonal; an annual plan priced against a single shift's tips is worth considering.
- **In-app purchase implementation.** StoreKit 2 supports on-device verification with no
  server; RevenueCat costs roughly 1% of tracked revenue above a free threshold and absorbs
  the subscription edge cases (grace periods, billing retry, proration, cross-platform
  entitlement). Decide when there is something to sell. See [ADR-011](DECISIONS.md#adr-011).
