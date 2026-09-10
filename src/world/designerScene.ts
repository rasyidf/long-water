/**
 * Synthetic single-purpose levels for the procgen viewer (`tools.html`). Each
 * builder returns a `LevelDef` that stages just one procedural system over a
 * shaped seabed, so a designer can drive it through `SceneHost` (same
 * `applyLevel` path as the game) instead of re-deriving a Pixi scene.
 *
 * These are not validated by `parseLevel` — `SceneHost` feeds them straight to
 * `setActiveLevel` / `applyLevel` — so keep them in shape with `schema.ts`.
 */
import { WORLD_W } from "../config/constants";
import { SPECIES } from "../config/species";
import type { LevelDef, LevelTerrain, SpawnDirective } from "./level/schema";

const SHELF_ZONE = {
  x: 0,
  id: "shelf",
  shelf: 0x17546f,
  deep: 0x0b2a3d,
  tempC: 12,
} as const;

interface LevelOpts {
  finishX?: number;
  /** tiles the whole route is pinned to (default `shelf`) */
  floor?: string;
  terrain?: LevelDef["terrain"];
}

function level(
  id: string,
  spawns: SpawnDirective[],
  opts: LevelOpts = {},
): LevelDef {
  const tile = opts.floor ?? "shelf";
  return {
    id,
    leg: { startX: 300, finishX: opts.finishX ?? 14000 },
    zones: [{ ...SHELF_ZONE }],
    terrain: opts.terrain ?? {
      trenches: false,
      pinnedStart: [[tile]],
      pinnedEnd: [[tile]],
      tileWeights: { [tile]: 100 },
    },
    spawns,
  };
}

export interface CoralParams {
  patchCount: number;
  kinds: number;
  scale: [number, number];
  gap: number;
  reef: boolean;
}

export function buildCoralLevel(p: CoralParams): LevelDef {
  return level(
    "designer-coral",
    [
      {
        kind: "coral",
        mode: "scatter",
        from: 900,
        to: 13500,
        onTiles: ["shelf"],
        maxFloor: 3200,
        patchCount: [p.patchCount, p.patchCount + 1],
        spacing: [110, 150],
        patchDropFloor: 3400,
        kinds: p.kinds,
        scale: p.scale,
        gap: [p.gap, p.gap],
        skipGap: [400, 600],
        ...(p.reef
          ? {
              reef: {
                chance: 1,
                riseFromFloor: [70, 150],
                schoolRise: [120, 300],
                schoolCount: [24, 38],
              },
            }
          : {}),
      },
    ],
    { floor: "shelf" },
  );
}

export interface SquidParams {
  step: number;
  size: [number, number];
  yBand: [number, number];
}

export function buildSquidLevel(p: SquidParams): LevelDef {
  return level(
    "designer-squid",
    [
      {
        kind: "squid",
        mode: "scatter",
        from: 900,
        to: 13500,
        step: [p.step, p.step + 1],
        yBand: p.yBand,
        floorGap: 200,
        size: p.size,
      },
    ],
    { floor: "plain" },
  );
}

export interface FaunaParams {
  count: number;
  spread: [number, number];
  vel: [number, number];
  /** species indices to lay out, in order (defaults to every species) */
  species?: number[];
}

export function buildFaunaLevel(p: FaunaParams): LevelDef {
  const ids = p.species ?? SPECIES.map((_, i) => i);
  const pitch = 1600;
  return level(
    "designer-fauna",
    [
      {
        kind: "school",
        mode: "place",
        items: ids.map((species, i) => ({
          x: 900 + i * pitch,
          y: SPECIES[species].depth
            ? (SPECIES[species].depth![0] + SPECIES[species].depth![1]) / 2
            : 620,
          count: p.count,
          species,
          spread: p.spread,
          vel: p.vel,
        })),
      },
    ],
    { finishX: 900 + ids.length * pitch + 900, floor: "shelf" },
  );
}

export interface TerrainParams {
  trenches: boolean;
  tileWeights: Record<string, number>;
  pinnedStart?: LevelTerrain["pinnedStart"];
  pinnedEnd?: LevelTerrain["pinnedEnd"];
}

export function buildTerrainLevel(p: TerrainParams): LevelDef {
  return level("designer-terrain", [], {
    finishX: WORLD_W - 400,
    terrain: {
      trenches: p.trenches,
      tileWeights: p.tileWeights,
      pinnedStart: p.pinnedStart,
      pinnedEnd: p.pinnedEnd,
    },
  });
}
