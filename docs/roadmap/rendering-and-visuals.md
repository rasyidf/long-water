# Rendering and visuals

This doc is deliberately thin — the detailed work is already tracked in two existing docs. This
page only adds sequencing and the backlog items that fall *between* those docs.

## Existing deep-dive docs (don't duplicate here)

- **[whale-rendering-roadmap.md](../whale-rendering-roadmap.md)** — whale geometry, roll/lighting
  model, anatomy, and the Mesh+shader architecture question (#26). Actively maintained with dated
  progress entries; has its own "Next up" section (N1–N5) that is the current source of truth for
  what's next on the whale specifically.
- **[reef-and-wfc-notes.md](../reef-and-wfc-notes.md)** — coral rework (done, 5 kinds), a large
  backlog (§3: table coral, kelp forest, caustics, bioluminescence, etc.), and a fully-specified
  socket-based WFC rewrite (§4) for both terrain and reef zonation.

Treat those two as roadmap docs in their own right. Update them directly when that work
progresses; use this doc only for cross-cutting sequencing.

## Sequencing across the two

1. **`whale-rendering-roadmap.md` N2** (verify the roll rewrite in the real game, not just
   `/procgen.html`) is the single most time-sensitive item in either doc — it's a full rewrite of
   the whale's rolling cross-section model that has shipped to `main` (`1793a96`) without an
   in-game check. See `gameplay-and-content.md` §4.
2. **The socket-based WFC rewrite** (`reef-and-wfc-notes.md` §4) touches the same terrain system a
   level-builder tool (`gameplay-and-content.md` §1) would want to visualize. If both happen, do
   the WFC rewrite first — building a terrain visualizer against the *old* hand-written adjacency
   dict is wasted work if it's about to be replaced with socket-derived adjacency.
3. **Mesh + shader rewrite** (`whale-rendering-roadmap.md` #26) is gated on the frame-time
   measurement in `engineering-foundations.md` #3. Don't start it speculatively.

## Backlog items that don't fit either existing doc

These are world/atmosphere items from `reef-and-wfc-notes.md` §3 worth flagging because they're
independent of both the coral work and the whale work, and could be picked up opportunistically:

- **Colour absorption with depth** (reds drop out first) — a cheap tint LUT. Pairs naturally with
  the existing `core/light.ts` depth-darkness gradient; likely a small, self-contained change.
- **Kelp forest zone** — a new terrain-adjacent biome with its own parallax and light attenuation.
  Bigger than the other atmosphere items; probably wants its own zone entry once the level-builder
  tool (`gameplay-and-content.md` §1) makes adding a zone cheap.
- **Bioluminescence sparks below `DARK_START`** — thematically strong fit ("sound as the primary
  sense... the world is dark below the light line") but currently unscoped past one bullet point.

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
