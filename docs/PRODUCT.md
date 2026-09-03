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

### Accounts — free, optional

Anyone can create an account. An account establishes identity: it's what a subscription
attaches to and what makes an upgrade a single tap.

Being signed in does **not**, by itself, sync anything. This is worth being explicit about
internally, because it's an easy thing to get wrong in the UI: a free signed-in account is an
identity, not a backup. The UI must never imply otherwise.

### Free

- Unlimited local use — unlimited jobs, shifts, and history. No caps.
- **Unrestricted export** of all data, CSV and JSON.
- An optional account.

Free users are not on a trial and are not nagged into a corner. IND is genuinely useful
forever without paying.

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
