/**
 * The object gallery used by `preview.html`. Sculpts a short stretch of seabed
 * and hand-places one of every renderable entity inside a single fixed camera
 * frame, so a renderer tweak can be checked with one screenshot instead of a
 * play-through. Not part of the game — only `Game` in preview mode calls this.
 */
import { COL, NCOL } from "../config/constants";
import { SI } from "../config/species";
import { clamp01 } from "../core/math";
import type { Rng } from "../core/rng";
import { makeSchool } from "./makeSchool";
import type {
  Coral,
  CoralStore,
  KrillStore,
  SchoolStore,
  Swarm,
} from "../state/Fauna";
import type { ParticleStore, ShipStore } from "../state/Hazards";
import type { PlayerWhale } from "../state/PlayerWhale";
import {
  makePodWhale,
  type Pod,
  type PodWhale,
  type PodWhaleInit,
} from "../state/Pod";
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
  const shelf = 660 + Math.sin(x * 0.004) * 44 + Math.sin(x * 0.015 + 1) * 14;
  // a steep, rubble-strewn shelf break, then a deep slope
  const t = clamp01((x - 1560) / 230);
  const deep = 1560 + Math.sin(x * 0.006) * 30;
  let y = shelf + (deep - shelf) * (t * t);
  // a narrow trench slot that plunges off the bottom of the frame
  const d = Math.abs(x - 2500);
  if (d < 55) y = Math.max(y, 2400 - (55 - d) * 22);
  return y;
}

function makeSwarm(rng: Rng, x: number, y: number, r: number): Swarm {
  const parts = [];
  for (let k = 0; k < 120; k++) {
    const a = rng.next() * Math.PI * 2;
    const d = Math.sqrt(rng.next()) * r * 0.8;
    parts.push({
      ox: Math.cos(a) * d * 1.2,
      oy: Math.sin(a) * d * 0.5,
      vx: 0,
      vy: 0,
      ph: rng.next() * 9,
      px: 0,
      py: 0,
    });
  }
  return {
    x,
    y,
    baseY: y,
    r,
    r0: r,
    parts,
    amount: 100,
    lit: 0,
    ph: rng.next() * 9,
    panic: 0,
  };
}

function podWhale(over: PodWhaleInit): PodWhale {
  return makePodWhale({ size: 1, age: 0.95, ...over });
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
  whale.body.x = 1500;
  whale.body.y = 460;
  whale.body.vx = 70;
  whale.body.vy = 0;
  whale.body.facing = 1;
  whale.trail.reset(whale.body.x, whale.body.y);
  whale.body.resetChains();

  // coral patch on the shallow shelf
  const items: Coral[] = [];
  for (let x = 800; x < 1560; x += rng.range(95, 150)) {
    items.push({
      x,
      y: floorAt(x),
      kind: items.length % 5,
      scale: rng.range(0.85, 1.5),
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
      species: SI["reef-tang"],
    }),
  );
  // open-water schools, out of the whale's range — one per draw strategy so the
  // gallery shows the whole species library at once
  schools.schools.push(
    makeSchool(rng, 2300, 470, 34, { species: SI["blue-dart"] }),
  );
  schools.schools.push(
    makeSchool(rng, 2600, 560, 12, { species: SI["eagle-ray"] }),
  );
  schools.schools.push(
    makeSchool(rng, 2450, 700, 14, { species: SI["ribbon-eel"] }),
  );
  schools.schools.push(
    makeSchool(rng, 2750, 380, 10, { species: SI["moon-jelly"] }),
  );

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
  // a calf beside the wild adult — short, stubby, big-headed
  pod.add(
    podWhale({
      x: 400,
      y: 610,
      vx: -8,
      state: "wild",
      lit: 0.8,
      ph: 3.1,
      size: 1,
      age: 0.3,
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
