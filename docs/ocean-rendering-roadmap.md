# Ocean Rendering Issues & Roadmap

A comprehensive tracking document for ocean/sky/surface rendering bugs, quality
gaps, and architectural work, written to the same rigor and format as
[docs/whale-rendering-roadmap.md](whale-rendering-roadmap.md). The user complaint
this doc answers is a fidelity gap, not a specific crash: the ocean doesn't read
as detailed or atmospheric as the whale. Every issue below points at a concrete
line, a missing capability, or a mechanically describable mismatch — not a
generic "make it prettier" note.

**Primary files:**
- [src/render/ocean/OceanView.ts](../src/render/ocean/OceanView.ts) — the Pixi
  translation layer: sky dome, waterline, god-rays, caustics
- [src/render/ocean/sky.ts](../src/render/ocean/sky.ts) — pure sky/light procgen
  (palette keyframes, sun/moon arc, clouds, stars, birds)
- [src/render/ocean/surface.ts](../src/render/ocean/surface.ts) — pure Gerstner
  wave field, foam, glitter, caustic foci
- [src/render/ocean/params.ts](../src/render/ocean/params.ts) — the one live
  `OceanParams` object the game reads, plus the dev-tools override hook
- [src/render/ocean/presets.ts](../src/render/ocean/presets.ts) — named sea
  states for the procgen viewer only
- [src/render/BackgroundRenderer.ts](../src/render/BackgroundRenderer.ts) — owns
  the in-game `OceanView` instance; also owns the deep-water gradient, depth
  darkness and vignette that sit below/behind it

Related: [docs/reef-and-wfc-notes.md](reef-and-wfc-notes.md) §1 (waterline/seabed
seam fixes already shipped — not re-flagged here) and §3 (an un-scoped
surface/water-column backlog, folded into the numbered sections below with
cross-references back to "§3" so it doesn't fork into a second source of truth).

---

## Current State

The wave field and sky are already better-engineered than they look at a glance:

- **The surface curve is not sampled from a spine and interpolated — it's
  evaluated exactly at every traced point.** `surfacePoint` (surface.ts:132-159)
  is a closed-form Gerstner sum; `traceSurface` (surface.ts:189-245) calls it
  fresh at each `u`, so the curve itself has none of the piecewise-constant-tangent
  kink the whale hull had before its fix (whale doc #5) — the *math* is smooth,
  arc-length-adjacent already.
- **The sky already does a screen-space "light from above" split**, the same
  strategy the whale roadmap introduced for its roll/lighting rewrite:
  `skyLight()` (sky.ts:201-211) returns one direction (`ax`, `altitude`, `lean`)
  that `drawDisc`, `drawClouds`' lit caps, `drawShafts`' lean, and `glints`' aim
  all read consistently, so the sun's position agrees everywhere it's used.
- **Palette is a real 6-keyframe day cycle** (`KEYS`, sky.ts:88-155), not a
  single tint — night, dawn, noon, dusk and their in-betweens are all
  art-directed states, with stars, a moon phase, haze and glitter all gated off
  the same `daylight`/`timeOfDay` values.

The gap is that almost none of this is reachable during actual play, and the
parts that are reachable (the wave surface itself: foam, slabs, the crest
outline) get comparatively little of the per-facet shading and per-instance
variety the whale's hull does. The sections below are ordered the same way the
whale doc's are: things that are simply wrong first, then quality gaps, then
lighting-model gaps, then missing polish/features, then architecture.

---

## Bugs (Breaking/Visual Corruption)

### 1. Time-of-day never advances during play — the day/night system is inert
- **Status:** ☐ Not started
- **Severity:** High — this is most of why the ocean reads as flat next to the whale
- **Description:** `BackgroundRenderer.render()` calls `oceanParams()`
  (params.ts:93) every frame, which returns the module-level `active` object —
  and `active` only ever changes via `setOceanParams()` (params.ts:96-98), which
  is called exclusively from the dev-tools ocean designer
  (`src/tools/viewer/designers/Ocean.svelte:104`, which advances
  `params.sky.timeOfDay` on its own clock). Nothing in the game loop calls it.
  So `BackgroundRenderer` always renders `OCEAN_DEFAULTS`
  (params.ts:45-88), permanently pinned at `sky.timeOfDay: 0.543` (params.ts:67)
  — one fixed "early afternoon" hour, forever. The entire 6-keyframe palette,
  the moonrise, the stars, the warm dawn haze, and the sunset flare on the disc
  all exist and are unit-tested (`sky.test.ts`), but are inaccessible outside
  `tools.html#ocean`.
- **Fix:** Either advance `active.sky.timeOfDay` from the game clock inside
  `BackgroundRenderer.render()` (mirroring `Ocean.svelte`'s `dt / dayLength`
  update), or make it advance on a slower deliberate cycle tied to level
  progress. Decide first whether a full day/night cycle is even the intended
  play experience — if the answer is "no, it should always be afternoon," this
  should be a documented, deliberate constant rather than a dial that silently
  never turns.
- **Impact:** Unblocks #8, and is a prerequisite for #6/#9 mattering visually.

### 2. God-ray shafts originate from a flat sea-level line, not the traced wave surface
- **Status:** ☐ Not started
- **Severity:** Medium — visible seam between two things that should be one surface
- **Description:** `drawShafts` (OceanView.ts:465-522) computes its origin as
  `const y0 = cam.sy(0);` (line 477) — a perfectly flat line — and never reads
  `this.samples` (the wavy trace `drawSurface` produced and cached, see the
  class-level comment at OceanView.ts:78-82). Every other near-surface effect
  that needs the true waterline uses that trace: `drawCaustics` explicitly
  requires it be called after `drawSurface` "so the bright filaments stay locked
  to the troughs overhead instead of sliding on their own clock" (OceanView.ts:524-529).
  Shafts skip this, so at any nonzero wave height the ray tops sit at a
  constant screen Y while the drawn crest right above them rises and falls —
  a visible mismatch between the god-rays' apparent point of entry and the
  waterline that's supposedly casting them.
- **Fix:** Sample `surfaceHeightAt(p.wave, wx, t)` (surface.ts:166-170) — or
  reuse the nearest cached `this.samples` entry — for each shaft's origin `y`,
  the way `drawCaustics` already keys off the shared trace.
- **Testing:** Set a large `wave.height` / `steep` in the procgen viewer and
  watch the shaft tops against the crest line.

---

## Geometry / Visual Quality

### 3. Straight-chord sampling facets the crest at high `steep`
- **Status:** ☐ Not started
- **Severity:** Medium — same root-cause class as the whale's tangent-kink bug (whale doc #5), different mechanism
- **Description:** `traceSurface` samples the Gerstner curve at a fixed spacing
  of roughly `(vx1-vx0)/14` world units (OceanView.ts:316), then `traceTop`/
  `traceBand` (OceanView.ts:321-329) connect the samples with plain `lineTo`
  segments — straight chords. `steep` (surface.ts:44) pulls points horizontally
  toward the crest to cusp it; the closer `steep` gets to 1 (the "gale" preset
  uses 0.92, presets.ts:63), the sharper the true curvature at the crest tip —
  exactly where the fixed ~14-unit linear sampling is coarsest relative to how
  tight the cusp has become. The apex reads as a faceted/chamfered point rather
  than a sharp cusp. The whale's #5 was a piecewise-constant *tangent* causing
  kinks at spine joints; this is a piecewise-*linear* approximation of a curve
  whose curvature is highest exactly at the point being approximated — same
  "discrete samples, no smoothing between them" shape of problem.
- **Fix:** Either density-adapt the sample spacing near high local `steepness`
  (`SurfaceSample.steepness`, surface.ts:178), or add a light `quadraticCurveTo`
  pass between samples the way `cloudOutline` traces cloud shoulders (sky.ts:352-382,
  `steps = 44` over a much smaller shape) rather than raw `lineTo`.
- **Testing:** Procgen "gale" preset, zoomed in on one crest.

### 4. Sunlit slab bands read as visible steps, not a gradient
- **Status:** ☐ Not started
- **Severity:** Medium — same shape of problem as the whale's hard-edged countershade bands (whale doc #16)
- **Description:** `drawSurface`'s slab pass (OceanView.ts:336-354) draws
  `n2 = Math.round(p.column.slabs)` nested copies of the wave trace, each offset
  deeper, with alpha `p.column.slabAlpha * Math.pow(1 - k / (n2 + 0.6), 2.1) * (…)`.
  With the shipped default `column.slabs: 3` (params.ts:80), the three bands'
  alpha multipliers work out to roughly 1.0, 0.51, 0.17 — a ~49% drop between
  the first and second band alone. Because each band is the *same* wavy shape
  offset by a fixed depth, the boundary between bands is a parallel wavy line,
  not a blend; at only 3 steps the brightness discontinuity across that line is
  large enough to read as a visible nested-shell edge instead of light
  dissolving into the column, which is exactly what the doc comment right above
  it (OceanView.ts:337-338) says it's trying to avoid.
- **Fix:** Either raise `slabs` enough that consecutive steps fall under
  perceptual threshold (the sky dome uses 44 bands for the same reason,
  OceanView.ts:115), or replace the stacked-fills approach with one
  alpha-gradient fill (a `FillGradient`/`Texture` the way `waterTex` already
  does for the deep column, BackgroundRenderer.ts:24-41) so the underwater band
  is a true gradient instead of `n2` flat layers.

### 5. One global wave/sky seed for the whole route — no regional variety
- **Status:** ☐ Not started
- **Severity:** Low–Medium — the ocean-wide analogue of the whale's now-fixed "every whale had identical mottling" (whale doc #19)
- **Description:** `OCEAN_DEFAULTS.wave.seed` and `.sky.seed` are both the fixed
  literal `1337` (params.ts:47, 66), and there is exactly one live `OceanView`
  (`BackgroundRenderer`'s `private ocean = new OceanView()`, BackgroundRenderer.ts:18)
  rendering it for the whole route. `LevelZone` (world/level/schema.ts:25-35)
  only carries `shelf`/`deep` gradient colours and `tempC` — no wave or sky
  seed field — so every zone from the shallow shelf to the trench shows the
  *identical* swell arrangement, cloud layout, and star field, differing only
  in the baked deep-water gradient's hue. Compare to the whale, where every pod
  member gets its own `opts.seed = (w.ph * 131 + b.len) | 0` (WhaleRenderer.ts:60)
  so no two whales' mottling matches.
- **Fix:** Derive `wave.seed`/`sky.seed` (or just a swell-phase offset) from the
  zone id or world-x band, so different stretches of the route are recognizably
  different seas rather than the same sea repainted.

---

## Lighting

*The whale's strategy was splitting "light from above" (screen-space) from
anatomy (body-space) so the sheen and shadow stay coherent through a roll. The
sky already does a version of this (Current State, above); the water body
mostly doesn't.*

### 6. The wave surface has no sun-relative shading gradient across its body
- **Status:** ☐ Not started
- **Severity:** Medium
- **Description:** The whale's hull gets a continuous screen-space blend —
  `cSheen`/`cShadow` (ProceduralWhaleView.ts:119-120) — that shades the *entire*
  silhouette by how it sits relative to overhead light. The water surface has
  no equivalent: the two crest-outline strokes (OceanView.ts:386-401) are each
  one flat colour for the *whole visible waterline* regardless of local facet
  angle, and the slab fills (#4) are keyed only to depth, not to whether that
  patch of water is tilted toward or away from the sun. The only thing on the
  water body that reads local facet angle relative to light at all is `glints`
  (surface.ts:299-324), which is deliberately sparse (a "specular path", not a
  fill) — it gates on `aim <= 0.05` (surface.ts:313) and a 62%-threshold
  flicker (surface.ts:319), so most of the surface never lights up through it.
  There is no broad "the near side of every wave face is a little brighter"
  pass underneath the sparkle.
- **Fix:** Add a low-cost per-sample brightness term to the crest stroke/apron
  fill — e.g. modulate colour or alpha by `1 - clamp01(|slope - sunLean| / k)`
  the same way `glints`' `aim` is computed (surface.ts:313), just continuous
  and dim rather than gated to a threshold-and-flicker sparkle.

### 7. Foam and spray colours are hardcoded, ignoring the sky palette
- **Status:** ☐ Not started
- **Severity:** Low–Medium
- **Description:** The foam fill/stroke and spray droplets use literal
  `0xe8f5f1` (OceanView.ts:416), `0xffffff` (OceanView.ts:422), and `0xffffff`
  again (OceanView.ts:450) — none derived from `pal`. Every other tinted effect
  in the same file *does* derive from the current palette: caustics use
  `mixColor(0x92e8dc, pal.disc, 0.2)` (OceanView.ts:548) and shafts use
  `mixColor(0x78d6c8, pal.glow, 0.35)` (OceanView.ts:486). The practical result:
  a whitecap at the "moonlit" preset (presets.ts:99-112, near-black sky, cool
  moon-lit palette) is exactly as bright/white as one at noon — foam is the one
  surface effect immune to the mood the rest of the scene sets.
- **Fix:** Blend the foam/spray base colour toward `pal.cloudLit`/`pal.glow` the
  way shafts and caustics already do.

### 8. Deep-water colour grading is baked once and stays palette-blind
- **Status:** ☐ Not started
- **Severity:** Medium–High — directly explains why "the sea doesn't feel atmospheric"
- **Description:** `BackgroundRenderer.init()` bakes three gradient textures
  from fixed hex/rgba stops: the per-zone `waterTex` (BackgroundRenderer.ts:24-41,
  shelf→deep→near-black stops), `L.vignette`'s texture (BackgroundRenderer.ts:43-53),
  and `L.darkGrad`'s texture (BackgroundRenderer.ts:58-71) — all built once and
  never touched again. The only per-frame adjustment is a single scalar
  lightness blend on the water sprite's tint:
  `L.waterSprite.tint = mixColor(0x39465c, 0xffffff, 0.3 + 0.7 * day)`
  (BackgroundRenderer.ts:100) — `day` can brighten or dim the column, but the
  *hue* it blends toward is the same fixed cool grey-blue (`0x39465c`) whether
  `skyPalette` above the waterline is doing dawn orange, midday teal, or
  midnight navy (`KEYS`, sky.ts:88-155). So the sky and the water column run on
  two independent colour systems that only loosely agree via one brightness
  scalar — the water never actually shifts hue toward the sky's mood the way a
  real sea does. This is visible today in the procgen viewer with the "dawn"
  preset (presets.ts:84-98): the sky goes warm, the water stays cool. It will
  matter in-game the moment #1 is fixed.
- **Fix:** Either tint `L.waterSprite`/`L.darkGrad`/`L.vignette` toward
  `pal.water`/`pal.horizon` (already computed every frame in `OceanView`) instead
  of a fixed hex, or accept the deep column deliberately stays neutral and
  document why — right now it reads as an oversight, not a choice.
- **Depends on:** #1 (won't be visible in actual play until time-of-day moves)

### 9. No colour-absorption-with-depth tint (reds drop out first)
- **Status:** ☐ Not started
- **Severity:** Low–Medium
- **Description:** [reef-and-wfc-notes.md §3](reef-and-wfc-notes.md#3-backlog--what-else-the-reef--stage-can-take)
  lists "Colour absorption with depth (reds drop out first) — a cheap tint LUT"
  as backlog. Confirmed still absent: `lightAt()` (core/light.ts:12-17), the
  only depth-driven lighting function shared across whale/terrain/coral/ocean
  renderers, returns a single scalar brightness — no hue. Nothing in
  `BackgroundRenderer`, `OceanView`, `WhaleRenderer`, or `TerrainRenderer`
  applies a depth-keyed colour shift; everything just gets darker or more
  transparent (`lightAt(y) * k` patterns throughout, e.g.
  WhaleRenderer.ts:35, FaunaRenderer.ts:24, CoralRenderer.ts:44,
  TerrainRenderer.ts:141/213). Real underwater light loses red first, then
  orange, well before overall brightness drops enough to explain it — this is
  the single cheapest "reads as real water" cue the game doesn't have.
- **Fix:** A small depth→tint LUT (or a 2-3 stop `mixColor` toward a cool hue as
  `y` increases) applied wherever `lightAt` currently only scales alpha; start
  with the shared gradient textures in `BackgroundRenderer` since they're
  already per-depth by construction.

---

## Visual Artifacts & Polish

*The following four items are [reef-and-wfc-notes.md §3](reef-and-wfc-notes.md#3-backlog--what-else-the-reef--stage-can-take)'s
"Surface & water column" backlog, carried forward here rather than left to fork
into a second list. §3 also names "Colour absorption with depth" and
"Bioluminescence" alongside these — absorption is #9 above; bioluminescence is
#12 below.*

### 10. Sky time-of-day gradient + sun disc glint — already built, just unreachable
- **Status:** ☐ Not started (wiring, not building)
- **Severity:** Info/Low
- **Description:** §3 lists "Sky: time-of-day gradient, a sun disc with a moving
  specular glint band" as backlog, but both already exist in code:
  `skyPalette`'s 6-keyframe gradient (sky.ts:169-180) and `drawDisc`'s flare +
  crescent-moon rendering (OceanView.ts:168-196), plus `glints`' specular path
  (surface.ts:299-324). Nobody should re-implement this — the gap is entirely
  #1 (it's never seen moving in play). Leaving this note so the backlog item
  doesn't get picked up as new work.
- **Fix:** None needed here beyond #1.

### 11. Floating kelp mats / debris at the waterline; rain dimpling in storms
- **Status:** ☐ Not started
- **Severity:** Low — net-new feature, not a fix
- **Description:** §3 backlog item, confirmed absent — no `kelp`, `debris`, or
  `rain` code anywhere under `src/render/` or `src/systems/` (repo-wide grep
  turned up nothing but unrelated substring matches). At present the waterline
  is wave geometry + foam only; nothing rides on top of it or falls through it.
- **Fix:** Scope as its own feature — likely a small particle/sprite layer
  riding `traceSurface`'s samples for kelp/debris bob, and a screen-space
  dimple/ripple pass gated on a `weather` param for rain, analogous to how
  `foamRuns` already derives whitecap extents from the trace.

### 12. Thermocline shimmer layer at ~600 world units
- **Status:** ☐ Not started
- **Severity:** Low — net-new feature
- **Description:** §3 backlog item ("one faint refraction-shimmer layer at
  ~600 u"), confirmed absent — no `thermocline` reference anywhere in `src/`.
  `ColumnParams` (params.ts:16-31) has slabs/shafts/caustics but nothing keyed
  to a fixed depth band.
- **Fix:** A cheap fbm-driven horizontal displacement or alpha-shimmer band,
  similar in spirit to `shaftWisp` (sky.ts:490-496), gated to a depth window
  around 600 world units.

### 13. Bioluminescence sparks below `DARK_START`
- **Status:** ☐ Not started
- **Severity:** Low — net-new feature
- **Description:** §3 backlog item, confirmed absent — no `bioluminesc*` match
  anywhere in `src/`. The existing "marine snow" particle field
  (`ctx.particles.snow`, drawn in `BackgroundRenderer.render()` lines 116-130)
  is dust motes, not light sources; it doesn't emit or vary with `DARK_START`/
  `DARK_FULL` (config/constants) the way bioluminescence should.
- **Fix:** A sparse additive-particle pass gated on `lightAt(y)` dropping below
  a threshold, likely sharing the `snow` field's parallax/wrap logic
  (BackgroundRenderer.ts:116-130) rather than a new particle system.

---

## Architecture & Performance

### 14. Every ocean layer is `Graphics`, fully retriangulated every frame
- **Status:** ☐ Not started
- **Severity:** Medium — same class of cost as the whale's Mesh proposal (whale doc #26)
- **Description:** `drawSky`, `drawSurface`, `drawShafts`, and `drawCaustics`
  (OceanView.ts) each `g.clear()` and rebuild from scratch every call, and
  `BackgroundRenderer.render()` calls all four unconditionally every frame. The
  sky dome alone is 44 filled rects (OceanView.ts:115-126) plus however many
  cloud-bank polygons are in view, redrawn and re-earcut'd even though, absent
  #1, the palette and cloud drift are the only things that ever change frame to
  frame — the dome gradient itself is currently static in practice.
- **Fix:** Lower priority than the whale's Mesh rewrite (this isn't the CPU
  bottleneck candidate the whale's hull tessellation was), but worth the same
  "measure before optimizing" pass once #1 is wired — a moving sky is the case
  where redrawing every frame is actually necessary; right now it's arguably
  wasted work every frame regardless.

### 15. Per-frame procedural allocation in cloud/caustic/glint/foam generation
- **Status:** ☐ Not started
- **Severity:** Medium — GC pressure, the ocean analogue of the whale's "zero garbage" bug (whale doc #3)
- **Description:** Unlike `OceanView`'s own internals (which do reuse buffers —
  `this.samples`, `this.scaled`, `this.body`/`this.lit`, see the class comment
  at OceanView.ts:74-77), the pure functions it calls each frame allocate fresh
  output every time: `cloudBanks` (sky.ts:291-328) builds a new `CloudBank[]`
  and calls `cloudPuffs` (sky.ts:254-281) for each bank, itself allocating a new
  `CloudPuff[]`; `causticCells` (surface.ts:348-377), `glints` (surface.ts:299-324),
  and `foamRuns` (surface.ts:260-283) all return fresh arrays (with fresh
  element objects, for the first two) on every call. `drawClouds` runs this
  every frame from `drawSky` (OceanView.ts:198-244) with no caching. Unlike the
  whale's bug #3, nothing here claims to be garbage-free, so this isn't a
  broken promise — but it's a real, uninvestigated cost, and likely larger than
  the whale's per-whale lambda allocations since it scales with viewport width
  × cloud-cover × decks.
- **Fix:** Pool `CloudBank`/`CloudPuff`/`CausticCell`/`Glint`/`FoamRun` arrays
  the same way `traceSurface` already pools `SurfaceSample[]` (surface.ts:195,
  201-203), and measure GC pause impact before/after per the whale doc #3
  playbook.

### 16. No runtime hook for per-zone/per-region parameter variation
- **Status:** ☐ Not started
- **Severity:** Low–Medium — architectural precondition for #5 and #1
- **Description:** `setOceanParams`, `OCEAN_PRESETS`, and the time-of-day
  advance are all dev-tools-only entry points (`params.ts:96-98`'s doc comment:
  "Dev tools only… The game never calls this"; `presets.ts`'s header: "for the
  procgen playground"). There is currently no path from "the whale just entered
  zone X" or "N minutes have passed" to a change in `active` at all — the game
  always renders one static `OceanParams` object for the whole run. Fixing #1
  and #5 both require *some* version of this hook to exist in the shipped game,
  not just the tool.
- **Fix:** A minimal non-dev entry point — even just
  `BackgroundRenderer` mutating a private live copy of `OCEAN_DEFAULTS` each
  frame (time-of-day tick, zone-derived seed) rather than reading the frozen
  constant via `oceanParams()` — unblocks both #1 and #5 without exposing the
  full dev-tools surface to the game.

---

## Work Plan Suggestions

### Phase 1: Wire what already exists (#1, #2, #16)
Advance `timeOfDay` from the game clock (or a deliberate policy), fix the
shaft/surface origin mismatch, and add the minimal non-dev hook that lets
`BackgroundRenderer` mutate live params instead of reading the frozen default.
This alone reactivates most of the day-cycle richness described in "Current
State" without touching any drawing code.
- Estimated effort: 3–4 hours
- Blocker for #8's visual payoff and for #5

### Phase 2: Geometry smoothing (#3, #4)
Density-adapt or curve-smooth the crest trace at high `steep`; replace the
3-step slab bands with a true gradient or enough steps to hide the seams.
- Estimated effort: 2–3 hours

### Phase 3: Lighting parity with the whale (#6, #7, #8, #9)
Add a continuous sun-relative shading term to the water body (not just the
sparse glitter dashes), tie foam/spray colour to the palette, reconcile the
deep-water gradient's hue with `skyPalette`, and add the depth colour-absorption
LUT §3 already asked for.
- Estimated effort: 5–7 hours — the biggest single lever on "does the ocean feel
  as atmospheric as the whale," and mostly blocked on Phase 1 to be visible at all

### Phase 4: §3 backlog features (#11, #12, #13)
Kelp/debris + rain, thermocline shimmer, bioluminescence. Each is net-new, not
a fix, and can ship independently.
- Estimated effort: 2–3 hours each (kelp/debris + rain is closer to 4–5, being
  two features)

### Phase 5: Regional variety + architecture (#5, #14, #15)
Seed variation per zone (needs Phase 1's hook), pool the per-frame allocations
in `sky.ts`/`surface.ts`, and re-measure whether the all-`Graphics` redraw is
worth optimizing once the sky is actually moving every frame.
- Estimated effort: 3–4 hours for pooling + seed wiring; the `Graphics`→Mesh
  question is a "measure first" item, not yet worth committing hours to

---

## Tracking

Use checkboxes above to mark progress. Update status from "Not started" → "In
progress" → "Done" as you work.

For complex items, consider opening a GitHub issue linked back to this doc.

**Last updated:** 2026-09-11 (initial audit, no rewrite has happened yet)
