# Reef / seafloor gameplay — design options

**Status:** no direction chosen yet. This doc lays out options for a design
decision, not a spec to implement. See `gameplay-and-content.md` §3 for the
"connect to a pillar before implementing" rule this doc is applying.

## The gap

Coral is currently pure decoration. `world/level/schema.ts`'s `coral` spawn
directive places static growths (`CoralRenderer.ts`) and can optionally spawn a
"reef school" of cosmetic fish (`reef?: { chance, riseFromFloor, schoolRise,
schoolCount }`), but nothing in `src/systems/` reads coral position, and
`config/scoring.ts`'s `POINTS` table has no reef-related entry (compare
`krillFeast`, `closePass`, `squidDodge` — every other terrain/entity
interaction has one). The reef is scenery the whale swims past, not through.

This matters because the game's tuning surface (breath, energy, song range,
pod cohesion, ship noise) is entirely about the open water crossing — the reef
sits inside that space without adding a decision of its own.

## The three pillars (`ARCHITECTURE.md` §1, for reference)

1. **The weight of a large animal.** Momentum, wide turns, nothing snaps.
2. **Sound as the primary sense.** Dark below the light line; song costs
   breath and reveals food/whales.
3. **A pod you can lose.** Recruiting is progression; keeping them is pressure.

Any option below needs to earn its place against one of these — "quiet,
unhurried, naturalistic," per the tone note in `ARCHITECTURE.md` §1. None of
these should read as an arcade detour; each is written to fold into systems
that already exist rather than bolt on a new HUD element or prompt.

## Option A — Feeding ground (pillar 1 + existing loop)

Reef-adjacent water hosts its own food band, distinct from the open-water
krill scatter: reef fish schools (already spawnable via `coral.reef`) become
a second, denser feeding source, but only reachable by holding a tight line
through the shelf terrain instead of the open mid-column route.

- **Hook:** extend `FeedingSystem` (`src/systems/FeedingSystem.ts`) to also
  check proximity to `reef?: {...}` schools, or give reef schools their own
  light "graze" yield distinct from krill's lunge-feed. Reuses the existing
  `krill:fed` → `stats.fed` → `POINTS.krillFeast` pipeline shape; would add a
  parallel `reef:fed` path.
- **Pillar tie:** pillar 1 — a large animal working a tight, shallow line for
  a resource payoff is a real momentum/control trade, not a new mechanic.
- **Scope:** small. Mostly data (which reef patches count as feeding zones)
  plus a proximity check next to code that already exists.
- **Risk:** if reef feeding is strictly better than open-water krill, it
  homogenizes routing (everyone hugs the shelf). Needs a cost — e.g. reef
  terrain should be *harder* to hold a line through (see Option B) so the two
  aren't just "reef is free bonus food."

## Option B — Risk / obstacle (pillar 1)

Shallow reef terrain narrows the navigable channel. Holding a line through a
`reef-crest`-tagged span (see the reef-zonation WFC template in
`reef-and-wfc-notes.md` §4b) costs speed/control if the whale (or a trailing
pod member) doesn't fit the gap; scraping a wide turn near coral could spook
a trailing pod whale into breaking off, mirroring how ship noise already
scatters the pod today (`PodSystem` reads ship noise; see
`whale/PodBrain.ts`'s "ship-noise dive" behavior for the existing pattern to
copy).

- **Hook:** a new check in `whale/PodBrain.ts` alongside the existing
  ship-noise dive — reef proximity below some clearance threshold applies a
  stress/break-off pressure the same way ship noise does.
- **Pillar tie:** pillar 1 directly (a big animal in a tight space) and
  pillar 3 (a pod member can be lost here, not just to ships).
- **Scope:** medium — wants the reef-zonation WFC pass from
  `reef-and-wfc-notes.md` §4b to have *legible* narrow spans to navigate,
  rather than routing risk around today's `kind = rng()*5` scatter placement.
  Doing this before that WFC work is done means hand-placing risk zones.
- **Risk:** easiest of the three to tip into "arcade obstacle course," which
  cuts against "quiet, unhurried" — would want visual/audio telegraphing (the
  reef narrowing gradually, not a sudden gate) more than most mechanics need.

## Option C — Sound / shelter (pillar 2 + 3)

Coral structure muffles or reflects song rings (`SongSystem`'s `song:emitted`
→ ping propagation, which already attenuates near ships — `maxR *= 0.55`
within 6000u of a ship hull). A reef pocket could do the same by reflection
instead of pure attenuation — a ping that clips reef geometry returns a
delayed echo, effectively giving the player passive information about reef
shape without a visual HUD, which is very on-pillar for "sound as the primary
sense." Reef pockets could also act as a safe rest/regroup spot: pod members
inside dense coral are shielded from ship-noise stress, an explicit
counterweight to Option B's break-off risk.

- **Hook:** `SongSystem.init`'s `song:emitted` handler already has the shape
  for this (`for (const s of ctx.ships.ships) ... maxR *= 0.55`) — a
  parallel pass over nearby coral/reef geometry is the same code shape. The
  "shelter" half would read reef proximity in `PodBrain`'s ship-noise-dive
  check and suppress it, the mirror image of Option B.
- **Pillar tie:** the strongest fit of the three — it's a new *expression* of
  the sound pillar rather than a bolted-on mechanic, and it gives pillar 3 a
  positive use for the reef (shelter) instead of only a risk (Option B).
- **Scope:** medium — the ping-echo audio/visual feedback is a new capability
  (not just a number change), and needs a decision on how it reads to the
  player (a visual echo ring? An audio-only cue, keeping "no score numbers on
  screen" spirit?).
- **Risk:** lowest gameplay risk of the three, but the most design-open — the
  echo needs strong game-feel to \*read\* as an information channel, not a
  cosmetic ping variant.

## Where this could land

Options aren't mutually exclusive — B (risk) and C (shelter) are natural
opposites of the same reef-proximity read (stress up near open coral,
suppressed near dense coral), and A (feeding) is the piece that gives the
whale a reason to be near the reef at all before B/C matter. A plausible
sequencing, if more than one gets picked up, is **A first** (cheapest,
reuses `FeedingSystem` directly, gives the reef a reason to visit), then
**C** (highest pillar fit, adds real information-gameplay), then **B**
(wants the WFC reef-zonation rewrite as a prerequisite for legible risk
placement, and is the easiest to overcook into "arcade").

## What's needed before this is buildable

1. A choice among A/B/C (or a combination) — this doc stops at options
   deliberately.
2. For B and C specifically: the socket-based reef-zonation WFC pass
   (`reef-and-wfc-notes.md` §4b) gives a *legible* reef cross-section (sand →
   back-reef → reef-flat → reef-crest → fore-reef → drop-off) to hang
   risk/shelter zones off of. Building either against today's
   `kind = rng()*5` scatter placement means re-doing the zone logic once that
   WFC pass lands.
3. A one-sentence pillar justification recorded here once a direction is
   chosen, per the `gameplay-and-content.md` §3 convention — this doc's
   per-option "Pillar tie" lines are the draft version of that sentence.
