# IND — Design

How IND should look, feel, and behave. Read alongside [PRODUCT.md](PRODUCT.md); this document
covers execution, not what we're selling.

## The context we're designing for

Not a desk. Not two hands. Not good light.

IND gets opened at 2am in a dim bar, in a car park, on a bus home, standing up, holding
something else, tired, wanting to be done. Every decision below follows from that. A design that
is beautiful in a screenshot and slow at 2am has failed.

Three consequences, up front:

- **Dark is the primary case**, not a preference. Blinding someone at closing time is a
  usability failure, not a style choice.
- **One-handed reach matters.** Primary actions live in the lower half of the screen. Nothing
  essential sits in a top corner.
- **The nightly path must be near-thoughtless.** If logging a shift takes real attention, people
  stop doing it, and an income tracker with gaps is worse than useless — it's misleading.

## The thing we are not building

Every competitor is a spreadsheet with an app skin: rows, columns, a totals bar. That is the
shape this data arrives in, and it is the shape to refuse.

**The Excel test:** if a screen could be replaced by a table without losing anything, it is the
wrong screen. The fix is never to style the table better. It is to not have a table.

## Interaction model

### Stories for the rare and the complex

One question per screen, with the reason stated. Used for onboarding, adding or editing a job,
and guided flows like a tax-year export.

Adding a job means pay rate, pay period, week start, overtime threshold, and tip-out rules. As a
form that is a wall of fields nobody reads. Drip-fed, each question can carry its own why:

> **When does your work week start?**
> This is how overtime gets counted. Most places use Monday, but check your schedule.

One question, one answer, one clear way forward. No screen asks two things.

### One fast surface for the nightly ritual

**Logging a shift is explicitly not a story.** It happens five nights a week and must be one
screen, arriving mostly answered:

- Job — defaulted to the last one used, changed with one tap when there's more than one
- Business day — defaulted from the shift's start and the job's day-start hour
- Times — tap to set, prefilled with sensible guesses
- Tips — a purpose-built numeric keypad, focused and ready

The common case should be **confirm, not fill in**. Six screens for this would be faithful to
the story pattern and fatal to the product.

### Input rules

- **No dropdowns.** Ever. They're small targets, they hide their options, and they're the most
  spreadsheet-feeling control there is.
- Two to four options → segmented control.
- More than four → a sheet with full-width rows and large targets.
- Dates and times → native pickers, where muscle memory already lives.
- Money → a custom numeric keypad. Never a text field and the system keyboard.
- Destructive actions confirm. Nothing else does.

## Visual direction

### The signature: a night is a shape

The one memorable thing, and the anti-Excel move that matters.

Each shift renders as a bar spanning the hours actually worked, weighted by what was earned. A
week becomes a horizon of shapes — read at a glance that Friday was huge and Tuesday was dead,
without reading a number. Everything else on screen stays quiet so this can carry the page.

This is also why the content palette must be real values rather than platform colors: these
shapes have gradients and transitions, and `PlatformColor` cannot be interpolated.

### Type: system faces, rounded numerals

Body and UI text use the system face — SF Pro on iOS — so the app inherits Dynamic Type,
optical sizing, and every future OS refinement for free.

**Numerals are set in the rounded system variant** (`ui-rounded` / SF Pro Rounded). This is the
typographic anti-Excel move: rounded figures read warm and human where the default reads like a
ledger, and it costs nothing in nativeness because it is still a system face.

- Money always uses `fontVariant: ['tabular-nums']` so digits don't jitter as values change.
- **One hero figure per screen.** What you made tonight, this week, this period — large, confident,
  unaccompanied. Everything else recedes.
- No more than three type sizes visible at once.

### Colour: dark-first, one accent

Structure is system-semantic and effectively colourless: labels, separators, grouped
backgrounds, fills. The accent is spent in one place.

Proposed accent: **warm amber/brass** — low bar light, brass fittings, the colour of the room
this app lives in. It sits well on dark, and it is deliberately not the fintech green or the
terracotta that every other finance app reaches for.

Used for: the hero money figure, the shift shapes, the "on shift now" indicator. Nothing else.

### Motion

One orchestrated moment, not scattered effects: **saving a shift** counts the figure up to its
new total with a single haptic. That's the reward for the nightly ritual and the only place
motion is spent.

Everything else is standard platform transitions. `prefers-reduced-motion` is respected —
the count-up becomes an instant set, the haptic stays.

## Theming architecture

Tokens live in one module, in two layers, because they answer different questions.

```
src/theme/
  semantic.ts   →  DynamicColorIOS / PlatformColor      chrome: labels, separators,
                                                         backgrounds, fills, system fills
  content.ts    →  explicit light/dark value pairs      money, shift shapes, charts, accent
```

**Semantic tokens resolve natively.** `DynamicColorIOS({ light, dark })` is resolved by the OS at
draw time, so light/dark switching costs no JS re-render, has no wrong-theme flash on launch, and
inherits Increase Contrast and Reduce Transparency for free.

**Content tokens are ours** because `PlatformColor` values are opaque — they cannot be read,
interpolated, animated, or handed to a gradient. Anything that moves or blends needs real values.

`useColorScheme()` is used narrowly: only where JS must _know_ the mode to choose a content
palette. Never as the mechanism for ordinary colour.

**IND follows the system appearance. There is no in-app light/dark override**, which is what
makes the native-resolution path viable for everything in `semantic.ts`.

See [ADR-022](DECISIONS.md#adr-022).

## Accessibility floor

Not polish. These ship with the first screen, not after.

- **Dynamic Type** — including the hero figure. It must reflow, not clip or truncate.
- **VoiceOver** — the shift shapes are data, not decoration. Each carries a label that reads the
  real values: "Friday 14 March, six hours, eighty-two dollars in tips."
- **44pt minimum** on every target. Bigger for the keypad, which gets used tired.
- **4.5:1 contrast minimum**, verified in both appearances, including amber on dark.
- **Reduced motion** respected everywhere.
- Never colour alone to carry meaning.

## Writing

Words are design material. The interface's vocabulary is how people learn their way around.

- **Name things by what people do.** "Back up & sync", never "create an account". "Log shift",
  never "Submit".
- **An action keeps its name through the whole flow.** The button that says "Log shift" produces
  "Shift logged."
- **Active voice, sentence case, plain verbs.** No filler, no cleverness. Specific beats clever.
- **Errors say what happened and what to do**, in the interface's voice. They do not apologise
  and they are never vague.
- **Empty states are invitations, not decoration.** "No shifts yet. Log your first one." with the
  action right there.
- **Never overstate durability.** "Never lose your records" is a Pro claim. A free signed-in
  account says plainly that records are not backed up. See [PRODUCT.md](PRODUCT.md).

## Review checklist

Before a screen is done:

- [ ] Could this be a table without losing anything? If yes, redesign it.
- [ ] Is the primary action reachable one-handed?
- [ ] Is there exactly one hero number?
- [ ] Any dropdowns? Remove them.
- [ ] Does it work at the largest Dynamic Type size?
- [ ] Does VoiceOver read the data, not the decoration?
- [ ] Does it look right at 2am, dark, one-handed?
