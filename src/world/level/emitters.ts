/**
 * One emitter per entity kind. Each consumes a spawn directive and writes the
 * matching store. The rng draw order inside every emitter mirrors the old
 * `WorldSpawner` blocks, so a given seed reproduces the pre-file world when it
 * runs the same directives in the same order (`levels/crossing.json`).
 */
import { DARK_START } from "../../config/constants";
import { LAIR_FLOOR_GAP, SIZE as SQUID_SIZE } from "../../config/squid";
import { clamp } from "../../core/math";
import type { Rng } from "../../core/rng";
import type {
  CoralStore,
  KrillPart,
  KrillStore,
  SchoolStore,
  Swarm,
} from "../../state/Fauna";
import type { ParticleStore, ShipStore } from "../../state/Hazards";
import { makePodWhale, type Pod } from "../../state/Pod";
import { makeSquid, type SquidStore } from "../../state/Squid";
import type { Heightfield } from "../Heightfield";
import { makeSchool } from "../makeSchool";
import type {
  CoralPlace,
  CoralScatter,
  KrillPlace,
  KrillScatter,
  Range,
  SchoolPlace,
  SchoolScatter,
  ShipPlace,
  ShipScatter,
  SnowField,
  SquidPlace,
  SquidScatter,
  WhalePlace,
  WhaleScatter,
} from "./schema";

export interface Stores {
  krill: KrillStore;
  schools: SchoolStore;
  coral: CoralStore;
  pod: Pod;
  ships: ShipStore;
  squid: SquidStore;
  particles: ParticleStore;
}

const rr = (rng: Rng, r: Range): number => rng.range(r[0], r[1]);
/** `lo + int(rng.next() * (hi - lo))` — the old `2 + ((rng.next()*4)|0)` idiom */
const rint = (rng: Rng, r: Range): number =>
  r[0] + ((rng.next() * (r[1] - r[0])) | 0);

function makeSwarm(rng: Rng, x: number, y: number, r: number): Swarm {
  const parts: KrillPart[] = [];
  for (let k = 0; k < 120; k++) {
    // seed a flat, horizontally drawn-out patch; KrillSystem takes it from there
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
  rng.next(); // was the swarm's spin; still drawn so seeded layouts don't shift
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

export function emitKrill(
  rng: Rng,
  world: Heightfield,
  { krill }: Stores,
  d: KrillScatter | KrillPlace,
): void {
  if (d.mode === "place") {
    for (const it of d.items)
      krill.swarms.push(makeSwarm(rng, it.x, it.y, it.r));
    return;
  }
  const minY = d.minY ?? DARK_START;
  const skip = new Set(d.skipTiles ?? []);
  for (let x = d.from; x < d.to; x += rr(rng, d.step)) {
    if (skip.has(world.tileNameAt(x))) continue;
    const y = Math.min(world.floorAt(x) - d.floorGap, rr(rng, d.yBand));
    if (y < minY) continue;
    krill.swarms.push(makeSwarm(rng, x, y, rr(rng, d.r)));
  }
}

export function emitSchools(
  rng: Rng,
  world: Heightfield,
  { schools }: Stores,
  d: SchoolScatter | SchoolPlace,
): void {
  if (d.mode === "place") {
    for (const it of d.items)
      schools.schools.push(
        makeSchool(rng, it.x, it.y, it.count, {
          species: it.species,
          spread: it.spread,
          vel: it.vel,
          homeX: it.homeX,
          homeY: it.homeY,
        }),
      );
    return;
  }
  for (let x = d.from; x < d.to; x += rr(rng, d.step)) {
    const y = clamp(
      rng.range(d.yTop, world.floorAt(x) - d.floorGap),
      d.yClamp[0],
      d.yClamp[1],
    );
    schools.schools.push(
      makeSchool(rng, x, y, d.count, { spread: d.spread, vel: d.vel }),
    );
  }
}

export function emitWhales(
  rng: Rng,
  _world: Heightfield,
  { pod }: Stores,
  d: WhaleScatter | WhalePlace,
): void {
  const add = (
    x: number,
    y: number,
    age: number,
    vx: Range,
    size: Range,
  ): void => {
    pod.add(
      makePodWhale({
        x,
        y,
        vx: rr(rng, vx),
        state: "wild",
        ph: rng.next() * 9,
        size: rr(rng, size),
        age,
      }),
    );
  };

  if (d.mode === "place") {
    for (const it of d.items) add(it.x, it.y, rr(rng, d.age), d.vx, d.size);
    return;
  }
  for (let x = d.from; x < d.to; x += rr(rng, d.step)) {
    const y = rr(rng, d.y);
    add(x, y, rr(rng, d.age), d.vx, d.size);
    if (d.calf && rng.next() < d.calf.chance)
      add(
        x + rr(rng, d.calf.dx),
        y + rr(rng, d.calf.dy),
        rr(rng, d.calf.age),
        d.vx,
        d.size,
      );
  }
}

export function emitShips(
  rng: Rng,
  _world: Heightfield,
  { ships }: Stores,
  d: ShipScatter | ShipPlace,
): void {
  if (d.mode === "place") {
    for (const it of d.items)
      ships.ships.push({ x: it.x, v: it.v, len: it.len });
    return;
  }
  for (let x = d.from; x < d.to; x += rr(rng, d.step))
    ships.ships.push({ x, v: rr(rng, d.v), len: rr(rng, d.len) });
}

export function emitCoral(
  rng: Rng,
  world: Heightfield,
  { coral, schools }: Stores,
  d: CoralScatter | CoralPlace,
): void {
  if (d.mode === "place") {
    for (const it of d.items)
      coral.items.push({
        x: it.x,
        y: it.y,
        kind: it.kind,
        scale: it.scale,
        ph: 0,
      });
    return;
  }
  const on = new Set(d.onTiles);
  for (let x = d.from; x < d.to;) {
    const t = world.tileNameAt(x);
    if (on.has(t) && world.floorAt(x) < d.maxFloor) {
      const count = rint(rng, d.patchCount);
      let cx = x;
      for (let k = 0; k < count; k++) {
        cx += rr(rng, d.spacing);
        const cy = world.floorAt(cx);
        if (cy > d.patchDropFloor) break;
        coral.items.push({
          x: cx,
          y: cy,
          kind: (rng.next() * d.kinds) | 0,
          scale: rr(rng, d.scale),
          ph: rng.next() * Math.PI * 2,
        });
      }
      if (d.reef && rng.next() < d.reef.chance) {
        const mid = (x + cx) / 2;
        const homeY = world.floorAt(mid) - rr(rng, d.reef.riseFromFloor);
        const sy = homeY - rr(rng, d.reef.schoolRise);
        const n = rint(rng, d.reef.schoolCount);
        schools.schools.push(
          makeSchool(rng, mid, sy, n, { homeX: mid, homeY }),
        );
      }
      x = cx + rr(rng, d.gap);
    } else {
      x += rr(rng, d.skipGap);
    }
  }
}

export function emitSquid(
  rng: Rng,
  world: Heightfield,
  { squid }: Stores,
  d: SquidPlace | SquidScatter,
): void {
  if (d.mode === "place") {
    for (const it of d.items)
      squid.squids.push(
        makeSquid({
          x: it.x,
          y: Math.min(it.y, world.floorAt(it.x) - LAIR_FLOOR_GAP),
          size: rr(rng, it.size ?? SQUID_SIZE),
          ph: rng.next() * Math.PI * 2,
        }),
      );
    return;
  }
  for (let x = d.from; x < d.to; x += rr(rng, d.step)) {
    const y = Math.min(world.floorAt(x) - LAIR_FLOOR_GAP, rr(rng, d.yBand));
    squid.squids.push(
      makeSquid({ x, y, size: rr(rng, d.size), ph: rng.next() * Math.PI * 2 }),
    );
  }
}

export function emitSnow(
  rng: Rng,
  _world: Heightfield,
  { particles }: Stores,
  d: SnowField,
): void {
  const [ax, ay] = d.area ?? [4000, 4000];
  const s = d.s ?? [0.4, 1.6];
  const dep = d.d ?? [0.35, 1];
  for (let i = 0; i < d.count; i++)
    particles.snow.push({
      x: rng.next() * ax,
      y: rng.next() * ay,
      s: rr(rng, s),
      d: rr(rng, dep),
    });
}
