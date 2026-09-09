# Long Water — Game Design Document & Technical Specification

---

# Part I — Game Design Document

## 1. Concept

**Long Water** is a side-view swimming game about a blue whale crossing one leg
of its migration. The player holds a course south through open ocean, managing
breath and energy reserves, and uses song to find food and to gather other
whales into a travelling pod. The pod makes the crossing cheaper — a group
drafts, and many voices sing further than one — but a pod is fragile: ship noise
scatters it, and hungry whales fall out of formation.

One run is a single continuous leg of roughly 12 km. There are no levels; the
run ends when the whale reaches warm water (win) or runs out of reserves (loss).

### Pillars

1. **The weight of a large animal.** Movement has momentum and a wide turn
   radius. Nothing snaps; speed is built and spent.
2. **Sound as the primary sense.** The world is dark below the light line. Song
   is how you see food and other whales, and it costs the resource you can only
   refill at the surface.
3. **A pod you can lose.** Recruiting whales is the progression; keeping them is
   the pressure. The pod is never guaranteed.

### Tone & audience

Quiet, unhurried, naturalistic. Short sessions (a run is a few minutes). Text is
sparse and literary. No fail-spam, no score numbers on screen during play — the
tally is shown only on the end card.

## 2. Core loop

```
        ┌─────────────────────────────────────────────┐
        │  swim south, holding depth in the food band  │
        └───────────────┬─────────────────────────────┘
                        │ breath falls
                        ▼
             surface to breathe ──► breath refills, distance stalls
                        │
                        ▼
              sing to reveal krill + wild whales
                        │
          ┌─────────────┴──────────────┐
          ▼                            ▼
  lunge-feed on krill          swim to a whale that
  (surge through a swarm)      answered → it joins the pod
          │                            │
          ▼                            ▼
  reserves refill              pod drafts (cheaper travel) +
                               chorus (song reaches further)
                        │
                        ▼
        cross the shipping lane without losing the pod
                        │
                        ▼
                 reach warm water — run ends
```

## 3. Resources

| Resource | Range | Refills | Drains | Empty →|
|---|---|---|---|---|
| **Breath** | 0–100 | At the surface (fast: ~52/s) | Passively underwater; faster the deeper you are; faster while surging; singing costs a flat ~6, a tail-kick ~4 | Whale starts drowning; reserves bleed ~11/s |
| **Reserves** (energy) | 0–100 | Lunge-feeding on a krill swarm | Passively while moving; faster while surging; **reduced the larger the pod is** (drafting) | **Loss condition** — the leg ends |

Notes:

- **Depth tax on breath.** Breath drain scales with depth up to ~300 m, so
  sitting deep to feed is a real cost, not free.
- **Drafting** reduces the *leader's* per-second reserve cost:
  `cost × 1 / (1 + 0.2 × followers)`. A pod of 5 roughly halves it. This is the
  mechanical reason to build a pod.
- **Drowning** (breath at 0) is a soft timer, not instant death — it converts
  into reserve loss, so a short overstay is survivable.

## 4. Movement

- **Steer:** WASD / arrow keys give a normalized direction. The whale
  accelerates toward it; drag and a capped turn-rate do the rest. Below a
  crawl the heading is free (a whale can pivot in place); above it, turns arc.
- **Surge (hold Shift):** thrust and top speed ramp up over ~1.6 s as momentum
  builds (`surge` 0→1), and bleed off over ~0.8 s when released. Costs extra
  breath and reserves. This is both the travel gear and the feeding move.
- **Tail-kick (tap Shift):** an instant burst in the current steer direction,
  0.85 s cooldown, small breath cost. For dodging and for punching through a
  swarm.
- **Surface & breach:** crossing y = 0 triggers spray, screen shake, and a
  breath top-up zone just under the surface. Ballistic arc above the water.
- **Buoyancy** pulls gently toward a shallow rest depth near the surface and
  fades out by ~45 m, so deep water is near-neutral and the whale can hover to
  feed.
- **Idle life:** a drifting whale keeps a slow forward glide and rides a
  depth-attenuated orbital swell, so it never hangs nose-up or dead-still.

## 5. Song / sonar

Song is one button (Space) and does three things at once:

1. **Reveals.** An expanding ring lights everything it sweeps — krill swarms
   (amber), fish schools (silver, *not food*), wild whales, and the seabed rim.
   The glow decays over a few seconds.
2. **Calls the pod.** A wild whale swept by a *friendly* ring may answer after a
   short delay, then has a limited window (~26 s) to be reached before it loses
   interest. Reaching it (swimming within ~60 m) recruits it.
3. **Chorus.** Followers within range sing along. Each extra voice increases
   ring strength (and reach) up to a cap — `strength = 1 + 0.34 × voices`,
   capped ~2.6. A lone whale's ring is short; a pod's ring covers the width of
   the screen.

Constraints: must be submerged, needs breath > ~8, ~1.6 s between sings. Ships
attenuate any ring that originates near them (×0.55 within ~600 m). Followers
also emit their own quiet rings on a timer.

An opening sing fires automatically ~1 s into the run to teach the mechanic.

## 6. The pod

State machine per wild whale: **wild → answered → following → lost**.

- **answered:** closes some distance on its own; reverts to wild if the window
  expires before you reach it.
- **following:** steers to a slot in the leader's wake (never traces the path).
  Slots fan out behind and to alternating sides. A follower that falls far
  behind sprints to catch up, then resettles.
- **hunger:** rises slowly; past a threshold a follower diverts to a nearby
  krill swarm and feeds, then rejoins. Fed whales hold formation; you don't
  micro-manage this, but a food-poor stretch will thin the pod.
- **lost:** sustained ship noise (see below) accrues stress; past a threshold
  the whale breaks off and drifts away. A lost whale far from the player
  reverts to wild and can be re-recruited.

## 7. Hazards & the world

- **Shipping lane.** Ships track along the surface in one mid-route zone. Their
  noise footprint makes followers dive and, if the player keeps the pod shallow
  and close to a ship, breaks whales off. Counter-play: take the pod deep and
  time the crossing between hulls.
- **Seabed.** A generated depth profile with legible regions (shelf, slope,
  plain, ridge, seamount, canyon, trench). Whales can't clip through it; the
  player bounces off with downward velocity.
- **Zones.** Five named stretches, each with its own water colour and mood:
  Continental shelf → The open blue → Shipping lane → Seamount chain → Warm
  water. Zone name and leg distance show in the HUD.
- **Light.** Full sun above ~90 m, gone by ~180 m. Krill lives below the light
  line, so feeding means going where you can't see without singing.

## 8. Win / loss & session

- **Win:** whale x reaches the finish line (~12 km).
- **Loss:** reserves hit 0.
- **Restart:** press **R** on the end card (a full reload — a fresh run of the
  same seeded world).
- **End card** tallies the run: whales answered, joined, lost to ship noise,
  still trailing at the end; swarms fed on; choruses sung.

Target run length: ~3–6 minutes depending on route and how much the player
detours to feed and recruit.

## 9. Difficulty & variants (design space)

The leg is data (`config/route.ts`) — start, finish, zones. Intended knobs for
future difficulty tiers or alternate legs, none of which require engine changes:

- leg length and zone layout
- krill density / swarm size (world spawn)
- ship count, speed, and lane width
- breath/reserve drain multipliers
- pod size available on the route

## 10. Controls

| Input | Action |
|---|---|
| **W A S D** / arrows | Swim (steer) |
| **Shift** (hold) | Surge — build speed and thrust |
| **Shift** (tap) | Tail-kick — burst in the steer direction |
| **Space** | Sing |
| **Esc** | Pause menu |
| **R** | Restart (on the end card) |
| Any key | Take the first breath / dismiss the title card |

## 11. UI / HUD

- **Top-left:** current zone name; leg progress (`X.X of 12.0 km`).
- **Goal line:** one sentence, per-leg.
- **Instruments:** breath meter, reserves meter, pod dot-count with the current
  drafting percentage.
- **Hint line (bottom-left):** a single transient coaching sentence, event-driven,
  fades after a few seconds. One-shot latches keep each hint to once per run.
- **Depth ruler (right edge):** a 2D-canvas gauge with the "light ends" line
  marked at 180 m and the seabed indicated.
- **Cards:** full-screen title card (concept + controls) and end card (result +
  tally). Same renderer, data-driven.
- **Pause menu:** resume, restart, save, load, options (volume), exit to title.

## 12. Audio

- **Ambient bed:** a low sine cluster (~46–92 Hz) through a heavy low-pass,
  faded in over the first seconds of a run.
- **Calls:** frequency-swept sines with a feedback delay for the ocean tail.
  Player song, pod replies, joins, tail-kick, and surface impacts each have
  their own sweep and level. Pod replies attenuate with distance.
- Master volume is an option; the audio context suspends on pause.

## 13. Art direction

- Flat, illustrative, near-monochrome water that shifts hue by zone; a warm
  amber accent for krill and a pale cyan for song and sonar returns.
- Whale bodies are drawn from a single profile curve sampled along the spine,
  so they bend and mirror without art assets.
- Additive bloom pass for all sonar-lit elements and song rings; a depth
  vignette and world-anchored darkness gradient below the light line.
- Marine snow parallax, god-rays near the surface, an animated waterline, and
  caustics.

---

# Part II — Technical Specification

## 1. Stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict), ES modules |
| Rendering | Pixi.js 8 (WebGL/WebGPU), plus one 2D `<canvas>` for the depth ruler and DOM for the rest of the HUD |
| Build / dev | Vite 6 |
| Lint / format | ESLint (typescript-eslint) + Prettier |
| Audio | WebAudio, hand-built graph |
| Persistence | `localStorage` |
| Optional | `@esotericsoftware/spine-pixi-v8` — installed for a future Spine-rigged whale body; not currently used |

Scripts: `npm run dev` (Vite), `npm run build` (`eslint` → `tsc` → `vite build`),
`npm run lint`.

## 2. Runtime shape

`main.ts` → `core/Game.ts` builds the world, the shared context, and an ordered
list of **systems**, then runs one `requestAnimationFrame` loop:

```
clock.tick(now)                         // dt clamped to 50 ms
  if ctx.running:
    for each system: system.update(dt, ctx)
  input.frameEnd()                      // consume keydown edges
  sync camera viewport, apply screen shake to the world container
  for each system: system.render(ctx)   // runs even while paused
```

- `ctx.running` is false until the first breath and false again after game over
  or while paused — so `update` stops but `render` keeps drawing the frozen
  frame.
- **Registration order in `Game.ts` is execution order.** Current order: input/
  physics → reactions → spine → camera → renderers → HUD.

### System interface (`core/System.ts`)

```ts
interface System {
  name: string;
  init?(ctx): void;       // once, after the context is assembled
  update?(dt, ctx): void; // simulation; skipped when not running
  render?(ctx): void;     // draw; every frame
  dispose?(): void;
}
```

A system implements any subset. `init`-only systems are pure wiring (event
listeners).

## 3. Decoupling seams

Systems never import each other. They share state through one context object and
communicate through one typed event bus.

| Seam | File | Rule |
|---|---|---|
| Shared refs | `core/GameContext.ts` | Every system reaches shared state/services here. Holds references only, no logic. |
| Messaging | `core/EventBus.ts` | Typed pub/sub. Add a mechanic's events to `GameEvents`; emit/listen. No existing system changes. |
| State | `state/*` | Plain data classes ("stores"), one per entity kind. No behaviour. |
| World gen | `world/*` | `Heightfield` (static seabed) + `WorldSpawner` (fills the stores). |
| Scene graph | `core/Layers.ts` | One named Pixi layer per visual concern; draw order is the `LAYER_ORDER` array. A renderer owns its layer and touches no other. |
| Whale pose | `core/SpineChain.ts` | The joint-chain backbone; the source of truth for every whale's pose. |
| Whale body | `render/whale/WhaleView.ts` | Interface for *drawing* a whale from its pose. `ProceduralWhaleView` is the implementation; swap it without touching simulation. |
| User-facing copy | `i18n/en.ts` + `i18n/index.ts` | Every HUD/card string goes through `t(key, params)`. `en.ts` is the source of truth. |
| Leg distance | `config/route.ts` | `LEG` owns start/finish/zones; helpers feed the HUD, the win line, and the end card. |
| Full-screen cards | `hud/Cards.ts` + `hud/cardContent.ts` | `Cards.show(CardContent)` renders any card into `#card`; builders produce the content. |

### GameContext

```ts
interface GameContext {
  app; bus; rng; clock; camera; input; layers; world;   // services
  whale; pod; krill; schools; ships; song; particles; stats;  // stores
  running: boolean;
}
```

### Event catalogue (`GameEvents`)

Lifecycle: `game:start`, `game:over {won}`, `game:restart`, `game:pause`,
`game:resume`, `game:save`, `game:load`.
Audio: `audio:volume`, `audio:call {f0,f1,dur,vol,delay?}`.
Song/pod: `song:emitted {x,y,strength,friendly,chorus}`, `pod:answered`,
`pod:joined`, `pod:lost`, `pod:chorus`.
Whale: `whale:surfaced`, `whale:submerged`, `krill:fed`.
HUD/FX: `hint:show {text,secs}`, `fx:shake`, `fx:bubbles`.

## 4. Systems

| System | update | Responsibility |
|---|---|---|
| `AudioSystem` | – | Owns the WebAudio graph. Ambient bed on `game:start`; renders `audio:call`; suspends on pause. |
| `WhaleMovementSystem` | ✓ | Player locomotion: thrust, surge/kick momentum, buoyancy, drag, turn-rate cap, terrain collision, surface crossings. Emits FX events. |
| `VitalsSystem` | ✓ | Breath, reserves, drowning, drafting discount, and the two run-ending checks (`energy ≤ 0`, `x ≥ world.finishX`). |
| `FeedingSystem` | ✓ | Lunge-feeding: while surging, converts nearby krill into reserves. |
| `SongSystem` | ✓ | The whole sonar mechanic: emit rings, propagate them, light what they sweep, schedule pod replies, decay the lit-seabed accumulator. |
| `PodSystem` | ✓ | Pod state machine and follower steering (wake anchor + leader-velocity match + catch-up + separation + seabed/surface avoidance + ship-dive + hunger detour). |
| `KrillSystem` | ✓ | Swarm rotation, diel vertical migration, balling-up under threat. Only steps swarms near the camera. |
| `SchoolSystem` | ✓ | Fish boids (cohesion/alignment/separation + whale avoidance). Cosmetic — not food. |
| `ShipSystem` | ✓ | Advances ships along the lane. Noise footprint is read by `PodSystem`. |
| `ParticleSystem` | ✓ | Bubble pool; integrates and culls. Listens for `fx:bubbles`. |
| `SpineSystem` | ✓ | After the player has moved: push the wake trail, tail-chase the backbone, apply the swimming undulation. |
| `CameraSystem` | ✓ | Lazy follow with velocity lead; zoom out with speed; decay screen shake. |
| `BackgroundRenderer` | render | Water column, sky, god-rays, marine snow, caustics, depth vignette, animated waterline. |
| `TerrainRenderer` | render | Seabed spline + lit rim. |
| `FaunaRenderer` | render | Krill dots and fish darts (ambient-lit). |
| `WhaleRenderer` | render | Every whale, via a `WhaleView`; whale-adjacent bubbles. |
| `ShipRenderer` | render | Hulls + faint noise footprint. |
| `GlowRenderer` | render | Additive bloom: lit seabed, lit fauna, song rings. |
| `Hud`, `DepthRuler`, `Hints`, `Cards`, `PauseMenu` | render / init | DOM + canvas HUD (see §8). |

### Determinism

`core/rng.ts` `Rng` is a seeded LCG stream (seed from `?seed=`, else
`DEFAULT_SEED`). World generation and any gameplay randomness draw from it.
Stateless hash-noise (`noise1`/`fbm`) is used for spatial drift and cosmetic
jitter so that camera culling or frame rate can't perturb the seeded sequence.
`Clock` clamps `dt` to 50 ms so a stall can't tunnel anything.

## 5. State stores (`state/`)

Plain classes, mutated in place by systems, serialized by `Snapshot`.

- **`PlayerWhale`** — position/velocity, `facing`, `breath`, `energy`,
  `drowning`, `alive`, `done`, `surge`, `strokeAmp`; `spineBase` + `spine`
  joint chains; `trail`.
- **`Pod`** — `PodWhale[]` with `state`, formation `slot`, `stress`, `hunger`,
  reply timers, and lazily-created spine chains. `followers()` helper.
- **`Fauna`** — `KrillStore` (`Swarm[]`: position, `baseY`, radius, `amount`
  0–100, `parts[]`, `panic`, `lit`) and `SchoolStore` (`School[]` of `Fish`).
- **`Hazards`** — `ShipStore`, `SongField` (`Ping[]`), `ParticleStore`
  (bubbles + marine snow).
- **`RunStats`** — end-card tally + one-shot hint latches (`once(key)`).
- **`Trail`** — the player's swum path: a point list, front stretch low-passed
  so it can't hold a turn sharper than a body could make. `pointBeside(dist,
  side)` gives pod formation anchors.

## 6. World generation (`world/`)

1. **`Wfc.ts`** — 1D wave-function collapse over the 7 terrain tiles in
   `config/tiles.ts` (each tile: depth band, roughness, weight; legal neighbours
   in `RULES`). Both route ends are pinned to `shelf`. Falls back to all-`plain`
   after 60 failed attempts.
2. **`Heightfield.ts`** — turns the tiling into a per-column depth profile:
   sample each cell's band, add two octaves of fbm scaled by roughness, then 4
   box-blur passes. Exposes `floorAt(x)`, `tileNameAt(x)`, `finishX` (from
   `LEG`), and `floorLit[]` (the sonar-lit seabed accumulator, decayed by
   `SongSystem`).
3. **`WorldSpawner.ts`** — fills the stores from the heightfield + rng: krill
   over upwelling (not on rock, below the light line), fish schools, one pod
   whale near the start plus a scattered line down the route, ships only in
   x ∈ [60 000, 92 000], and the marine-snow field. Blocks are independent.

Scale: `UNIT_M = 0.1` (1 unit = 10 cm). `WORLD_W = 120 000` (12 km). Whale
length 280 (28 m). Light: `DARK_START` 900 (90 m) → `DARK_FULL` 1800 (180 m).

## 7. Rendering

- **Layers** (`core/Layers.ts`), back to front: `sky, water, surface, shafts,
  snow, terrain, fish, krill, whales, ships, caustics, darkness (fill + grad),
  glow`; a screen-space `overlay` holds the vignette. Screen shake is applied to
  the world container, not per-layer.
- **Camera** (`core/Camera.ts`) owns the world↔screen transform (`sx`/`sy`),
  lazy-follows with a velocity-based lead, and eases zoom out as speed rises.
- **Whale pose** (`core/SpineChain.ts`): `SPINE_JOINTS` = 16. `chaseChain`
  constrains the rigid backbone to fixed segment lengths with a bending-
  relaxation pass. `applyUndulation` writes a *display* copy with the swimming
  wave layered on (amplitude from `strokeAmpFor(speed)`, interpolated) — the
  wave is never fed back into the rigid chain. Shared verbatim by the player
  whale (`SpineSystem`) and every follower (`PodSystem`).
- **Whale body** (`render/whale/`): `ProceduralWhaleView` draws from one profile
  curve (`profile(t)`, `BODY_END`) sampled along the spine; all fins/flukes are
  offsets in the local frame, so the body bends and mirrors for free.
  `SpineWhaleView` is a stub — implement its `draw()` and pass an instance to
  `new WhaleRenderer(view)` to switch to a Spine rig; the simulation is
  unaffected because `SpineChain` still produces the pose.
- **Depth darkness**: a world-anchored gradient (surface → 180 m) plus a solid
  fill below the light line; god-rays fade on the same `lightAt(y)` curve
  (`core/light.ts`).
- **Textures** (`render/textures.ts`) bakes CSS gradients into Pixi textures;
  `render/color.ts` blends packed colours.

## 8. HUD (`hud/`)

Mostly DOM, defined in `index.html`, driven each frame from the context.

- **`Hud`** — zone name, leg progress, breath/reserves meters, pod dots +
  drafting readout. Sets the per-leg goal line on `init`.
- **`DepthRuler`** — a dedicated 2D `<canvas>` on the right edge; redraws each
  frame with depth ticks, the "light ends" line at 180 m, and the seabed.
- **`Hints`** — the single transient coaching line; listens for `hint:show`.
- **`Cards`** — renders a `CardContent` (`{h1, body, start?, keys?}`) into
  `#card`. `titleCard()` on `init`; `endCard(ctx, won)` on `game:over`.
  `#card` keeps static English markup as a no-JS / boot-failure fallback.
- **`PauseMenu`** — owns `#menu`; localizes it on `init`; pause is expressed as
  `game:pause`/`game:resume` events.

## 9. Internationalization (`i18n/`)

- `t(key, params?)` looks up the active locale, falls back to English, then to
  the raw key; `{token}` slots are filled from `params`. `has(key)` tests
  existence; `plural(n, one, other)` is a trivial selector.
- Locale is chosen once at load from `?lang=` or `navigator.language`, first two
  characters, else `en`.
- `en.ts` is one flat `Record<string,string>` with dotted keys (`hud.*`,
  `zone.<id>`, `leg.<id>.*`, `card.*`, `menu.*`, `boot.*`). A new language is a
  sibling file with the same keys, added to `LOCALES` in `index.ts`; missing
  keys fall through to English.

## 10. Route config (`config/route.ts`)

`LEG` is the single source of truth for the leg's `startX`, `finishX`, and
`zones`. `legLengthKm()` and `kmCovered(x)` feed the HUD readout;
`Heightfield.finishX` returns `LEG.finishX` (the win line); `endCard` reads the
spelled distance from `leg.<id>.distanceSpelled` with a numeric fallback.
Multiple legs / difficulty tiers: turn `LEG` into `LEGS[]` plus a `resolveLeg()`
that reads `?leg=` or a setting — nothing downstream changes.

## 11. Pause & persistence

- **Pause:** `Escape` toggles. `Game` stops calling `update`; renderers keep
  drawing the frozen frame; `AudioSystem` suspends the context.
- **Save/Load** (`state/Snapshot.ts`): serializes only the *dynamic* run (whale,
  pod, krill amounts, school fish, ship positions, stats) to
  `localStorage["long-water:save"]`. The generated world is **not** saved — it
  rebuilds deterministically from the seed, so a save only loads against a
  matching `rng.seedValue` (and schema `VERSION`). Follower spine chains are
  dropped and re-seeded from the wake on load.
- **Options** (`localStorage["long-water:opts"]`): master volume, applied via
  `audio:volume`.
- **Restart** is a plain `location.reload()` (same seed, fresh run).

## 12. Extension recipes

**Add a mechanic:**
1. add a store in `state/`, wire it into `GameContext` + `Game` construction;
2. add its events to `GameEvents` in `core/EventBus.ts`;
3. add a `System` (sim) and/or renderer, register it in `Game.systems` in the
   right order slot;
4. if it draws, give it a layer in `core/Layers.ts`;
5. any string it shows the player goes in `i18n/en.ts`, read via `t(key)`.

No existing system imports yours, so nothing else changes.

**Add a terrain biome:** add a tile to `config/tiles.ts` and list its legal
neighbours in `RULES`. `Wfc`/`Heightfield` consume it unchanged.

**Add a card:** write another builder in `hud/cardContent.ts` and call
`cards.show(myCard())` from whatever triggers it.

**Swap the whale body:** implement `WhaleView.draw()` and construct
`WhaleRenderer` with it.
