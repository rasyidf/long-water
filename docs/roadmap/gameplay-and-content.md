# Gameplay and content

Level variety, the level-builder tool, and keeping new mechanics honest against the three pillars
in `ARCHITECTURE.md` Part I §1. See [ANALYSIS.md](../ANALYSIS.md) for the overall picture.

## 1. The level-builder tool

**Status (v1 landed):** a Svelte in-repo tool now exists — `editor.html` (leg / zones / terrain /
spawns forms with a live `SceneHost` preview and Save→`src/world/levels/*.json` via a dev-server
plugin) and `tools.html`, a procgen viewer with a designer per system (terrain/WFC, whale, coral,
squid, fauna). `src/tools/SceneHost.ts` renders a real `LevelDef` through the game's own
`applyLevel` + renderer stack (`src/core/renderStack.ts`). Remaining polish: drag zone
boundaries / click-to-place spawns on the canvas, structured editors for `place`-mode `items`
and nested `reef`/`calf` (currently JSON sub-editors).

**Original analysis:** exactly one level exists (`world/levels/crossing.json`), despite the format
being fully generic — `ARCHITECTURE.md` §9 and `world/level/README.md` both describe the level
file as "what a future level-builder tool reads and writes." The schema
(`world/level/schema.ts`), validator (`world/level/validate.ts`), and applier
(`world/level/apply.ts`) already treat every level as data; nothing in the engine assumes
`crossing` specifically.

**Why this is the highest-leverage content item:** every other content idea (a second leg, a hard
mode, seasonal variants) is blocked on hand-writing JSON by feel today. A level-builder tool — even
a minimal one that visualizes the WFC terrain output and lets zones/spawns be dragged rather than
typed — turns "add a level" from an engineering task into a design task.

**Do, in order:**
1. Write `world/level/validate.ts` schema tests first (tracked in
   `engineering-foundations.md` #1) — a builder tool is only trustworthy if bad output is caught
   before it ships.
2. Decide the tool's shape: in-repo dev page (like `preview.html`/`procgen.html`, which already
   establish the pattern of a second Vite entry point booting `Game` against a special scene) vs.
   a standalone editor. The in-repo route is cheaper and matches existing precedent.
3. Start with terrain + zones (visual, immediately useful for eyeballing WFC output — ties into
   the socket-based rewrite in `reef-and-wfc-notes.md` §4) before spawn placement (`scatter`/
   `place` directives), which is more tedious to make visual.

## 2. More legs / difficulty tiers

**Current state:** `ARCHITECTURE.md` §9 lists this as available "today" via the level file, but
none exist beyond `crossing`. The tuning knobs are real (leg length, zone layout, terrain weights,
entity density, pod size available) — this is genuinely just content, not engineering, once
`engineering-foundations.md` #4 (moving breath/reserve multipliers into the level file) lands.

**Do:** don't hand-write a second level until the tuning-consolidation step lands — otherwise a
"hard mode" can only vary spawn density and terrain, not the actual resource pressure that makes
difficulty legible, and it'll need a second pass once the multipliers move.

## 3. Vetting new mechanics against the pillars

**Current state:** the design doc is unusually explicit about scope — three pillars (weight of a
large animal, sound as primary sense, a pod you can lose), "quiet, unhurried, naturalistic," "no
score numbers on screen during play." The scoring system (`5ff1c3a`, recent) and squid encounter
(`cc9c1ad`, `29bf266`, recent) are both additions on top of an originally narrower design.

**Tension worth naming explicitly:** a trick-scoring/combo system (flow chain, milestone popups)
pulls toward "arcade" in a design explicitly pitched as the opposite of score-chasing during play.
The doc resolves this by keeping the tally end-card-only and score display as a small HUD number
that "eases up" rather than flashing — i.e. the tension was noticed and designed around, not
ignored. Worth keeping as an explicit check for future mechanics: does a new addition stay
readable as "quiet and naturalistic," or does it need the same kind of soft-pedaling scoring got?

**Do:** when adding a mechanic, write one sentence connecting it to a pillar before implementing
(the design doc's own §9 "difficulty & variants" section is the model — it explains *why* each
knob is safe to expose). Squid and scoring both have this justification already in the design doc;
keep that habit rather than letting mechanics accumulate without it.

## 4. Playtesting debt on recent additions

**Current state, per `whale-rendering-roadmap.md`'s own tracking and git log:**
- Squid (`cc9c1ad`, `88915c6`, `29bf266`) — "calm retune" in the most recent commit suggests this
  is still being felt out, not settled.
- Scoring (`5ff1c3a`) — newest system, no tuning notes visible anywhere (unlike squid, which has
  an explicit `config/squid.ts` + retune commits).
- Whale roll/rendering rewrite — explicitly **not yet verified in-game** per
  `whale-rendering-roadmap.md`'s own "Next up" N2 item (only checked in `/procgen.html` so far).

**Do:** N2 in `whale-rendering-roadmap.md` (drive a full breach roll in the real game) is the most
concrete, already-written next action across the whole codebase — it's a full rewrite that has
only been checked in isolation. Doing that verification pass is lower-risk and higher-value than
any new mechanic right now, since a rendering regression here would be visible on every whale, every
frame.

## 5. Reef/seafloor gameplay

**Current state:** coral is spawn-only decoration (`world/level/schema.ts`'s `coral` directive →
`CoralRenderer.ts`) with no system reading its position — no feeding, hazard, or sound hook, and
no `config/scoring.ts` entry, unlike every other terrain/entity interaction in the game.

**Do:** see **[reef-gameplay-options.md](../reef-gameplay-options.md)** — three pillar-grounded
options (feeding ground, risk/obstacle, sound/shelter) with system hooks and scope estimates. No
direction chosen yet; that doc is where the decision and the resulting brief should land, per §3's
"connect to a pillar before implementing" rule above.
