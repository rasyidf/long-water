/**
 * The shape of a level file (`src/world/levels/<id>.json`) — the single artifact
 * that describes one run's stage: terrain knobs, the leg, the zones, and every
 * entity spawn. A future level-builder tool reads and writes this format.
 *
 * `parseLevel` in `./validate.ts` turns untrusted JSON into a `LevelDef`;
 * `applyLevel` in `./apply.ts` interprets `spawns` into the stores.
 *
 * Conventions:
 * - A `Range` is `[min, max]`; the loader draws `rng.range(min, max)` per
 *   instance. Equal endpoints = a fixed value.
 * - `spawns` order **is** the rng draw order — reordering directives changes
 *   every seeded placement after the move.
 */

export type Range = [number, number];

export interface LevelLeg {
  /** world x the whale spawns at */
  startX: number;
  /** world x that ends the leg (the win line) */
  finishX: number;
}

export interface LevelZone {
  /** world x this zone starts at; strictly increasing, first is 0 */
  x: number;
  /** stable key: water texture + `zone.<id>` i18n lookup */
  id: string;
  /** shelf/deep water gradient anchors (packed rgb; JSON may use "0x.." / "#..") */
  shelf: number;
  deep: number;
  /** approx surface temperature (°C) at this anchor */
  tempC: number;
}

export interface LevelTerrain {
  /** allowed tiles for cells 0,1,… at the start; default `[["shelf"],["shelf"]]` */
  pinnedStart?: string[][];
  /** allowed tiles for cells n-1,n-2,… at the end; default `[["shelf"],["shelf","slope"]]` */
  pinnedEnd?: string[][];
  /** per-tile weight multiplier on top of `config/tiles.ts` */
  tileWeights?: Record<string, number>;
  /** carve near-vertical slots through canyon/trench cells; default true */
  trenches?: boolean;
}

/* ── spawn directives ─────────────────────────────────────────────────────── */

export interface KrillScatter {
  kind: "krill";
  mode: "scatter";
  from: number;
  to: number;
  step: Range;
  /** tile names the band skips over */
  skipTiles?: string[];
  /** target depth band; actual y is `min(floor - floorGap, rng.range(yBand))` */
  yBand: Range;
  floorGap: number;
  /** swarms shallower than this are dropped (default `DARK_START`) */
  minY?: number;
  r: Range;
}
export interface KrillPlace {
  kind: "krill";
  mode: "place";
  items: { x: number; y: number; r: number }[];
}

export interface SchoolScatter {
  kind: "school";
  mode: "scatter";
  from: number;
  to: number;
  step: Range;
  count: number;
  /** y is `clamp(rng.range(yTop, floor - floorGap), yClamp)` */
  yTop: number;
  floorGap: number;
  yClamp: Range;
  spread?: Range;
  vel?: Range;
}
export interface SchoolPlace {
  kind: "school";
  mode: "place";
  items: {
    x: number;
    y: number;
    count: number;
    species?: number;
    spread?: Range;
    vel?: Range;
    homeX?: number;
    homeY?: number;
  }[];
}

export interface WhaleCalf {
  chance: number;
  dx: Range;
  dy: Range;
  age: Range;
}
export interface WhaleScatter {
  kind: "whale";
  mode: "scatter";
  from: number;
  to: number;
  step: Range;
  y: Range;
  age: Range;
  vx: Range;
  size: Range;
  calf?: WhaleCalf;
}
export interface WhalePlace {
  kind: "whale";
  mode: "place";
  vx: Range;
  size: Range;
  age: Range;
  items: { x: number; y: number }[];
}

export interface ShipScatter {
  kind: "ship";
  mode: "scatter";
  from: number;
  to: number;
  step: Range;
  v: Range;
  len: Range;
}
export interface ShipPlace {
  kind: "ship";
  mode: "place";
  items: { x: number; v: number; len: number }[];
}

export interface CoralScatter {
  kind: "coral";
  mode: "scatter";
  from: number;
  to: number;
  onTiles: string[];
  maxFloor: number;
  /** patch size: `patchCount[0] + int(rng.next() * (patchCount[1] - patchCount[0]))` */
  patchCount: Range;
  spacing: Range;
  /** a patch stops if the floor drops past here */
  patchDropFloor: number;
  /** `int(rng.next() * kinds)` picks the coral kind — up to `KIND_COUNT` (7)
   *  in `render/coral/geometry.ts`; 5 keeps the original five */
  kinds: number;
  scale: Range;
  /** x advance after a patch / when the tile does not qualify */
  gap: Range;
  skipGap: Range;
  reef?: {
    chance: number;
    riseFromFloor: Range;
    schoolRise: Range;
    /** `schoolCount[0] + int(rng.next() * (schoolCount[1] - schoolCount[0]))` */
    schoolCount: Range;
  };
}
export interface CoralPlace {
  kind: "coral";
  mode: "place";
  items: { x: number; y: number; kind: number; scale: number }[];
}

export interface SquidPlace {
  kind: "squid";
  mode: "place";
  items: { x: number; y: number; size?: Range }[];
}
export interface SquidScatter {
  kind: "squid";
  mode: "scatter";
  from: number;
  to: number;
  /** large — squid are rare; y is `min(floor - floorGap, rng.range(yBand))` */
  step: Range;
  yBand: Range;
  floorGap: number;
  size: Range;
}

export interface SnowField {
  kind: "snow";
  count: number;
  /** field size in screen-wrapped world units; default [4000, 4000] */
  area?: Range;
  s?: Range;
  d?: Range;
}

export type SpawnDirective =
  | KrillScatter
  | KrillPlace
  | SchoolScatter
  | SchoolPlace
  | WhaleScatter
  | WhalePlace
  | ShipScatter
  | ShipPlace
  | CoralScatter
  | CoralPlace
  | SquidPlace
  | SquidScatter
  | SnowField;

export interface LevelDef {
  id: string;
  /** seed override; `?seed=` still wins, then this, then `DEFAULT_SEED` */
  seed?: number;
  leg: LevelLeg;
  zones: LevelZone[];
  terrain: Required<Pick<LevelTerrain, "trenches">> & LevelTerrain;
  spawns: SpawnDirective[];
}
