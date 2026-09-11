# Reef pass — fixes, backlog, and a socket-based WFC template

## 1. Jagged / disconnected lines — what they were, what changed

### Waterline (`render/BackgroundRenderer.ts`)
The water body is a flat-topped sprite rectangle. Its upper edge cut a
dead-straight horizontal line across the wave crests while the foam stroke
wiggled separately above it — two lines that never met.

- Paint an **opaque wavy apron** in the water's own surface colour, from the
  waveline down past the sprite's straight edge, so there is no seam to see.
- Foam is now a **soft wide pass under a crisp thread**, both `cap/join: round`,
  so it never breaks on the steep face of a wave. Subdivisions 40 → 72.
- The shelf→deep stop in the water gradient was a flat-then-ramp join that read
  as a faint horizontal Mach band mid-column; added an eased midpoint stop.

### Seabed crest highlight (`render/TerrainRenderer.ts`)
The lit rim was a row of **flat per-column rects** (`g.rect(...)` every 24 u).
On a curved crest each rect sat at a different height and none of them touched —
a dashed line. It's now a **stroke that traces the exact spline** the fill's top
edge follows (`quadraticCurveTo` through the same midpoints), with per-segment
alpha from the ambient light and round caps, so it hugs the silhouette and just
fades out over dark columns.

## 2. Coral rework (`render/coral/`)

Old coral was bare wireframe strokes (the "spider firework" fans). Every
growth is now a **filled silhouette + rim/vein highlight + contact shadow**,
colour sunk toward the water with a per-item hue jitter so a patch isn't
monochrome. Seven kinds (`Coral.kind % KIND_COUNT`, names in
`render/coral/geometry.ts`):

| kind | name        | shape | moves |
|------|-------------|-------|-------|
| 0    | sea fan     | filled membrane on a stalk, radiating veins, polyps beading the edge | leans with the current; a ripple flutters across the edge |
| 1    | staghorn    | recursively branching tapered arms (depth 1–4), budded tips | rigid trunks, only the outer tips give |
| 2    | brain       | filled dome with a scalloped outline, nested contour grooves, sunlit shoulder | rock — never moves; polyps stir in the outer groove |
| 3    | tube sponge | clump of 3–5 tapered tubes, dark mouths + bright lips, pores up the lit flank | mouths breathe on their own phase |
| 4    | sea whip    | three tall thin strands studded with polyps | bends most; each strand adds its own wave |
| 5    | anemone     | squat soft column, oral disc + mouth, ring of 10–16 tapered tentacles | column leans; every tentacle wobbles independently |
| 6    | table       | stem under a flat scalloped plate, shadowed underside, fingers on top | plate barely moves; fingers sway |

### 2026-09-11 — procedural pass (whale-standard)

`render/CoralRenderer.ts` is now a thin consumer (cull, ambient + sonar
light) delegating to `render/coral/ProceduralCoralView.ts`, with the shape
math split into a pure `render/coral/geometry.ts` (+ `geometry.test.ts`, 40
cases) the same way `render/whale/` is organised:

- **Genome, not state.** Height, spread, lean, hue tone, limb counts and
  branch jitter are hashed off the item's seabed `x` (`genome()`), so two
  growths of one kind never match and nothing new is stored on `Coral`.
- **One current for the patch.** `currentAt(seed, x, t)` is fbm over `x`
  (slow surge + a quicker gust term), so neighbours lean together with a
  phase lag along the shelf instead of each on its own metronome.
  `swayAt(fy, current, stiffness)` bends quadratically up the growth with the
  holdfast pinned; per-kind `STIFFNESS` decides how much each gives.
- **Light from above.** A rim highlight on the sun-facing upper edges (side
  from `sunLean()`, so it agrees with the god-rays and ship shadows), a form
  shadow at the root, the contact shadow on the rock. Depth sinks the hue
  toward the water and drops the warm channels first (`sinkColor`), the cheap
  colour-absorption cue; a sonar sweep lifts the tips back up.
- **Life.** Fan flutter, breathing tube mouths, pulsing polyps, wobbling
  anemone tentacles, swaying table fingers — all off `clock.t` and the item's
  phase, all dialled by `CoralParams`.
- **LOD** on on-screen height: veins, buds, grooves, polyps and the outer
  staghorn levels fade in with `smoothstep`, nothing pops.
- **Zero per-frame allocation**: pooled outline points, a pooled staghorn
  segment array, a palette cache keyed on quantised hue / light / sonar.
- **Dials** live in `render/coral/params.ts` (`CORAL_DEFAULTS`, live override
  via `setCoralParams`) and are all exposed in the designer:
  `tools.html#coral` now has a **body** mode (one growth per kind on a flat
  rock, hover/pin draw sections with the source block shown, isolate kinds)
  and the original **scene** mode (level-driven scatter), both reading the
  same live params. `scripts/shot-coral.mjs` drives it for screenshots.

Still open from §3: encrusting mats, bleached variants, coral ambient
occlusion on the rock, polyp shimmer in shafts / at night (needs the glow
pass), a kelp zone.

## 3. Backlog — what else the reef / stage can take

**Coral & rock**
- ~~Table/plate coral~~ — shipped as kind 6 (2026-09-11).
- ~~Anemone~~ — shipped as kind 5 (2026-09-11); bubble coral still open.
- Encrusting mats — low colour patches painted straight onto the rock crest.
- Bleached / dead patches — desaturated variants for visual rhythm.
- Coral ambient occlusion — a soft dark gradient the growth drops on the rock.
- Polyp shimmer at night / in shafts — tiny additive sparkles on tips.

**Seabed**
- Kelp forest zone — tall parallax fronds, its own light attenuation.
- Rock arches / overhangs cut into `seamount` and `canyon-lip` tiles.
- Boulder scatter + sand ripples as a cheap detail layer on `plain`.
- Silt puff when the whale skims the bottom.
- Caustic texture actually projected onto seabed + coral + whale (not just a
  screen band).

**Surface & water column**
- Sky: time-of-day gradient, a sun disc with a moving specular glint band.
- Floating kelp mats / debris at the waterline; rain dimpling in storms.
- Thermocline: one faint refraction-shimmer layer at ~600 u.
- Colour absorption with depth (reds drop out first) — a cheap tint LUT.
- Bioluminescence sparks below `DARK_START`.

## 4. A proper socket-based WFC template

The current `config/tiles.ts` `RULES` is a hand-written symmetric adjacency
dict — easy to get inconsistent as tiles are added. Proper WFC derives adjacency
from **edge sockets**: each tile has a socket id on its left and right edge, and
`a` may sit left of `b` iff `a.right === b.left`. Adjacency becomes automatic and
transitions become explicit tiles.

### 4a. Terrain tiles (1D, one row of cells along the route)

Socket = an elevation class: `HI` (shelf/peak), `MID` (slope/ridge),
`LO` (abyssal plain), `DP` (canyon/trench).

```
tile          L    R     depth band     rough  weight   silhouette (L→R)
────────────────────────────────────────────────────────────────────────
shelf         HI   HI     420– 900      0.30   2.2      ▁▁▁▁▁▁▁▁
seamount      HI   HI     620–1500      1.30   0.8      ▁▁_╱▔▔╲_▁▁
shelf-break*  HI   MID    900–1800      0.50   1.4      ▔▔▔╲▁▁▁▁▁      (new)
slope         MID  MID   1500–2700      0.55   1.7      ╲╲╲╲╲╲╲╲
ridge         MID  MID   2000–2500      1.00   1.1      ╱▔╲╱▔╲╱▔╲
basin-in*     MID  LO    2700–3150      0.50   1.2      ╲╲▁▁▁▁▁▁▁      (new)
plain         LO   LO    2950–3250      0.20   3.0      ▁▁▁▁▁▁▁▁
canyon-lip*   LO   DP    3250–3650      0.85   0.9      ▁▁▁▁▁▁╲▏       (new)
canyon        DP   DP    3350–3900      0.85   0.7      ▏╲╱╲╱╲▕
trench        DP   DP    4100–4600      0.45   0.5      ▏▁▁▁▁▁▏
canyon-out*   DP   LO    3250–3650      0.85   0.9      ▏╱▔▔▔▔▔▔       (new)
```

Socket adjacency matrix (● = legal `row` left-of `col`):

```
            shelf sea  brk  slope ridge bIn  plain cLip canyon trench cOut
shelf         ●    ●    ●     ·     ·    ·     ·    ·     ·      ·     ·
seamount      ●    ●    ●     ·     ·    ·     ·    ·     ·      ·     ·
shelf-break   ·    ·    ·     ●     ●    ●     ·    ·     ·      ·     ·
slope         ·    ·    ·     ●     ●    ●     ·    ·     ·      ·     ·
ridge         ·    ·    ·     ●     ●    ●     ·    ·     ·      ·     ·
basin-in      ·    ·    ·     ·     ·    ·     ●    ●     ·      ·     ·
plain         ·    ·    ·     ·     ·    ·     ●    ●     ·      ·     ·
canyon-lip    ·    ·    ·     ·     ·    ·     ·    ·     ●      ●     ·
canyon        ·    ·    ·     ·     ·    ·     ·    ·     ●      ●     ●
trench        ·    ·    ·     ·     ·    ·     ·    ·     ●      ●     ●
canyon-out    ·    ·    ·     ·     ·    ·     ●    ●     ·      ·     ·
```

Route ends pin to a `HI`-left tile (`shelf`/`seamount`), same as today. The
payoff: you can no longer jump shelf→plain; the collapse is *forced* through
`shelf-break → slope → basin-in`, so every depth change is a legible landform.

Code shape:

```ts
interface Tile {
  name: string;
  sock: [left: Sock, right: Sock];   // replaces RULES
  depth: [number, number];
  rough: number;
  weight: number;
}
const canConnect = (a: Tile, b: Tile) => a.sock[1] === b.sock[0];
// Wfc.ts builds ADJ from canConnect() instead of reading RULES.
```

### 4b. Reef-zonation tiles (1D, second pass — only over `HI` terrain spans)

Run a second tiny WFC over just the columns whose terrain tile is `shelf` or
`seamount`. It produces a reef cross-section that decides *what* coral spawns
where, instead of `kind = rng()*5`.

Socket = `SAND` | `REEF` | `CREST` | `DROP`.

```
zone         L      R       coral it seeds                        density
──────────────────────────────────────────────────────────────────────────
sand         SAND   SAND    none, occasional lone whip            ·
back-reef    SAND   REEF    brain + tube sponge, sheltered        ▒
reef-flat    REEF   REEF    staghorn thickets                     ▓
reef-crest   REEF   CREST   mixed + tallest; anchors a fish school ▓▓
fore-reef    CREST  DROP    sea fans (turned to face open water)  ▒
drop-off     DROP   DROP    fans + whips clinging to the wall     ▒
```

```
   SAND ── back-reef ── reef-flat ── reef-crest ── fore-reef ── drop-off
   ▁▁▁▁▁▁▁▁░░░░░░▒▒▒▒▒▒▓▓▓▓▓▓▓█▓▓▓▓▒▒▒▒░░░░
   whip     brain    staghorn   crest+school   fans      wall fans
            sponge              (tallest)     (face →)
```

Enforced order (sockets): `sand → back-reef → reef-flat → reef-crest →
fore-reef → drop-off`, and `drop-off` only terminates a span. A patch now reads
as a real reef profile — calm rubble behind, dense flat, tall crest, fans on the
seaward face.
