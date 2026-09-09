/**
 * The object gallery used by `preview.html`. Sculpts a short stretch of seabed
 * and hand-places one of every renderable entity inside a single fixed camera
 * frame, so a renderer tweak can be checked with one screenshot instead of a
 * play-through. Not part of the game — only `Game` in preview mode calls this.
 */
import { COL, NCOL } from "../config/constants";
import { clamp01 } from "../core/math";
import type { Rng } from "../core/rng";
import { makeChain } from "../core/SpineChain";
import type {
  Coral,
  CoralStore,
  KrillStore,
  SchoolStore,
  Swarm,
} from "../state/Fauna";
import type { ParticleStore, ShipStore } from "../state/Hazards";
import type { PlayerWhale } from "../state/PlayerWhale";
import type { Pod, PodWhale } from "../state/Pod";
import type { Heightfield } from "./Heightfield";

/** where `Game` should pin the camera for the preview frame */
export interface PreviewFraming {
  x: number;
  y: number;
  scale: number;
}

/** fixed canvas the preview renders into (CSS px) */
export const PREVIEW_SIZE = { w: 1360, h: 760 } as const;

const FRAMING: PreviewFraming = { x: 1650, y: 760, scale: 0.4 };

/** the sculpted seabed: a sunlit shelf on the left that ramps to a deep plain,
 *  so both shallow (coral) and deep (krill) life have somewhere to sit */
function floorProfile(x: number): number {
  const shelf = 700 + Math.sin(x * 0.004) * 55 + Math.sin(x * 0.015 + 1) * 16;
  const deep = 1680 + Math.sin(x * 0.006) * 35;
  return shelf + (deep - shelf) * clamp01((x - 1550) / 550);
}

function makeSwarm(rng: Rng, x: number, y: number, r: number): Swarm {
  const parts = [];
  for (let k = 0; k < 120; k++)
    parts.push({
      a: rng.next() * Math.PI * 2,
      r: Math.sqrt(rng.next()) * r,
      ph: rng.next() * 9,
      px: 0,
      py: 0,
      kx: 0,
      ky: 0,
    });
  return {
    x,
    y,
    baseY: y,
    r,
    r0: r,
    parts,
    amount: 100,
    lit: 0,
    spin: -1,
    ph: rng.next() * 9,
    panic: 0,
  };
}

function podWhale(over: Partial<PodWhale>): PodWhale {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    state: "wild",
    lit: 0,
    replyAt: 0,
    cool: 0,
    heard: false,
    answeredUntil: 0,
    slot: -1,
    stress: 0,
    hunger: 0,
    nextSong: 0,
    ph: 0,
    size: 0.85,
    wag: 0,
    base: null,
    spine: null,
    ...over,
  };
}

export function buildPreviewScene(
  rng: Rng,
  world: Heightfield,
  whale: PlayerWhale,
  stores: {
    krill: KrillStore;
    schools: SchoolStore;
    coral: CoralStore;
    pod: Pod;
    ships: ShipStore;
    particles: ParticleStore;
  },
): PreviewFraming {
  const { krill, schools, coral, pod, ships, particles } = stores;

  // seabed
  for (let i = 0; i < NCOL; i++) world.floorY[i] = floorProfile(i * COL);
  const floorAt = (x: number): number => floorProfile(x);

  // player whale, over the shelf edge and close to the reef, so its school
  // renders mid-shelter (balled into the coral) while the open-water school
  // off to the right — out of range — stays spread
  whale.x = 1500;
  whale.y = 460;
  whale.vx = 70;
  whale.vy = 0;
  whale.facing = 1;
  whale.trail.reset(whale.x, whale.y);
  makeChain(whale.x, whale.y).forEach((p, i) => {
    whale.spineBase[i].x = p.x;
    whale.spineBase[i].y = p.y;
    whale.spine[i].x = p.x;
    whale.spine[i].y = p.y;
  });

  // coral patch on the shallow shelf
  const items: Coral[] = [];
  for (let x = 1000; x < 1480; x += rng.range(48, 96)) {
    items.push({
      x,
      y: floorAt(x),
      kind: items.length % 3,
      scale: rng.range(0.85, 1.7),
      ph: rng.next() * Math.PI * 2,
    });
  }
  coral.items.push(...items);

  // a reef school anchored to that coral — the player is close, so it renders
  // mid-shelter, balled up against the reef
  const reefHomeY = floorAt(1230) - 70;
  schools.schools.push(
    makeSchool(rng, 1230, reefHomeY - 160, 28, {
      homeX: 1230,
      homeY: reefHomeY,
    }),
  );
  // an open-water school, out of the whale's range — roaming, spread out
  schools.schools.push(makeSchool(rng, 2400, 520, 34));

  // krill swarm, below the light line over the deep plain. KrillSystem swings
  // it ±430 (diel migration) so a screenshot catches it anywhere in that band.
  krill.swarms.push(makeSwarm(rng, 2750, 1150, 380));

  // whales: a wild one and an answering one, side by side on the left.
  // `lit` is normally decayed by PodSystem (absent here) — seed it so the
  // bodies read clearly instead of vanishing into the blue.
  pod.add(
    podWhale({
      x: 250,
      y: 540,
      vx: -8,
      state: "wild",
      lit: 0.8,
      ph: 1.7,
      size: 1.05,
    }),
  );
  pod.add(
    podWhale({
      x: 560,
      y: 720,
      vx: -12,
      state: "answered",
      answeredUntil: 1e9,
      lit: 0.8,
      ph: 4.2,
      size: 1.05,
    }),
  );

  // a ship at the surface, off to one side
  ships.ships.push({ x: 850, v: 24, len: 1000 });

  // a small marine-snow field
  for (let i = 0; i < 160; i++)
    particles.snow.push({
      x: rng.next() * 4000,
      y: rng.next() * 4000,
      s: rng.range(0.4, 1.6),
      d: rng.range(0.35, 1),
    });

  return FRAMING;
}

function makeSchool(
  rng: Rng,
  x: number,
  y: number,
  n: number,
  over: { homeX?: number; homeY?: number } = {},
) {
  const fish = [];
  for (let i = 0; i < n; i++)
    fish.push({
      x: x + rng.range(-190, 190),
      y: y + rng.range(-120, 120),
      vx: rng.range(-30, 30),
      vy: rng.range(-14, 14),
    });
  return {
    x,
    y,
    ax: x,
    ay: y,
    fish,
    lit: 0,
    ph: rng.next() * 9,
    shelter: 0,
    ...over,
  };
}
