# Level files

One `*.json` file here = one runnable stage. The file the game loads is picked by
`?level=<id>` (default `crossing`); the `<id>` is the filename without `.json`
and must match the `"id"` field inside.

`src/world/level/validate.ts` parses a file into a `LevelDef`
(`src/world/level/schema.ts`); `src/world/level/apply.ts` turns its `spawns` into
the live stores. This is the format a level-builder tool reads and writes.

## Top level

| field     | notes |
|-----------|-------|
| `id`      | must equal the filename stem |
| `seed`    | optional. `?seed=` wins, then this, then the built-in default |
| `leg`     | `{ startX, finishX }` — world x of the spawn point and the win line |
| `zones`   | ordered; first `x` is `0`, `x` strictly increasing. `{ x, id, shelf, deep, tempC }`. `shelf`/`deep` are packed-rgb (`"0x17546f"`, `"#17546f"`, or a number); `tempC` is the surface temperature anchor |
| `terrain` | optional, all fields optional — see below |
| `spawns`  | ordered list of directives — see below |

### `terrain`

Reweights / repins the WFC seabed. Tile *names* come from `src/config/tiles.ts`
(`shelf slope plain ridge seamount canyon trench`) — adding a new tile is still a
code change.

| field         | default | meaning |
|---------------|---------|---------|
| `tileWeights` | `{}`    | per-tile multiplier on the base weight, e.g. `{ "seamount": 1.6 }` |
| `pinnedStart` | `[["shelf"],["shelf"]]` | allowed tiles for cells `0,1,…` at the start |
| `pinnedEnd`   | `[["shelf"],["shelf","slope"]]` | allowed tiles for cells `n-1,n-2,…` at the finish |
| `trenches`    | `true`  | carve near-vertical slots through canyon/trench cells |

## Spawn directives

Every directive has a `kind`. All but `snow` also have a `mode`:

- **`scatter`** — a parametric band: step `from → to` by `rng.range(step)` and
  emit at each stop. Reproduces the hand-written world.
- **`place`** — an explicit `items: [...]` list at exact coordinates. What the
  builder produces when you drop an entity by hand.

`[min, max]` fields are drawn with `rng.range(min, max)` per instance — equal
endpoints give a fixed value.

> **Order is rng order.** The loader draws from one seeded stream in directive
> order, so moving a directive shifts every seeded placement after it. Keep a
> level's directives stable once its seed matters.

### `krill`
- scatter: `from to step`, `skipTiles?`, `yBand [a,b]`, `floorGap`, `minY?`
  (default = light line), `r [a,b]`. y is `min(floor - floorGap, rng.range(yBand))`.
- place: `items: [{ x, y, r }]`

### `school` (cosmetic fish boids)
- scatter: `from to step`, `count`, `yTop`, `floorGap`, `yClamp [a,b]`,
  `spread? [x,y]`, `vel? [x,y]`. y is `clamp(rng.range(yTop, floor - floorGap), yClamp)`.
- place: `items: [{ x, y, count, species?, spread?, vel?, homeX?, homeY? }]`
  (give `homeX`/`homeY` for a coral-sheltering reef school)

### `whale` (wild pod whales)
- scatter: `from to step`, `y [a,b]`, `age [a,b]`, `vx [a,b]`, `size [a,b]`,
  `calf?: { chance, dx [a,b], dy [a,b], age [a,b] }`
- place: `vx size age` (shared ranges) + `items: [{ x, y }]`

### `ship`
- scatter: `from to step`, `v [a,b]`, `len [a,b]`
- place: `items: [{ x, v, len }]`

### `coral` (static growths + optional reef school)
- scatter: `from to`, `onTiles`, `maxFloor`, `patchCount [lo,hi]`,
  `spacing [a,b]`, `patchDropFloor`, `kinds` (count), `scale [a,b]`,
  `gap [a,b]` (advance after a patch), `skipGap [a,b]` (advance when the tile
  doesn't qualify), `reef?: { chance, riseFromFloor [a,b], schoolRise [a,b],
  schoolCount [lo,hi] }`
- place: `items: [{ x, y, kind, scale }]`

### `snow` (marine-snow parallax field)
- `count`, `area? [w,h]` (default `[4000,4000]`), `s? [a,b]`, `d? [a,b]`

## Adding a level

1. Copy `crossing.json`, rename, set `"id"` to the new stem.
2. Add its i18n keys to `src/i18n/en.ts`: `leg.<id>.goal`,
   `leg.<id>.distanceSpelled`, and a `zone.<zoneId>` for any new zone id.
3. Load it with `?level=<id>`.
