/**
 * Builds a fish `School` (boids swarm) for the spawner and the preview gallery.
 * The species roll happens here — after the fish and `ph` are drawn from the
 * stream, so per-fish values stay identical to the pre-species spawner; only
 * what spawns *after* schools shifts for a given seed.
 */
import { DARK_START } from "../config/constants";
import type { Rng } from "../core/rng";
import type { Fish, School } from "../state/Fauna";
import {
  DEEP_POOL,
  OPEN_POOL,
  REEF_POOL,
  SPECIES,
  type SpeciesProfile,
} from "../config/species";

function inBand(p: SpeciesProfile, y: number): boolean {
  return !p.depth || (y >= p.depth[0] && y <= p.depth[1]);
}

/** weighted pick over the habitat pool, skipping species whose depth band
 *  excludes `y`; falls back to the unfiltered pool if that leaves nothing. */
export function pickSpecies(
  rng: Rng,
  habitat: "open" | "reef" | "deep",
  y: number,
): number {
  const base =
    habitat === "reef" ? REEF_POOL : habitat === "deep" ? DEEP_POOL : OPEN_POOL;
  const pool = base.filter((i) => inBand(SPECIES[i], y));
  const use = pool.length ? pool : base;
  let total = 0;
  for (const i of use) total += SPECIES[i].weight;
  let r = rng.next() * total;
  for (const i of use) {
    r -= SPECIES[i].weight;
    if (r <= 0) return i;
  }
  return use[use.length - 1];
}

export interface MakeSchoolOpts {
  homeX?: number;
  homeY?: number;
  /** force a species index (preview gallery); otherwise rolled from the pool */
  species?: number;
  /** fish position jitter [x, y] in world units; default [190, 120] */
  spread?: [number, number];
  /** fish velocity jitter [vx, vy] in world units/s; default [30, 14] */
  vel?: [number, number];
}

export function makeSchool(
  rng: Rng,
  x: number,
  y: number,
  n: number,
  over: MakeSchoolOpts = {},
): School {
  const reef = over.homeX !== undefined && over.homeY !== undefined;
  const [sx, sy] = over.spread ?? [190, 120];
  const [vx, vy] = over.vel ?? [30, 14];

  const fish: Fish[] = [];
  for (let i = 0; i < n; i++)
    fish.push({
      x: x + rng.range(-sx, sx),
      y: y + rng.range(-sy, sy),
      vx: rng.range(-vx, vx),
      vy: rng.range(-vy, vy),
    });

  const ph = rng.next() * 9;
  const habitat = reef ? "reef" : y >= DARK_START ? "deep" : "open";
  const species = over.species ?? pickSpecies(rng, habitat, y);

  return {
    x,
    y,
    ax: x,
    ay: y,
    fish,
    lit: 0,
    ph,
    shelter: 0,
    species,
    ...(reef ? { homeX: over.homeX, homeY: over.homeY } : {}),
  };
}
