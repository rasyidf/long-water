# Whale Rendering Issues & Roadmap

A comprehensive tracking document for whale rendering bugs, quality improvements, and architectural enhancements. Issues are ordered by severity—bugs that break rendering first, then geometry quality, then visual polish, then architecture.

**Primary file:** [src/render/whale/ProceduralWhaleView.ts](../src/render/whale/ProceduralWhaleView.ts)

---

## Progress — 2026-09-10 (first pass, on `main`)

Implemented in one rewrite of `ProceduralWhaleView.ts` (+ `WhaleView.ts`, `WhaleRenderer.ts`). Verified: `tsc` + `eslint` clean. **Not yet verified in-game.**

| Done | Partial | Deferred (needs a decision or its own session) |
|---|---|---|
| #1 hull self-intersection | #3 mixColor cache done; fill-object reuse skipped (Pixi-internals risk) | #9 fluke pitch — #5's smoothed tangent already bends the root; explicit rotation math is unverifiable without rendering |
| #2 roll edge blending (via blended `th`/`bh`, identical at level) | #8 dorsal fin scales with `juv`; fluke/eye left | #14 fluke span vs roll — **decision needed** (authentic vs legible) |
| #4 degenerate spine guard | #18 STEPS quantised to 3 tiers + fleck fade-in; true hysteresis needs per-whale state (view is shared) | #15 layer alpha — needs an interface/arch change (shared Graphics; pass a water colour or move to a filter) |
| #5 smoothed vertex tangents + interp | #24 gape end pulled forward/up; eye-vs-corner geometry left | #16 soft countershade edges — aesthetic |
| #6 arc-length parameterisation | | #22 blue-whale colouring — aesthetic, wants side-by-side review |
| #7 feature offsets scale with body (`featK`) | | #23 throat pleats — new feature, wants visual review |
| #10 rim light on at all rolls | | #25 rostrum tip — cosmetic, tiny magnitude |
| #11 mottling gate + girth spread | | #26 Mesh + shader rewrite — major, own session |
| #12 eye/jaw gate → `abs(cr)` | | #27 extract pure geometry + unit tests — no test runner installed (add vitest) |
| #13 far-side flipper under hull, opaque | | |
| #17 fluke drawn before hull | | |
| #19 per-whale mottle seed (`opts.seed`) | | |
| #20 `MAX_STEPS` corrected (44 → 40) | | |
| #21 `smoothstep` verified correct (comment added) | | |
| #28 viewport culling in `WhaleRenderer` | | |

---

## Progress — 2026-09-10 (second pass: rolled cross-section rewrite)

Second rewrite of `ProceduralWhaleView.ts` (+ the `WhaleSection` list in
`WhaleView.ts`, + the ProcGen designer). Verified: `tsc` + `eslint .` clean, and
reviewed at roll 0° / 45° / 90° / 180° in `/procgen.html`.
**Not yet verified in-game.**

The roll model was replaced rather than patched. The body is now an offset
ellipse in cross-section — vertical semi-axis `mA`, ventral centre offset `mC`,
lateral semi-axis `mB` — and rolling it is an exact 2D projection of that
ellipse instead of a stack of blend factors (`upK` / `foreK` / `spread` /
`flipped` / `noseWrap` are all gone). The pieces:

- `sect(t)` — memoised cross-section, plus the projected half-extent `mR` and
  the cross-section angle `mD` that has rolled onto the near silhouette edge.
- `edgeTop` / `edgeBot` — exact silhouette. The body genuinely narrows edge-on
  and the profile *mirrors* past 90° instead of lerping between two halves.
- `prpAt(t, psi)` / `faceAt(t, psi)` / `bandAt(t, centre, half)` — every skin
  marking is pinned to a cross-section angle (0 = ventral keel, ±π/2 = flanks,
  ±π = dorsal ridge) and clipped to the visible half. Belly, mottling, pleats,
  eye, gape and blowhole therefore roll as one body and leave view on their own.
- `at3(t, fwd, ven, lat)` + `depth3(ven, lat)` — body-frame projection for the
  fins, with far/near pectoral **and** far/near dorsal fin sorted by depth.
- Lighting split from pigment: "light from above" and "form shadow underneath"
  are screen-space (the sun stays overhead through a roll); belly, mottling and
  pleats are body-space. The old code gated the dorsal sheen on the roll, which
  is why an inverted whale was lit from underneath.

Anatomy / beauty in the same pass: stylised girth (`GIRTH`), straighter back
over a deeper pleated throat (`topFrac`), splash-guard bump on the dorsal line,
rounded rostrum tip, laterally-compressed blade-like tail stock (`latK`), throat
pleats, gape line + eye highlight + blowhole slit, pale belly bounded above by
the gape (this is what fixed the white-block head), falcate dorsal fin, flipper
rebuilt on separate span/chord axes, and a fluke modelled in the whale's
horizontal plane with its pitch driven by the tail's own bow.

Designer tool: `spin` (deg/s auto-roll), `wave` (stroke amplitude), a **roll
sheet** button that stacks seven rolls at once, and a `window.procgen.set({…})`
hook that [scripts/shot-rolls.mjs](../scripts/shot-rolls.mjs) drives headlessly.

**Closes or supersedes:** #2 (properly, via the ellipse projection), #9 (fluke
pitch from pose), #10, #11, #12, #13, #14 (decision made — see below), #16
(belly now runs out gracefully before the peduncle), #23, #24, #25.

---

## Next up — whale visuals

Ordered. Items 1–2 are the ones that could change what shipped.

### N1. Review the two deliberate cheats in the roll
- **Status:** ☐ Not started
- **Why:** An honest edge-on fluke is a hairline at level roll, which reads as
  "no tail". `SPREAD = 0.36` floors the fluke's span projection so the tail
  always reads as a tail; the dorsal fin, by contrast, uses pure `cos` and does
  vanish edge-on (correct — a sagittal blade projects inside the body outline).
- **Do:** Sweep `SPREAD` in `/procgen.html` with the roll sheet on and settle on
  a value. This is the resolution of roadmap #14: **authentic projection + a
  legibility floor**, rather than either option as originally framed.

### N2. Verify in the real game
- **Status:** ☐ Not started
- **Why:** Everything so far was judged in `/procgen.html` only. Roll is
  exercised in play in exactly one place — the breach barrel roll in
  `systems/whale/locomotion.ts`, which drives `roll` + `rollBlend`.
- **Do:** Drive it headlessly (hold `KeyS` ~5 s to dive, then `KeyW` + repeated
  `ShiftLeft` taps ~6 s to breach) and watch a full 360° through the arc. Check
  that `rollK < 1` still eases cleanly — the basis is renormalised so the
  projection stays exact at every blend value, but it has not been seen mid-ease
  in motion.

### N3. Pod and calf pass
- **Status:** ☐ Not started
- **Why:** The profile was rewritten; `juv` up to 1 and `podGirth` (~30–40, vs
  the player's fixed 38) have not been eyeballed since.
- **Do:** Check `juv` 0.5 / 0.8 / 1.0 in the tool, then a real pod in-game.
  Roadmap #8 (juvenile proportions) is still only partly addressed: the dorsal
  fin and the profile take `juv`, the fluke and eye placement do not.

### N4. Perf sanity on the shading tiers
- **Status:** ☐ Not started
- **Why:** The light/shadow layers add ~6 band polygons per whale per frame on
  top of the hull and belly bands. The `mottle` / `detail` LOD ramps gate the
  extra tiers, so distant pod whales draw one each — but this has not been
  measured.
- **Do:** Frame-time check with a full pod on screen. If it bites, the tiers are
  the first thing to fold into #26 (Mesh + shader).

### N5. Still open from the first pass
- #3 fill-object reuse, #15 layer alpha (needs an interface change), #18 true
  LOD hysteresis (needs per-whale state), #22 blue-whale colouring (wants a
  side-by-side review), #26 Mesh + shader, #28 done.
- #27 **partly done** (2026-09-10, `feat/procedural-views`): the already-pure
  shape math (`profile` / `topHalf` / `botHalf` / `mouthPsi` / `latK` /
  `cosVisible` / `hash01`) plus a new allocation-free `rollBasis` are lifted to
  [src/render/whale/geometry.ts](../src/render/whale/geometry.ts) with vitest
  coverage. The outline/fin *assembly* is still entangled with Pixi + the camera
  in `ProceduralWhaleView` — a `spine → outline points + fin anchors` pure
  function is the remaining step. Also landed: a shared
  [CreatureView](../src/render/CreatureView.ts) seam and a matching
  `ProceduralSquidView` (`SquidRenderer` is now a thin cull-and-delegate System).
- #27 **further progress** (2026-09-11): the spine-frame math (arc-length
  table, smoothed-tangent build, and the per-`t` interpolation that bugs #4/#5/#6
  live in) and the cross-section math (`computeSection`/`edgeTop`/`edgeBot`/
  `prpAt`/`faceAt`/`bandAt`) are now pure functions in `geometry.ts` —
  `buildArcLength`, `buildTangents`, `spineFrameAt`, `computeSection`, and
  friends — with vitest coverage, including a direct test of the bug #4
  degenerate-segment fallback. `ProceduralWhaleView` now just calls these and
  keeps its own scratch state (`this.sec`, `this.cum`, `this.tan`) for the
  zero-allocation guarantee. Verified byte-identical output via
  `scripts/shot-rolls.mjs` at 0/45/90/135/180° roll before vs. after.
- #27 **hull outline extracted** (2026-09-11, same session): `bodyPoint`
  (world-space spine-frame offset, pure counterpart of the view's screen-space
  `at()`) and `buildHullOutline` (the full `spine → outline points` loop —
  top edge aft, bottom edge forward, then the head cap) are now pure functions
  in `geometry.ts`. `geometry.test.ts` has a direct regression test for **bug
  #1** (hull self-intersection at the rostrum): a proper segment-crossing
  check over the wound outline, at STEPS 8/20/40 on a straight spine and once
  on a curved one — the exact test the original bug#1 writeup asked for.
  `ProceduralWhaleView`'s hull-building block now just calls
  `buildHullOutline` and maps `cam.sx`/`cam.sy` over the result. Re-verified
  byte-identical output via `shot-rolls.mjs`, including a `juv=0.8` case.
  Still outstanding: pectoral/dorsal fin and fluke blade point construction
  are still interleaved with Pixi curve calls (`moveTo`/`quadraticCurveTo`) in
  the view — pulling the fin *anchor points* out the same way, while leaving
  the actual `Graphics` drawing in the view, is what's left of #27.

---

## Bugs (Breaking/Visual Corruption)

### 1. Hull outline self-intersection at rostrum
- **Status:** ☐ Not started
- **Severity:** High—causes pinched/notched snout
- **Description:** The head cap is pushed as `top(0.01)`, `tip`, `bottom(0.01)`, then the loop continues with `top(t1)`. The segment `bottom(0.01)→top(t1)` crosses the closing segment `bottom(t1)→top(0.01)`, creating a self-intersecting polygon. Pixi's earcut triangulation doesn't handle this well.
- **Fix:** Reverse the order of the top edge in the head cap:
  ```ts
  let n = 0;
  for (let s = 1; s <= STEPS; s++) { const t = (s / STEPS) * BODY_END; at(t, 0, -th(t) * foreK, this.outline[n++]); }
  for (let s = STEPS; s >= 1; s--) { const t = (s / STEPS) * BODY_END; at(t, 0, bh(t) * foreK, this.outline[n++]); }
  at(0.01, 0, bh(0.01) * foreK, this.outline[n++]);
  at(0, 1, 0, this.outline[n++]);
  at(0.01, 0, -th(0.01) * foreK, this.outline[n++]);
  ```
- **Testing:** Segment-intersection test on outline order with a straight spine.
- **Verified at:** STEPS 8, 20, 40

### 2. Inverted rolls don't mirror silhouette
- **Status:** ☐ Not started
- **Severity:** High—fins appear buried or floating at high roll angles
- **Description:** The hull always uses `-th` on top and `bh` on bottom, but `bh` ≈ 1.4× `th`. Past 90° roll, the fuller belly should swap to the top edge. Fin positions become incorrect: dorsal fin partly buried, pectoral fin floating outside the body.
- **Fix:** Blend edges by roll angle:
  ```ts
  const up = (1 + cr) * 0.5;  // 1 when level, 0.5 edge-on, 0 inverted
  const topEdge = (t: number) => -(th(t) * up + bh(t) * (1 - up)) * foreK;
  const botEdge = (t: number) => (bh(t) * up + th(t) * (1 - up)) * foreK;
  ```
  Then anchor all fins to `topEdge` and `botEdge` instead of fixed `th`/`bh`.
- **Impact:** Also fixes issues #12 (eye/jaw at 180°), #13 (far-side flipper alpha).

### 3. "Zero garbage" comment is inaccurate
- **Status:** ☐ Not started
- **Severity:** Medium—performance impact; misleading documentation
- **Description:** Every `draw()` allocates `frameAt`, `at`, `th`, `bh`, `drawBand`, `bellyLevel`, `bellyOuter` plus six lambdas to `drawBand`, and creates `{ color, alpha }` literals for ~20 fills/strokes per whale. V8 won't reliably elide these.
- **Fix:** 
  - Move functions onto the class as private methods
  - Reuse mutable style objects
  - Cache the five `mixColor` results until `skin` or `belly` changes
- **Metrics:** Measure GC pause impact before/after.

### 4. Degenerate spine segments snap the frame
- **Status:** ☐ Not started
- **Severity:** High—can crash rendering
- **Description:** When two spine points coincide, `atan2(0, 0)` returns 0 and the whale's local frame jumps to +x. Breaks the geometry.
- **Fix:** Normalize with a length check; keep the previous tangent when length ≈ 0:
  ```ts
  const dx = next.x - curr.x, dy = next.y - curr.y;
  const len = Math.hypot(dx, dy);
  if (len > 1e-6) {
    frameX = dx / len;
    frameY = dy / len;
  }
  // else: keep previous frame
  ```

---

## Geometry Quality

### 5. Piecewise-constant tangent causes visible kinks
- **Status:** ☐ Not started
- **Severity:** Medium—visible artifact at body joints
- **Description:** The tangent is constant within each spine segment. At every joint, the perpendicular offset jumps, causing kinks in the outline—worst mid-body where girth is largest. Currently computes `atan2`/`cos`/`sin` ~400 times per whale per frame.
- **Fix:** Compute smoothed vertex tangents once per draw, interpolate within segments:
  ```ts
  // Once per draw:
  for (let i = 0; i <= last; i++) {
    const a = sp[Math.max(0, i - 1)], b = sp[Math.min(last, i + 1)];
    const dx = a.x - b.x, dy = a.y - b.y, len = Math.hypot(dx, dy);
    if (len > 1e-6) { this.tan[i].x = dx / len; this.tan[i].y = dy / len; }
  }
  // In frameAt: lerp tan[i] -> tan[i+1] by k, then renormalize
  ```
- **Benefit:** Smooth outline, removes per-point trig ops.

### 6. Parameterization by spine index, not arc length
- **Status:** ☐ Not started
- **Severity:** Medium—proportions drift if spine stretches unevenly
- **Description:** If spine simulation stretches unevenly, head or peduncle proportions can drift. The parameter `t` should track actual arc length, not just index.
- **Fix:** Build a cumulative arc-length table per draw. Since samples are monotonic in `t`, walk a pointer through the table without binary search.
- **Impact:** Head/peduncle stay correctly proportioned even under deformation.

### 7. Feature sizes fixed in scale units, not body length
- **Status:** ☐ Not started
- **Severity:** Medium—features don't scale with body
- **Description:** Body length is the spine's world length, but flipper (offsets 11 to -46), fluke span (22), sweep (15), and fleck spread (12) are all fixed in `scale` units. Changing spine length or `width` breaks feature proportions.
- **Fix:** Express all feature sizes as fractions of measured body length.

### 8. Juvenal proportions incomplete
- **Status:** ☐ Not started
- **Severity:** Low—cosmetic; only profile changes
- **Description:** `juv` only affects the body profile. Fins, fluke, eye size, and dorsal fin height stay at adult proportions on a calf.
- **Fix:** Scale fin/fluke sizes and eye by `juv` factor.

### 9. Fluke is rigid; ignores tail curvature
- **Status:** ☐ Not started
- **Severity:** Medium—animation disconnect
- **Description:** Fluke takes orientation from spine segment at t=0.94 and ignores curvature beyond. Tail stroke should flow into the blades.
- **Fix:** Pitch fluke from the curvature of the last two spine segments.

---

## Roll & Lighting Model

*Strategy: Sort each layer into screen space (light) vs. body space (anatomy). Overhead light always above; fins/mottling follow the whale.*

### 10. Rim light turns off when inverted (cr > 0.2)
- **Status:** ☐ Not started
- **Severity:** Medium—visual discontinuity
- **Description:** Overhead light still catches whatever edge is on top, but rim light vanishes mid-inversion.
- **Fix:** Keep rim light on the screen-top edge at all roll angles.

### 11. Mottling disappears when back faces camera (cr > 0.05)
- **Status:** ☐ Not started
- **Severity:** Medium—mottling most visible when back is frontmost
- **Description:** Flecks sit on the back but gate removes them when most visible. The `cr > 0.05` gate is wrong.
- **Fix:** Gate with `clamp01(cr + backCam)` like sheen does. Spread fleck positions over full girth as `backCam` rises.

### 12. Eye and jaw line vanish at 180° roll
- **Status:** ☐ Not started
- **Severity:** Low—only extreme poses; related to #2
- **Description:** Far eye would face camera by 180°. `ek` is already signed; gate needs fixing.
- **Fix:** Switch gate to `Math.abs(cr)` after fix #2 is applied.
- **Depends on:** #2

### 13. Far-side flipper draws on top at high alpha
- **Status:** ☐ Not started
- **Severity:** Medium—ghostly/incorrect layering
- **Description:** When `cr < 0`, far flipper renders over body at minimum alpha 0.2. Body should cover it.
- **Fix:** Draw far flipper before hull at full alpha so body occludes it.
- **Depends on:** #2

### 14. Fluke span responds to roll backwards
- **Status:** ☐ Not started
- **Severity:** Low—stylistic choice
- **Description:** Span shrinks as `|sn|` grows via `foreK`. True side-view flukes are edge-on; full span shows at 90° roll. Current code shrinks span with roll.
- **Options:**
  - **Authentic:** Drive span with `lerp(0.35, 1, |sn|)` 
  - **Legible:** Keep current, but remove the shrink
- **Decision needed:** Which aesthetic do you prefer?

---

## Visual Artifacts & Polish

### 15. Layer transparency stacks multiplicatively
- **Status:** ☐ Not started
- **Severity:** Medium—underwater fade looks wrong
- **Description:** Every layer multiplies `alpha` separately. Fading whale with depth shows hull through fins; bands darken twice. Pixi container alpha doesn't fix this.
- **Fix (Option A):** Draw opaque, apply `AlphaFilter` to whale container.
- **Fix (Option B):** Replace fade with tint toward water color (cheaper, more underwater-like).
- **Decision needed:** Opaque + filter or tinted fade?

### 16. Countershade bands have hard edges
- **Status:** ☐ Not started
- **Severity:** Low—visual polish
- **Description:** Two stacked translucent fills create visible steps, not smooth gradient. Belly patch stops abruptly at t=0.86, well before peduncle.
- **Fix:** Smooth the edge by blending band alpha over a wider interval, or extend belly patch further aft.

### 17. Fluke and hull tone step at junction
- **Status:** ☐ Not started
- **Severity:** Low—visual continuity
- **Description:** Fluke uses `finSkin` (16% darker) and draws over tail stock. Visible hard edge.
- **Fix:** Draw fluke before hull, or darken hull toward tail. Blend the transition.

### 18. LOD changes pop into existence
- **Status:** ☐ Not started
- **Severity:** Medium—motion artifacts
- **Description:** Each change in rounded `STEPS` moves every hull sample point. New flecks appear at current mottle alpha instead of fading in.
- **Fix:** 
  - Fade each fleck with `clamp01(9 * mottle - k)`
  - Use two fixed STEPS tiers with hysteresis (not continuous rounding)
- **Impact:** Smooth LOD transitions.

### 19. All whales in a pod have identical mottling
- **Status:** ☐ Not started
- **Severity:** Low—visual variety
- **Description:** `hash01(k)` has no per-whale seed.
- **Fix:** Add `opts.seed` to hash input.

### 20. MAX_STEPS constant out of date
- **Status:** ☐ Not started
- **Severity:** Trivial
- **Description:** Comment says 44, but code never exceeds 40.
- **Fix:** Derive both from one constant, update comment.

### 21. smoothstep edge order needs verification
- **Status:** ☐ Not started
- **Severity:** Medium—if incorrect, silently breaks effects
- **Description:** `smoothstep(0.5, 0.1, t)` and `smoothstep(0.36, 0.04, t)` pass edges in reverse order. Works with GLSL-style implementation; verify your `core/math` version.
- **Check:** Inspect [src/core/math.ts](../src/core/math.ts) or equivalent.
- **Impact:** Throat bulge and jaw lift could be silently flattened if implementation is non-standard.

---

## Anatomy (For "Authentic Blue Whale" Goal)

### 22. Coloring reads as fin whale, not blue whale
- **Status:** ☐ Not started
- **Severity:** Low—species accuracy
- **Description:** Crisp pale belly that sweeps behind head is fin whale/minke pattern. Blue whales are mottled blue-grey overall with lighter (not contrasting) underside.
- **Fix:** Lower belly contrast, let mottling continue onto belly.

### 23. Throat pleats missing
- **Status:** ☐ Not started
- **Severity:** Low—high fidelity detail
- **Description:** Ventral grooves (chin to navel) are the clearest rorqual feature at close LOD. Would help readability.
- **Fix:** Add a few curved strokes gated by `faceDetail`.

### 24. Eye and gape position comment is stale
- **Status:** ☐ Not started
- **Severity:** Low—documentation only
- **Description:** Comment says eye is just behind mouth corner. In code: eye at t=0.17, gape ends at t=0.24, so eye is ahead of corner. Also, eye is on midline (`bh * 0.02`).
- **Fix:** Update comment. Optionally curve gape up so it ends just below and in front of eye.

### 25. Rostrum tip doesn't render
- **Status:** ☐ Not started
- **Severity:** Low—only noticeable at close view
- **Description:** `drawBlob` smooths through midpoints, not vertices, so tip at `fwd=1` disappears.
- **Fix:** Make tip offset follow head profile instead of smoothing away.

---

## Architecture & Performance

### 26. Renderer should be a Mesh, not Graphics
- **Status:** ☐ Not started
- **Severity:** High impact—CPU bottleneck
- **Priority:** Consider for next major refactor
- **Description:** Most CPU cost is Pixi re-tessellating Graphics each frame, not garbage allocation. Each whale's hull, bands, fluke, fins get flattened and triangulated with earcut.
- **Proposal:** Draw body as Pixi `Mesh`—triangle strip along arc-length spine with (t, v) UVs. Move countershade, sheen, seeded mottle, and rim light into fragment shader.
- **Fixes:** 
  - Smooth shading gradients (fixes #16)
  - No LOD popping (fixes #18)
  - Roll mirroring becomes UV flip (fixes #2)
  - Layer alpha stacking goes away (fixes #15)
- **Trade-off:** Requires shader code; keep Graphics for fins or far LOD silhouettes.
- **Estimate:** Significant refactor; candidate for dedicated effort.

### 27. Extract geometry from Pixi first
- **Status:** ◑ Partly done — pure shape math + `rollBasis` extracted to
  `render/whale/geometry.ts` with tests; outline/fin assembly still in the view.
- **Priority:** Enable testing and reduce renderer coupling
- **Description:** Geometry calculation is entangled with Pixi rendering. Pull it out into pure functions.
- **Proposal:** Pure function: `spine + options → outline points + fin anchors (in body space)`.
- **Benefit:** Fixes #1, #2, #5 can be unit-tested with intersection tests, no rendering required.
- **Impact:** Unlocks renderer choice later (Pixi, Three.js, Canvas, etc.).

### 28. Skip offscreen whales
- **Status:** ☐ Not started
- **Severity:** Medium—simple win
- **Description:** No viewport culling. Check spine bounds against camera viewport before building geometry.
- **Estimate:** ~20 lines; ~5–10% perf gain if whales frequently leave screen.

---

## Work Plan Suggestions

### Phase 1: Correctness (Bugs #1–4, #21)
Fix the crashes and silent failures. Verify `smoothstep` behavior first (#21).
- Estimated effort: 2–3 hours

### Phase 2: Geometry (#5–7, #27)
Smooth tangents, arc-length parameterization, feature scaling. Extract geometry as pure functions to enable testing.
- Estimated effort: 4–5 hours
- Blocker for later improvements

### Phase 3: Lighting & Anatomy (#10–14, #22–25)
Fix roll mirroring (#2) first; gates and colors follow.
- Estimated effort: 3–4 hours

### Phase 4: Visual Polish (#15–20, #23)
Gradients, LOD, variety.
- Estimated effort: 2–3 hours

### Phase 5: Architecture (#26, #28)
Long-term refactor to Mesh + shader. Viewport culling as a quick win.
- Estimated effort: 10+ hours (Phase 5.1), 0.5 hours (Phase 5.2)

---

## Tracking

Use checkboxes above to mark progress. Update status from "Not started" → "In progress" → "Done" as you work.

For complex items, consider opening a GitHub issue linked back to this doc.

**Last updated:** 2026-09-11 (#27 progress — spine-frame + cross-section math extracted, see “Next up — whale visuals”)
