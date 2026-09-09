/**
 * Populates the dynamic stores from the generated world. Pure setup: reads the
 * heightfield + rng, writes entities. Each block is independent — delete one or
 * add another without touching the rest.
 */
import { DARK_START, WORLD_W } from "../config/constants";
import type { Rng } from "../core/rng";
import type {
  CoralStore,
  KrillPart,
  KrillStore,
  SchoolStore,
  Swarm,
} from "../state/Fauna";
import type { ParticleStore, ShipStore } from "../state/Hazards";
import type { Pod } from "../state/Pod";
import { clamp } from "../core/math";
import type { Heightfield } from "./Heightfield";

function makeSwarm(rng: Rng, x: number, y: number, r: number): Swarm {
  const parts: KrillPart[] = [];
  for (let k = 0; k < 120; k++) {
    parts.push({
      a: rng.next() * Math.PI * 2,
      r: Math.sqrt(rng.next()) * r,
      ph: rng.next() * 9,
      px: 0,
      py: 0,
      kx: 0,
      ky: 0,
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
    spin: rng.next() < 0.5 ? -1 : 1,
    ph: rng.next() * 9,
    panic: 0,
  };
}

export function spawnWorld(
  rng: Rng,
  world: Heightfield,
  stores: {
    krill: KrillStore;
    schools: SchoolStore;
    coral: CoralStore;
    pod: Pod;
    ships: ShipStore;
    particles: ParticleStore;
  },
): void {
  const { krill, schools, coral, pod, ships, particles } = stores;

  // krill — sits over upwelling, not on rock
  krill.swarms.push(makeSwarm(rng, 2400, 1450, 420));
  for (let x = 6200; x < WORLD_W - 2000; x += rng.range(4200, 8600)) {
    const t = world.tileNameAt(x);
    if (t === "seamount" || t === "shelf") continue;
    const y = Math.min(world.floorAt(x) - 420, rng.range(1250, 2600));
    if (y < DARK_START) continue;
    krill.swarms.push(makeSwarm(rng, x, y, rng.range(300, 560)));
  }

  // fish schools (boids) — not food
  for (let x = 3000; x < WORLD_W - 2000; x += rng.range(5000, 9000)) {
    const y = clamp(rng.range(300, world.floorAt(x) - 500), 200, 3200);
    const fish = [];
    for (let i = 0; i < 34; i++)
      fish.push({
        x: x + rng.range(-260, 260),
        y: y + rng.range(-160, 160),
        vx: rng.range(-40, 40),
        vy: rng.range(-18, 18),
      });
    schools.schools.push({
      x,
      y,
      ax: x,
      ay: y,
      fish,
      lit: 0,
      ph: rng.next() * 9,
      shelter: 0,
    });
  }

  // pod — one near the start, then scattered down the route. Adults travel
  // alone; a calf only appears alongside its mother.
  const wild = (x: number, y: number, age: number): void => {
    pod.add({
      x,
      y,
      vx: rng.range(-30, 10),
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
      ph: rng.next() * 9,
      size: rng.range(0.9, 1.06),
      age,
      wag: 0,
      base: null,
      spine: null,
    });
  };

  wild(3400, 1000, rng.range(0.85, 1));
  for (let x = 11_000; x < WORLD_W - 4000; x += rng.range(9000, 15_000)) {
    const y = rng.range(500, 1700);
    wild(x, y, rng.range(0.8, 1));
    if (rng.next() < 0.3)
      wild(
        x + rng.range(120, 260),
        y + rng.range(-120, 120),
        rng.range(0.2, 0.5),
      );
  }

  // ships — only across the shipping lane
  for (let x = 60_000; x < 92_000; x += rng.range(7000, 12_000))
    ships.ships.push({ x, v: rng.range(-70, 70), len: rng.range(900, 1900) });

  // marine snow — a small parallax field, wrapped in screen space by the renderer
  for (let i = 0; i < 380; i++)
    particles.snow.push({
      x: rng.next() * 4000,
      y: rng.next() * 4000,
      s: rng.range(0.4, 1.6),
      d: rng.range(0.35, 1),
    });

  // coral reefs — patches on the shallow shelf & seamount rock, in the sunlit
  // zone. Most patches host a school that ducks into the coral when threatened.
  for (let x = 2000; x < WORLD_W - 2000;) {
    const t = world.tileNameAt(x);
    if ((t === "shelf" || t === "seamount") && world.floorAt(x) < 1150) {
      const count = 2 + ((rng.next() * 4) | 0);
      let cx = x;
      for (let k = 0; k < count; k++) {
        cx += rng.range(60, 200);
        const cy = world.floorAt(cx);
        if (cy > 1600) break; // patch ran off the shelf into the deep
        coral.items.push({
          x: cx,
          y: cy,
          kind: (rng.next() * 3) | 0,
          scale: rng.range(0.75, 1.7),
          ph: rng.next() * Math.PI * 2,
        });
      }
      if (rng.next() < 0.6) {
        const mid = (x + cx) / 2;
        const homeY = world.floorAt(mid) - rng.range(70, 150);
        const sy = homeY - rng.range(120, 340);
        const fish = [];
        const n = 26 + ((rng.next() * 14) | 0);
        for (let i = 0; i < n; i++)
          fish.push({
            x: mid + rng.range(-190, 190),
            y: sy + rng.range(-120, 120),
            vx: rng.range(-30, 30),
            vy: rng.range(-14, 14),
          });
        schools.schools.push({
          x: mid,
          y: sy,
          ax: mid,
          ay: sy,
          fish,
          lit: 0,
          ph: rng.next() * 9,
          homeX: mid,
          homeY,
          shelter: 0,
        });
      }
      x = cx + rng.range(1600, 4800);
    } else {
      x += rng.range(400, 1100);
    }
  }
}
