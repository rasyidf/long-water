# Squid Rendering Issues & Roadmap

A tracking document for bringing the deep-water squid's procedural rendering up
to the same quality bar as [`src/render/whale/`](../docs/whale-rendering-roadmap.md)
reached after its two rewrites. This is an **audit only** — nothing in
`src/render/squid/` or `src/render/SquidRenderer.ts` has been changed as part
of writing this doc. Issues are ordered the same way the whale doc orders
them: correctness first, then geometry quality, then pose/lighting, then
visual polish, then architecture.

**Primary files:**
[src/render/squid/ProceduralSquidView.ts](../src/render/squid/ProceduralSquidView.ts),
[src/render/squid/SquidView.ts](../src/render/squid/SquidView.ts),
[src/render/SquidRenderer.ts](../src/render/SquidRenderer.ts)

**Context files:** [src/config/squid.ts](../src/config/squid.ts) (tuning),
[src/state/Squid.ts](../src/state/Squid.ts) (state shape driving the view),
[src/render/CreatureView.ts](../src/render/CreatureView.ts) (shared seam both
whale and squid views implement), [src/render/GlowRenderer.ts](../src/render/GlowRenderer.ts)
(squid's photophore/eye-shine additive pass — the one other file that draws
squid geometry).

Squid **systems** (`src/systems/SquidSystem.ts`, `src/systems/squid/`) are out
of scope. This is a rendering audit only.

---

## Current State

`ProceduralSquidView.draw()` is one 227-line method (plus a private
`drawArms` helper) that does everything the whale's rewrite deliberately
split apart: local-frame shape math, camera projection, and `Graphics`
drawing are all interleaved in one pass, with no `geometry.ts` and no tests.
Concretely, relative to the whale's current (post-rewrite) state:

- **No geometry/Pixi split.** Every offset (`mw * 0.62`, `mw * 0.9`, arm fan
  angles, bezier control points) is computed inline against `X`/`Y` screen
  projector closures. There is no `src/render/squid/geometry.ts` and no
  `geometry.test.ts` — squid shape math has zero test coverage today, vs. the
  whale's 55 vitest cases.
- **No roll/pitch axis at all.** `Squid` ([src/state/Squid.ts:29-63](../src/state/Squid.ts))
  carries a `heading` (yaw) but no roll or pitch field, and the view projects
  local `(along, across)` coordinates through a single 2D rotation
  (`ca`/`sa`, [ProceduralSquidView.ts:36-40](../src/render/squid/ProceduralSquidView.ts)).
  There is no counterpart to the whale's offset-ellipse cross-section
  (`computeSection`/`rollBasis`/`edgeTop`/`edgeBot` in `whale/geometry.ts`).
  Whether the squid needs one is a design question (see issue #8), but today
  there is literally no body-space vs. screen-space distinction for lighting,
  because there is no lighting model.
- **Rigid, not simulated.** The squid has no spine/chain — it's a point
  (`x`, `y`) plus `heading`, `jet` phase, and `flare`. This sidesteps the
  whole class of whale bugs around arc-length parameterization and degenerate
  spine segments (whale #4, #6) — there's no spine to degenerate — but it
  also means there is no mechanism today for body deformation beyond the
  fixed `MANTLE`/`MANTLE_W` constants and a uniform `sq.size` scale.
  Proportions (arm length vs. mantle length vs. fin span) can never vary
  per-individual the way the whale's `juv` morphs a calf's profile.
  Anatomically the arm/tentacle count (8 arms + 2 feeding tentacles,
  [ProceduralSquidView.ts:172,181-183](../src/render/squid/ProceduralSquidView.ts))
  is correct for a real squid — this is not a simplification worth fixing.
- **No per-individual variety.** `sq.ph` exists on `Squid` state
  ([src/state/Squid.ts:56](../src/state/Squid.ts)) specifically for
  "per-squid phase for desync," but `ProceduralSquidView` never reads it —
  only `sq.jet`/`sq.heading`/`sq.flare`/`sq.arousal`/`sq.size` are consulted.
  Every squid at the same arousal level is pixel-identical.
- **Culling exists but is coarser than the whale's.** `SquidRenderer.render()`
  culls on X only, with a flat unscaled margin
  ([SquidRenderer.ts:22](../src/render/SquidRenderer.ts)), vs. `WhaleRenderer`'s
  `cam.visibleX(b.len)` margin that scales with the individual whale's body
  length ([WhaleRenderer.ts:44](../src/render/WhaleRenderer.ts)).
- **No zero-allocation guarantee.** `ProceduralWhaleView` holds ~15 `private
  readonly` scratch fields (`this.sec`, `this.cum`, `this.tan`, `this.finPts`,
  `this.finProj`, …) so a pod of whales draws with no per-frame garbage.
  `ProceduralSquidView` has no class fields at all — `drawArms` allocates a
  fresh array of point-tuples per arm, per squid, per frame.
- **No depth/light modeling.** Unlike the whale, which fades and skips draw
  entirely based on `lightAt(b.y)` ([WhaleRenderer.ts:33-41](../src/render/WhaleRenderer.ts)),
  the squid draws at fixed alpha (0.95 mantle, 0.9 arms/fins, 0.95 head/eye)
  regardless of depth. `CreatureDrawOptions` ([CreatureView.ts:16-21](../src/render/CreatureView.ts))
  has no alpha field for squid to plumb one through even if it wanted to.

---

## Bugs (Correctness / Visual Corruption)

### 1. The two feeding tentacles overlay the outermost pair of arms
- **Status:** ☑ Done (2026-09-11)
- **Severity:** Medium — visible geometric overlap, not a crash
- **Description:** In `drawArms`, `idx` picks each limb's angular slot in the
  fan:
  ```ts
  const idx = tentacle ? (i === N ? -0.5 : 0.5) : i / (N - 1) - 0.5;
  ```
  ([ProceduralSquidView.ts:183](../src/render/squid/ProceduralSquidView.ts)).
  For the 8 arms (`i = 0..7`, `N = 8`), `idx` ranges over `i/7 - 0.5`, so arm
  `i=0` has `idx = -0.5` and arm `i=7` has `idx = 0.5` — exactly the same
  values the two tentacles (`i=8`, `i=9`) use. Since `dir = Math.PI + idx * 2
  * fan` ([ProceduralSquidView.ts:184](../src/render/squid/ProceduralSquidView.ts))
  depends only on `idx`, each tentacle is drawn in the *identical* direction
  as the outermost arm on its side. The two limbs fully overlap along their
  shared length and only diverge in length (`tentLen` vs. `armLen`) and base
  width (5 vs. 8 world units before the `flare` factor) — so the outermost
  "arm" silhouette abruptly narrows partway out where the tentacle's base
  width takes over, instead of two visually distinct limbs.
- **Fix:** Give the tentacles their own slot outside the arm fan, e.g.
  ```ts
  const idx = tentacle
    ? (i === N ? -0.62 : 0.62)   // outside the 8-arm fan, not on top of it
    : i / (N - 1) - 0.5;
  ```
  or include the tentacles in the fan's normalization denominator so all 10
  limbs are evenly spaced.
- **Impact:** Fixes the arm/tentacle silhouette for every squid at every
  flare value; also affects the sway/curl math in issue #6 below since it
  operates on the same `idx`.

### 2. Squid ignores depth/ambient light — never dims in the dark
- **Status:** ☑ Done (2026-09-11)
- **Severity:** Medium-High — breaks the creature's core visual premise
- **Description:** `src/config/squid.ts`'s own header describes the squid as
  a creature that "lurks" and only becomes active in "the true dark"
  (`HUNT_MIN_Y = DARK_FULL`, [squid.ts:17](../src/config/squid.ts)), and
  `GlowRenderer` gives it photophores specifically so it can be *seen* in that
  dark ([GlowRenderer.ts:48-66](../src/render/GlowRenderer.ts)). But the base
  silhouette in `ProceduralSquidView` draws at fixed alpha regardless of
  depth — `mg.fill({ color: skin, alpha: 0.95 })`
  ([ProceduralSquidView.ts:118](../src/render/squid/ProceduralSquidView.ts)),
  and likewise 0.9/0.95/0.9 for arms/head/eye
  ([lines 145, 153, 225](../src/render/squid/ProceduralSquidView.ts)). Compare
  `WhaleRenderer`, which computes `v = max(lightAt(b.y)*0.7, w.lit, …)` and
  skips or dims the whale entirely below a light threshold
  ([WhaleRenderer.ts:33-41](../src/render/WhaleRenderer.ts)). A squid sitting
  at `y = 1800`+ is rendered exactly as brightly as one at the surface, which
  works against the "you mostly see it by its glow" intent that motivated the
  `GlowRenderer` photophore pass in the first place.
- **Fix:** Thread a `lightAt(sq.y)`-derived alpha through `draw()`, the same
  shape as the whale's `alpha` draw option — e.g. add an `alpha` field to a
  squid-specific draw-options type (today `CreatureDrawOptions` has none,
  [CreatureView.ts:16-21](../src/render/CreatureView.ts)) and have
  `SquidRenderer` compute it from `lightAt(sq.y)` before calling
  `this.view.draw(...)`, multiplying every fill/stroke alpha in
  `ProceduralSquidView` by it.
- **Impact:** Makes the squid actually read as a deep-water animal; also
  gives `GlowRenderer`'s photophores something to stand out against.

---

## Geometry Quality

### 3. No `geometry.ts` — shape math is entangled with Pixi and the camera
- **Status:** ☑ Done (2026-09-11)
- **Severity:** High — blocks testing and reuse, mirrors whale's old #27
- **Description:** Every offset in `ProceduralSquidView.draw()` and
  `drawArms()` is computed directly against the screen-space `X`/`Y`
  projector closures ([ProceduralSquidView.ts:39-40](../src/render/squid/ProceduralSquidView.ts)),
  the same anti-pattern the whale doc's #27 fixed for `ProceduralWhaleView`.
  There is no pure `local (along, across) → world/screen` projector, and the
  same rotation math is duplicated in `GlowRenderer` for the photophore
  positions:
  ```ts
  // ProceduralSquidView.ts:39-40
  const X = (al: number, pe: number): number => ox + (al * ca - pe * sa) * k;
  const Y = (al: number, pe: number): number => oy + (al * sa + pe * ca) * k;
  // GlowRenderer.ts:60-61 — the same formula, re-derived
  cam.sx(sq.x) + (al * ca - pe * sa) * k,
  cam.sy(sq.y) + (al * sa + pe * ca) * k,
  ```
  Nothing in `render/squid/` is unit-testable today; `geometry.test.ts` has no
  squid counterpart.
- **Fix:** Mirror the whale's split: a `render/squid/geometry.ts` with pure
  functions — a `squidPoint(local: Vec2, heading, size, out)` projector-free
  helper (local frame only, camera projection stays in the view/renderer),
  plus pure functions for the mantle outline, fin blade, and per-arm point
  list (`armPoints(idx, flare, jetPhase, i, out[])` etc.) that both
  `ProceduralSquidView` and `GlowRenderer` can call instead of hand-rolling
  the rotation twice.
- **Impact:** Unlocks vitest coverage for the tentacle-overlap fix (#1), the
  jet-pulse decoupling (#4), and the arm-curl math (#6) the same way the
  whale doc's #1 (hull self-intersection) got a regression test once the
  outline math moved to `geometry.ts`.

### 4. Head and eye radius inherit the mantle's jet pulse
- **Status:** ☑ Done (2026-09-11)
- **Severity:** Low-Medium — subtle but constant visual artifact
- **Description:** `mw` is the jet-pulsed mantle half-width:
  ```ts
  const jetPulse = Math.sin(sq.jet) * 0.16 + 1; // 0.84..1.16 mantle girth
  const ml = MANTLE;
  const mw = MANTLE_W * jetPulse;
  ```
  ([ProceduralSquidView.ts:47-49](../src/render/squid/ProceduralSquidView.ts)).
  The file's own header comment says "the mantle jets (pulsing width)" —
  singling out the mantle. But the head circle and eye circle are both sized
  off the same `mw`:
  ```ts
  hg.circle(X(-mw * 0.1, 0), Y(-mw * 0.1, 0), mw * 0.72 * k);   // line 144
  eg.circle(X(-mw * 0.15, -mw * 0.5), Y(-mw * 0.15, -mw * 0.5), er); // er = mw*0.34*k, line 151-152
  ```
  So the head and eye visibly grow/shrink ±16% in lockstep with every jet
  stroke, which reads as the whole head throbbing rather than just the
  mantle contracting to jet.
- **Fix:** Introduce a separate, non-pulsing `headW = MANTLE_W` baseline for
  the head/eye radii, decoupled from `jetPulse`:
  ```ts
  const headW = MANTLE_W; // head/eye don't pulse with the jet stroke
  hg.circle(X(-headW * 0.1, 0), Y(-headW * 0.1, 0), headW * 0.72 * k);
  ```
- **Impact:** Isolates the jet-pulse effect to the mantle, as the code
  comment already claims it is.

### 5. Arm segments are straight `lineTo` chains, not curves
- **Status:** ☑ Done (2026-09-11)
- **Severity:** Low-Medium — faceted silhouette, most visible on a flared grab
- **Description:** Each arm's outline is built from `S = 5` straight
  segments per edge:
  ```ts
  for (let s = 1; s <= S; s++) { const f = s / S; g.lineTo(...); }
  for (let s = S; s >= 0; s--) { const f = s / S; g.lineTo(...); }
  ```
  ([ProceduralSquidView.ts:209-222](../src/render/squid/ProceduralSquidView.ts)).
  Every other curved feature in this codebase (mantle, fins, stripe here;
  every whale fin/fluke blade) uses `quadraticCurveTo`. With only 6 vertices
  per edge, arm bends (from the `sway`/curl terms in #6) will read as visibly
  faceted rather than smooth, particularly at high `flare` where the curl
  term is largest.
  ([ProceduralSquidView.ts:209-222](../src/render/squid/ProceduralSquidView.ts)) 
- **Fix:** Either raise `S` (cheap, still faceted just finer-grained) or swap
  the per-segment `lineTo` calls for a `quadraticCurveTo`/Catmull-Rom-style
  smoothing through the same sample points — the same kink-removal goal as
  the whale's #5 (smoothed vertex tangents), just applied to a fixed-topology
  limb instead of a simulated spine.
- **Impact:** Smoother arm silhouettes without more simulation cost.

### 6. No per-individual proportion variation
- **Status:** ☑ Done (2026-09-11)
- **Severity:** Low — cosmetic variety, not correctness
- **Description:** `MANTLE = 96` and `MANTLE_W = 24`
  ([ProceduralSquidView.ts:21-22](../src/render/squid/ProceduralSquidView.ts))
  are module-level constants; every squid's mantle-to-arm-to-fin ratio is
  identical, scaled only by the uniform `sq.size` multiplier
  (`k = cam.scale * sq.size`, [ProceduralSquidView.ts:35](../src/render/squid/ProceduralSquidView.ts)).
  There is no analogue of the whale's `juv` profile morph — nothing lets two
  squid at the same `size` look anatomically distinct.
- **Fix:** Not urgent given squid are rare/atmospheric (one at a time by
  design, per `config/squid.ts`'s intro comment), but if pod-style multiple
  squid ever ship, a per-squid proportion hash (arm length ratio, fin span)
  seeded off `sq.ph` (already present on state, see issue #10) would close
  this the same way `hash01(k, seed)` gives whales per-individual mottling.
- **Impact:** Low priority; flagged for completeness since the brief asked to
  check feature-scaling-with-body-length explicitly.

---

## Pose & Lighting

*The whale's strategy here was: sort each layer into screen space (light) vs.
body space (anatomy). The squid currently has neither half of that model —
there is no roll axis to project, and no lighting layer to sort.*

### 7. No roll/pitch axis — the squid is a flat 2D yaw-only rotation
- **Status:** ☑ Decided (2026-09-11): yaw-only stays; light is screen-space (see #8)
- **Severity:** Medium — architecture gap, not a bug given current usage
- **Description:** `Squid` ([src/state/Squid.ts:29-63](../src/state/Squid.ts))
  has `heading` only; no `roll`/`pitch` field exists, and nothing in
  `SquidBrain`/`SquidSystem` (out of scope here, but checked for context)
  drives one. `ProceduralSquidView` projects local coordinates through a
  single rotation matrix
  ([ProceduralSquidView.ts:36-40](../src/render/squid/ProceduralSquidView.ts))
  with no counterpart to the whale's offset-ellipse cross-section
  (`computeSection`/`rollBasis` in `whale/geometry.ts`). A squid can never be
  shown banking, diving nose-down, or rolling belly-up the way a whale can.
- **Decision needed:** Whether this matters for a game where the squid is
  described as "a rare, atmospheric deep-water moment" that lurks, stalks,
  and lunges mostly along the horizontal — the strike/latch/flee states may
  never need a true roll axis to read well. If a future pass wants the squid
  to pitch nose-down on a strike lunge (biologically, real squid strike by
  jetting straight at prey), that's a 2D pitch-vs-yaw blend, not a full
  3-axis roll like the whale — much cheaper than reproducing the whale's
  ellipse-projection model.
- **Impact:** Sets the scope for any future pose work; recorded here so the
  decision is made deliberately rather than by omission.

### 8. No screen-space lighting layer at all
- **Status:** ☑ Done (2026-09-11)
- **Severity:** Medium — ties into Bug #2
- **Description:** The whale explicitly splits "light from above" / "form
  shadow underneath" (screen-space, stays fixed through a roll) from
  "belly / mottling / pleats" (body-space, rolls with the animal). The squid
  has no equivalent of either half — the only shading is the `stripe` block
  ([ProceduralSquidView.ts:122-139](../src/render/squid/ProceduralSquidView.ts)),
  a fixed body-space countershade patch on one flank, alpha-blended at a flat
  0.35 with no light-direction or depth dependence. There is no rim light, no
  overhead sheen, nothing that varies with camera-relative orientation.
- **Fix:** Given #7's decision to skip a full roll model, a screen-space
  layer doesn't need ellipse projection — even a simple "lighten the
  screen-top edge of the mantle outline, darken the screen-bottom edge" pass
  (independent of `heading`) would give the squid the same "light stays
  overhead" cue the whale relies on, without needing a 3-axis pose model.
- **Impact:** Closing this together with Bug #2 (depth-based alpha) is what
  would make the squid actually read as a lit 3D object in the water column
  rather than a flat painted sprite.

### 9. The view has no `sq.state` awareness; a latched squid has no grip visual
- **Status:** ☑ Done (2026-09-11)
- **Severity:** Low-Medium — missing feature, most noticeable during a strike
- **Description:** `ProceduralSquidView.draw()` only reads `sq.heading`,
  `sq.jet`, `sq.flare`, `sq.arousal`, and `sq.size` — never `sq.state` or
  `sq.grip`. `Squid.grip` ([src/state/Squid.ts:51-52](../src/state/Squid.ts))
  is documented as "attach point in the whale's local frame (along, across),
  set on grab" but is not read anywhere under `src/render/` (confirmed by
  search — no `grip`/`latch` reference in `src/render/`). So a `latched`
  squid renders identically to a `stalk`ing one except through the continuous
  `flare`/`arousal` knobs that already respond to state indirectly — there is
  no visible connection (wrapped arms, stretched tentacles) between the squid
  and its grip point on the whale during the game's one combat beat.
- **Fix:** Either accept this as within scope for the "one slow telegraphed
  lunge" design (arms already flare open per `sq.flare`, which may be
  sufficient), or, if a stronger latch read is wanted, have
  `ProceduralSquidView` bend the two tentacle tips toward `sq.grip`
  (transformed into world space) when `sq.state === "latched"`.
- **Impact:** Cosmetic but is the most visible frame of the squid's one
  gameplay interaction with the player.

---

## Visual Artifacts & Polish

### 10. No per-squid seed/variety — `sq.ph` is unused by the view
- **Status:** ☑ Done (2026-09-11)
- **Severity:** Low — only matters if more than one squid is ever visible
  at once
- **Description:** `Squid.ph` ([src/state/Squid.ts:55-56](../src/state/Squid.ts))
  is documented as "a per-squid phase for desync" and is used in `makeSquid`
  only to offset the initial `jet` phase
  ([src/state/Squid.ts:79](../src/state/Squid.ts)). `ProceduralSquidView`
  never reads `sq.ph`. Two squid with the same `arousal`/`flare`/`size` at
  the same point in their jet cycle are pixel-identical — no analogue of the
  whale's `hash01(k, seed)` per-whale mottle seed (whale roadmap #19).
- **Fix:** Thread `sq.ph` into any future skin-texture/mottle work (see #6)
  the same way the whale threads `opts.seed`.
- **Impact:** Low priority today since the design intent (per
  `config/squid.ts`) is one squid at a time; worth fixing if that changes.

### 11. No LOD system
- **Status:** ☑ Done (2026-09-11)
- **Severity:** Low
- **Description:** There is no distance/zoom-based simplification anywhere in
  `ProceduralSquidView` — no equivalent of the whale's `STEPS` tiering (whale
  #18). Given the squid's fixed, low vertex-count topology (6 points per fin,
  6-8 per arm segment loop, a handful of bezier curves for the mantle), this
  is far less costly per-instance than the whale's arc-length hull, so the
  absence is lower-severity than it was for the whale.
- **Fix:** Not urgent; revisit only if a scene design puts many squid on
  screen simultaneously (against current design intent) or arm segment count
  (#5's fix) grows enough to matter.
- **Impact:** Low priority, recorded for completeness per the audit brief.

### 12. Single wraparound tail fin instead of paired lateral fins
- **Status:** ☑ Done (2026-09-11)
- **Severity:** Low — anatomy/species accuracy, cosmetic
- **Description:** The fin block draws one continuous shape that sweeps from
  one flank, around the mantle tip, to the other flank
  ([ProceduralSquidView.ts:55-75](../src/render/squid/ProceduralSquidView.ts)),
  rather than two separate lateral fins as most squid species (including
  deep-water species like *Grimalditeuthis* or *Architeuthis*) have. This
  reads fine as a stylized silhouette but is a simplification worth flagging
  since the brief asked about anatomical detail relative to the whale's
  biological-profile curves.
- **Fix:** Split into two fin lobes rooted further forward on the mantle if
  higher species-accuracy is wanted; low priority relative to the other
  items here.
- **Impact:** Cosmetic only.

---

## Architecture & Performance

### 13. `draw()` allocates every frame, for every squid
- **Status:** ☑ Done (2026-09-11)
- **Severity:** Medium — mirrors the whale's old #3
- **Description:** `ProceduralSquidView` has no scratch/pool fields at all
  (contrast `ProceduralWhaleView`'s ~15 `private readonly` fields:
  `this.sec`, `this.cum`, `this.tan`, `this.finPts`, `this.finProj`, …). Per
  `draw()` call:
  - The `X`/`Y` projector closures are freshly allocated every call
    ([ProceduralSquidView.ts:39-40](../src/render/squid/ProceduralSquidView.ts)).
  - `drawArms` allocates a new `edge: [number, number][]` array, with 6
    two-element tuple arrays inside it, **per limb** (10 limbs), **per
    squid**, **per frame**:
    ```ts
    const edge: [number, number][] = [];
    for (let s = 0; s <= S; s++) {
      // ...
      edge.push([along + nx * sway, across + ny * sway]);
    }
    ```
    ([ProceduralSquidView.ts:191, 202](../src/render/squid/ProceduralSquidView.ts)).
  - `mixColor` is called three times per squid per frame regardless of
    whether `arousal` changed since the last frame
    ([ProceduralSquidView.ts:43-45](../src/render/squid/ProceduralSquidView.ts)),
    vs. the whale's cached `ckSkin`/`ckBelly` check-and-reuse.
- **Fix:** Move `X`/`Y` onto the class as methods (or pass `ox`/`oy`/`k`/`ca`/`sa`
  explicitly), give `drawArms` a preallocated `Float64Array` or fixed-size
  scratch array pool sized `10 limbs × 6 points`, and cache the three
  `mixColor` results keyed on a quantized `arousal` the way the whale caches
  on `skin`/`belly`.
- **Impact:** Squid are rare (design intent: one at a time), so this is lower
  urgency than it was for a whale pod, but the fix is small and removes a
  real per-frame allocation source.

### 14. No `geometry.ts` split (architecture-level restatement of #3)
- **Status:** ☑ Done (2026-09-11)
- **Severity:** High — blocks testing, enables everything else in this doc
- **Description:** See issue #3 for the concrete duplication with
  `GlowRenderer`. Architecturally this is the same step the whale doc's #27
  proposed and completed: `spine/pose + options → outline points + limb
  anchors`, as pure functions, with `ProceduralSquidView` left doing camera
  projection and `Graphics` calls only.
- **Proposal:** `render/squid/geometry.ts` exporting pure functions for the
  mantle outline, fin blade points, arm/tentacle point lists (parameterized
  by `idx`, `flare`, `jetPhase` — see fix for #1), and the head/eye anchor
  points, with `geometry.test.ts` covering the tentacle-overlap fix (#1) with
  a direct "no two limbs share an angular slot" assertion, the same spirit as
  the whale's bug-#1 self-intersection regression test.
- **Impact:** This is the blocking item for #1, #4, #5, #6, #9's fix — the
  same role the whale doc's #27 played for that doc's Phase 2.

### 15. Culling is X-only, with a flat unscaled margin
- **Status:** ☑ Done (2026-09-11)
- **Severity:** Low — mirrors the whale's #28, already partly addressed
- **Description:** `SquidRenderer.render()`:
  ```ts
  for (const sq of ctx.squid.squids) {
    if (Math.abs(sq.x - cam.x) > cam.vw / 2 / cam.scale + 900) continue;
    this.view.draw(g, sq, {}, cam);
  }
  ```
  ([SquidRenderer.ts:21-23](../src/render/SquidRenderer.ts)). Unlike the
  whale's now-fixed #28 (which had *no* culling), squid already has an X
  cull — but the margin (`900`) is a flat constant unrelated to the squid's
  own extent (mantle + tentacle reach is ~240 world units at `size=1`, so 900
  is generously safe but not derived from anything), and there is no
  vertical (Y) cull at all — a squid far above or below the current viewport
  (plausible, since squid lurk deep while the camera follows the whale nearer
  the surface) is still fully drawn if it happens to be within X range.
  `Camera` ([src/core/Camera.ts](../src/core/Camera.ts)) only exposes
  `visibleX()`, not a `visibleY()` equivalent, so a Y cull isn't a one-line
  fix today.
- **Fix:** Short term, swap the hand-rolled X check for `cam.visibleX(sq.size
  * 240)` to match the whale's pattern of deriving the margin from the
  creature's own extent ([WhaleRenderer.ts:44](../src/render/WhaleRenderer.ts)).
  Longer term, add a `Camera.visibleY()` alongside `visibleX()` and cull on
  both axes.
- **Impact:** Minor perf win; mostly a consistency fix so squid culling
  follows the same pattern the whale renderer already established.

---

## Work Plan Suggestions

### Phase 1: Correctness (#1, #2)
Fix the tentacle/arm overlap and wire depth-based alpha through so the squid
actually dims in the dark. Both are self-contained; #2 needs a small
`CreatureDrawOptions`-shaped addition to pass alpha through.
- Estimated effort: 1.5–2.5 hours

### Phase 2: Geometry extraction (#3, #14, blocks #1/#4/#5/#6/#9's fix)
Pull mantle/fin/arm/tentacle point math into `render/squid/geometry.ts` as
pure functions, add `geometry.test.ts`, and fold the #1 fix in as the first
regression test. This is the same "blocker for later improvements" role the
whale doc's Phase 2 played.
- Estimated effort: 4–6 hours

### Phase 3: Geometry quality polish (#4, #5, #6)
Decouple head/eye radius from the jet pulse, smooth the arm outline curves,
consider per-individual proportion variation. Best done after Phase 2 since
all three touch the same code the extraction moves.
- Estimated effort: 2–3 hours

### Phase 4: Pose & Lighting (#7 decision, #8, #9)
Decide whether the squid needs any pitch/roll beyond pure yaw (#7 is a
decision point, not just an implementation task); add a screen-space
light/shadow pass; consider a latch-state grip visual.
- Estimated effort: 3–5 hours, larger if #7's decision is "yes, add a pose axis"

### Phase 5: Visual Polish (#10, #11, #12)
Thread `sq.ph` into any texture/variety work, revisit LOD only if multiple
squid become simultaneously visible, consider paired fins.
- Estimated effort: 1–2 hours (low priority — mostly deferred)

### Phase 6: Architecture (#13, #15)
Zero-allocation scratch pools + `mixColor` caching in the view; align
culling with `cam.visibleX(extent)`, add `Camera.visibleY()` if a vertical
cull is wanted.
- Estimated effort: 2–3 hours

---

## Tracking

Use checkboxes above to mark progress. Update status from "Not started" →
"In progress" → "Done" as work happens, and add a dated "Progress" section
(matching the whale doc's format) once the first implementation pass lands.

## Progress

### 2026-09-11 — first implementation pass (closes #1–#6, #8–#15; decides #7)

The view was rewritten against the whale's standard rather than patched:

- **`render/squid/geometry.ts` + `geometry.test.ts`** (#3, #14) — every shape is
  a pure local-frame function (`buildMantleOutline`, `buildFin`, `limbPoints`,
  `photophoreLocal`, `eyeLocal`, `localToWorld` / `worldToLocal`), with 27
  vitest cases covering the limb-slot fix, the tentacle club, the asymmetric
  jet pulse, mantle self-intersection at both pulse extremes, photophores
  staying inside the mantle, per-individual proportion bounds and the grip
  bend. `GlowRenderer` now reads the same anchors instead of re-rolling the
  rotation (`localToWorld`) and adds eye-shine.
- **`render/squid/params.ts`** — `SquidLook` (mantle length / girth, head
  radius, fin root / length / span, arm / tentacle length, arm width / wave,
  pulse depth, chromatophore density, variety) with the same
  `squidLook()` / `setSquidLook()` live-override hook the ocean uses.
- **#1** tentacles sit in their own slots inside the fan (between the third
  and fourth arm of each side, where a real squid carries them) and grow a club
  at the tip. **#4** head and eye are sized off `look.headR`, never the pulse.
  **#5** every limb is a smooth quadratic ribbon (`drawBlob`), 4–8 centre-line
  samples by LOD. **#12** two lateral fin lobes, each rippling with a wave
  travelling root → tip off `sq.jet`. The jet itself is now asymmetric
  (`pulseWave`: 30% squeeze, 70% refill, zero mean) and lengthens the mantle
  as it squeezes.
- **#6 / #10** `individual(ph, variety)` hashes mantle / girth / fin / arm /
  tentacle ratios and a fleck seed from `sq.ph`; every limb's sway carries its
  own phase from `ph` too.
- **#2** `SquidRenderer` passes `alpha = max(lightAt(y) · 0.95, 0.18 + 0.3 ·
  arousal)` so a squid in the true dark is a faint shape read by its glow.
  **#15** culling is `cam.visibleX(reach · size)` plus a vertical check.
- **#7 / #8** decision: no roll / pitch axis — the animal is yaw-only by
  design, so the whale's ellipse model would buy nothing. The light split is
  done in screen space instead: sheen / rim on whichever flank maps up-screen
  (weight |cos heading|), form shadow on the down flank, a tip sheen when the
  mantle points up and a head-crown sheen when the head does. The ventral
  stripe and the visible eye ride the down / up flank respectively and slide
  to the centre line as the squid points straight up or down.
- **#9** a `latched` squid gets `gripAt` (the whale's body — the squid already
  sits at its grip point) and the tentacle tips bend onto it.
- **#11** `detail` / `fine` smoothstep ramps on the on-screen size tier the
  mantle steps (12–24), limb samples (4–8) and fleck count.
- **#13** the view holds pre-allocated pools for the outline, bands, limbs and
  fins, projects through class methods (no per-draw closures beyond the shared
  `pick`), and caches its twelve palette colours on arousal quantised to 1/32.
- **Tooling:** `tools.html#squid` now has a body mode (`tools/squidDesigner.ts`,
  the whale designer's twin: per-section hover / pin, source slice, state
  preset buttons, flare contact sheet, grip target, every `SquidLook` dial)
  alongside the old scene mode, and `scripts/shot-squid.mjs` drives it through
  `window.__squid`.

Left open: nothing from the audit. Possible follow-ups are a real pitch blend
on the strike lunge (ruled out for now under #7) and a species pass on the fin
shape if the game ever names the animal.

**Last updated:** 2026-09-11 (first implementation pass landed; see Progress)
