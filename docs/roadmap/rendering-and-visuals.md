# Rendering and visuals

This doc is deliberately thin — the detailed work is already tracked in four existing docs. This
page only adds sequencing and the backlog items that fall *between* those docs.

## Existing deep-dive docs (don't duplicate here)

- **[whale-rendering-roadmap.md](../whale-rendering-roadmap.md)** — whale geometry, roll/lighting
  model, anatomy, and the Mesh+shader architecture question (#26). Actively maintained with dated
  progress entries; has its own "Next up" section (N1–N5) that is the current source of truth for
  what's next on the whale specifically.
- **[reef-and-wfc-notes.md](../reef-and-wfc-notes.md)** — coral rework (done, 5 kinds), a large
  backlog (§3: table coral, kelp forest, caustics, bioluminescence, etc.), and a fully-specified
  socket-based WFC rewrite (§4) for both terrain and reef zonation.
- **[squid-rendering-roadmap.md](../squid-rendering-roadmap.md)** — audit-only (2026-09-11, no
  rewrite yet) bringing the squid up to the whale's quality bar: 15 numbered issues, the sharpest
  being no `geometry.ts`/test split (#3/#14, mirrors whale's old #27) and no depth-based dimming
  despite the squid's whole design being "lurks in the dark, seen by its glow" (#2).
- **[ocean-rendering-roadmap.md](../ocean-rendering-roadmap.md)** — audit-only (2026-09-11, no
  rewrite yet) for the "ocean doesn't feel as atmospheric as the whale" gap: 16 numbered issues.
  Headline finding: the sky/surface math already has a full 6-keyframe day/night cycle, sun-relative
  lighting, and per-facet detail — but `BackgroundRenderer` never advances `timeOfDay` from the game
  clock (#1), so the game has been stuck rendering one frozen "early afternoon" instant the entire
  time. Most of the fidelity gap is a wiring bug, not missing art.

Treat all four as roadmap docs in their own right. Update them directly when that work
progresses; use this doc only for cross-cutting sequencing.

## Sequencing across the docs

1. **`ocean-rendering-roadmap.md` Phase 1** (#1, #2, #16 — wire `timeOfDay` to the game clock) is
   now the single cheapest, highest-leverage item across every rendering doc: it's a 3-4 hour fix
   that unblocks a day/night system, sun-relative lighting, and palette variety that are already
   built and unit-tested but have never been reachable in actual play. Do this before judging
   whether the ocean needs more art — most of what reads as "flat" is this bug, not missing work.
2. **`whale-rendering-roadmap.md` N2** (verify the roll rewrite in the real game, not just
   `/procgen.html`) is the most time-sensitive whale-specific item — it's a full rewrite of the
   whale's rolling cross-section model that has shipped to `main` (`1793a96`) without an in-game
   check. See `gameplay-and-content.md` §4.
3. **`squid-rendering-roadmap.md`** has no dependency on the other three — its Phase 1 (#1 tentacle
   overlap, #2 depth-based dimming) can start any time.
4. **The socket-based WFC rewrite** (`reef-and-wfc-notes.md` §4) touches the same terrain system a
   level-builder tool (`gameplay-and-content.md` §1) would want to visualize, and is also a
   prerequisite for legible reef-gameplay risk/shelter zones (`reef-gameplay-options.md`, options
   B/C). If any of those land, do the WFC rewrite first — building against the *old* hand-written
   adjacency dict is wasted work once it's replaced with socket-derived adjacency.
5. **Mesh + shader rewrite** (`whale-rendering-roadmap.md` #26) is gated on the frame-time
   measurement in `engineering-foundations.md` #3. Don't start it speculatively. The equivalent
   ocean item (`ocean-rendering-roadmap.md` #14) is explicitly lower-priority than the whale's —
   measure after #1 ships, since a static sky may not be worth Mesh-ing at all.

## Graphics quality settings (shipped 2026-09-11)

`src/state/Quality.ts` is the one store for fidelity-vs-frame-rate. Three presets (low / medium /
high) plus every individual dial, exposed in the shared Options panel — reachable from the title
screen and the pause menu — so a low-end machine can switch the expensive blocks off one at a time
mid-run. Renderers read `quality()` every frame; the two renderer-level settings (render scale,
glow bloom) go through `onQuality`. Persists to `localStorage["long-water:quality"]`; the first
run picks a preset from a coarse device sniff. The dev tools pin `high` via `overrideQuality`
without touching the saved choice.

What the dials drive:

| dial | where it lands |
|---|---|
| render scale | `Game` sets `renderer.resolution` live — the biggest lever on an integrated GPU |
| glow bloom | `Layers.setBloom` swaps the blur filter in / out |
| god-rays, caustics, clouds, stars & gulls, foam / glitter / spray, sunlit water | `BackgroundRenderer.effective()` scales the ocean params and `visible()` gates whole draw blocks |
| drifting silt, thermocline, marine snow, bioluminescence | same, on the `water` group |
| creature detail | `ProceduralWhaleView` / `ProceduralSquidView` LOD ramps × `detailK` |
| reef detail | `ProceduralCoralView` LOD ramp × `detailK` |
| far ridge & rubble | `TerrainRenderer` skips the parallax ridge and the scree |

Adding a dial: one field in `QualitySettings`, a value in each preset, a row in `QUALITY_ITEMS`,
a `quality.<key>` string, and the read in whichever renderer it drives. The options panel builds
itself from `QUALITY_ITEMS`.

## Backlog items that don't fit any existing doc

- **Kelp forest zone** (`reef-and-wfc-notes.md` §3) — a new terrain-adjacent biome with its own
  parallax and light attenuation, straddling both the reef and the water-column docs. Bigger than
  the other atmosphere items; probably wants its own zone entry once the level-builder tool
  (`gameplay-and-content.md` §1) makes adding a zone cheap.

Colour absorption with depth and bioluminescence (formerly listed here) are now tracked as
`ocean-rendering-roadmap.md` #9 and #13 respectively — update those, not this list.

## Unresolved architecture question: `SpineWhaleView`

`ARCHITECTURE.md` §1 lists `@esotericsoftware/spine-pixi-v8` as "installed for a future
Spine-rigged whale body; not currently used," and `render/whale/SpineWhaleView.ts` is an
acknowledged stub (`ARCHITECTURE.md` §7: "implement its `draw()`... to switch to a Spine rig").
Given how much recent investment has gone into the procedural model (two full rewrites tracked in
`whale-rendering-roadmap.md`, both aiming for real anatomical fidelity), it's worth an explicit
decision rather than leaving both paths open indefinitely: is Spine still the long-term plan, or
has the procedural model's quality bar made it unnecessary? If the latter, the dependency and the
stub are worth removing to reduce surface area; if the former, it should be scheduled rather than
left as a permanent "someday."
