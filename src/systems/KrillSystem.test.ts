import { describe, expect, it } from "vitest";

import { Rng } from "../core/rng";
import { KrillStore, type Swarm } from "../state/Fauna";
import { emitKrill, type Stores } from "../world/level/emitters";
import { stepSwarm } from "./KrillSystem";

function spawn(seed: number): Swarm {
  const krill = new KrillStore();
  emitKrill(new Rng(seed), null as never, { krill } as unknown as Stores, {
    kind: "krill",
    mode: "place",
    items: [{ x: 0, y: 0, r: 420 }],
  });
  return krill.swarms[0];
}

/** each mote's distance from the swarm centre, as a fraction of `r0` */
const radii = (s: Swarm): number[] =>
  s.parts.map((p) => Math.hypot(p.ox, p.oy) / s.r0);

/** the largest share of motes sitting within ±0.03·r0 of one common radius */
function ringShare(r: number[]): number {
  let best = 0;
  for (const a of r)
    best = Math.max(best, r.filter((b) => Math.abs(b - a) < 0.03).length);
  return best / r.length;
}

const FAR = 1e6;
const DT = 1 / 60;

/** run the swarm for `secs`, with the whale charging straight through it
 *  during `[passFrom, passFrom + 3)` */
function run(s: Swarm, secs: number, passFrom = Infinity): void {
  for (let t = 0; t < secs; t += DT) {
    const pass = t >= passFrom && t < passFrom + 3;
    const wx = pass ? -900 + (t - passFrom) * 600 : FAR;
    stepSwarm(s, DT, t, wx, pass ? s.y : FAR);
  }
}

describe("stepSwarm", () => {
  it("keeps the swarm together without pinning motes to a rim", () => {
    for (const seed of [1, 7, 42]) {
      const s = spawn(seed);
      // a whale charge mid-run: the old orbit model clamped every mote outside
      // the balled-up radius onto it, leaving a permanent ring
      run(s, 90, 40);
      const r = radii(s);
      expect(Math.max(...r)).toBeLessThan(2.2);
      // no ring: the old model left over half the motes at one exact radius
      expect(ringShare(r)).toBeLessThan(0.3);
    }
  });

  it("scatters motes away from a whale passing through", () => {
    const s = spawn(3);
    run(s, 20);
    const near = () =>
      s.parts.filter((p) => Math.hypot(p.px - s.x, p.py - s.y) < 120).length;
    // park the whale on the swarm centre for a second
    for (let i = 0; i < 60; i++) stepSwarm(s, DT, 20 + i * DT, s.x, s.y);
    expect(near()).toBeLessThanOrEqual(2);
    expect(s.panic).toBeGreaterThan(0.9);
  });
});
