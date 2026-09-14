import type { Vec2 } from "../../core/math";
import { describe, expect, it } from "vitest";

import {
  ARMS,
  buildFin,
  buildMantleOutline,
  eyeLocal,
  eyeRadius,
  FIN_SAMPLES,
  headLocal,
  headRadius,
  individual,
  type Individual,
  isTentacle,
  jetGirth,
  jetLength,
  limbAngle,
  limbHalfWidth,
  limbLength,
  limbPoints,
  LIMBS,
  limbSlot,
  localToWorld,
  mantleHalf,
  mantleProfile,
  PHOTOPHORES,
  photophoreLocal,
  pulseWave,
  worldToLocal,
} from "./geometry";
import { SQUID_DEFAULTS } from "./params";

const look = SQUID_DEFAULTS;
const pool = (n: number): Vec2[] =>
  Array.from({ length: n }, () => ({ x: 0, y: 0 }));
const plain = (): Individual => ({
  mantleK: 1,
  girthK: 1,
  finK: 1,
  armK: 1,
  tentK: 1,
  seed: 0,
});

describe("limb slots", () => {
  it("gives every one of the ten limbs its own angle at every flare", () => {
    // Bug #1: both tentacles used to sit exactly on the outermost arms
    for (const flare of [0, 0.25, 0.5, 0.75, 1]) {
      const angles = Array.from({ length: LIMBS }, (_, i) =>
        limbAngle(i, flare),
      );
      for (let a = 0; a < LIMBS; a++) {
        for (let b = a + 1; b < LIMBS; b++) {
          expect(Math.abs(angles[a] - angles[b])).toBeGreaterThan(1e-3);
        }
      }
    }
  });

  it("keeps the tentacles inside the arm fan, one per side", () => {
    expect(limbSlot(ARMS)).toBeLessThan(0);
    expect(limbSlot(ARMS + 1)).toBeGreaterThan(0);
    expect(Math.abs(limbSlot(ARMS))).toBeLessThan(0.5);
    expect(limbSlot(ARMS)).toBeCloseTo(-limbSlot(ARMS + 1), 10);
  });

  it("spreads the fan wider as flare rises", () => {
    expect(Math.abs(limbAngle(0, 1) - limbAngle(ARMS - 1, 1))).toBeGreaterThan(
      Math.abs(limbAngle(0, 0) - limbAngle(ARMS - 1, 0)),
    );
  });
});

describe("limb length / width", () => {
  const ind = plain();

  it("makes the tentacles longer than any arm", () => {
    for (const flare of [0, 0.5, 1]) {
      const tent = limbLength(ARMS, look, ind, flare, 96);
      for (let i = 0; i < ARMS; i++) {
        expect(tent).toBeGreaterThan(limbLength(i, look, ind, flare, 96));
      }
    }
  });

  it("tapers an arm monotonically to the tip", () => {
    let prev = Infinity;
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const w = limbHalfWidth(0, f, look, 0.3);
      expect(w).toBeLessThanOrEqual(prev + 1e-9);
      prev = w;
    }
    expect(limbHalfWidth(0, 1, look, 0.3)).toBeGreaterThanOrEqual(0);
  });

  it("widens a tentacle into a club near the tip", () => {
    const stalk = limbHalfWidth(ARMS, 0.6, look, 0);
    const club = limbHalfWidth(ARMS, 0.86, look, 0);
    expect(club).toBeGreaterThan(stalk * 1.4);
    expect(isTentacle(ARMS)).toBe(true);
    expect(isTentacle(ARMS - 1)).toBe(false);
  });
});

describe("jet pulse", () => {
  it("keeps the girth factor inside [0.8, 1.2] at the default depth", () => {
    for (let ph = -10; ph < 20; ph += 0.05) {
      const g = jetGirth(ph, 0.16);
      expect(g).toBeGreaterThanOrEqual(0.8);
      expect(g).toBeLessThanOrEqual(1.2);
    }
  });

  it("averages to no bias over a cycle", () => {
    let sum = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) sum += pulseWave((i / N) * Math.PI * 2);
    expect(sum / N).toBeCloseTo(0, 2);
  });

  it("squeezes fast and refills slowly", () => {
    const TAU = Math.PI * 2;
    // the squeeze is done well before a third of the cycle
    expect(pulseWave(0.3 * TAU)).toBeCloseTo(-1, 6);
    // and half way through the refill it is still well short of full
    expect(pulseWave(0.55 * TAU)).toBeLessThan(0.2);
  });

  it("lengthens the mantle as it squeezes", () => {
    expect(jetLength(0.3 * Math.PI * 2, 0.16)).toBeGreaterThan(1);
    expect(jetLength(0, 0.16)).toBeLessThan(1);
  });
});

describe("head / eye", () => {
  const p: Vec2 = { x: 0, y: 0 };

  it("sizes the head off the look alone — never the jet phase", () => {
    // Bug #4: the head and eye used to inherit the mantle's pulse
    expect(headRadius(look)).toBe(look.headR);
    expect(eyeRadius(look)).toBeLessThan(headRadius(look));
    headLocal(look, p);
    expect(p.x).toBeLessThan(0);
  });

  it("puts the eye on the up-screen flank and centres it when vertical", () => {
    eyeLocal(look, 1, p);
    expect(p.y).toBeLessThan(0);
    eyeLocal(look, -1, p);
    expect(p.y).toBeGreaterThan(0);
    eyeLocal(look, 0, p);
    expect(p.y).toBeCloseTo(0, 10);
  });
});

describe("mantle", () => {
  it("has a rounded shoulder, a full girth and a pointed tip", () => {
    expect(mantleProfile(0)).toBeGreaterThan(0.5);
    expect(mantleProfile(0.3)).toBeCloseTo(1, 6);
    expect(mantleProfile(1)).toBeCloseTo(0, 6);
    expect(mantleHalf(0.3, 24)).toBeCloseTo(24, 6);
  });

  // Orientation-based proper segment intersection, as in the whale tests:
  // shared endpoints don't count, only a genuine crossing does.
  function orient(p: Vec2, q: Vec2, r: Vec2): number {
    return Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  }
  function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    return (
      o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0
    );
  }
  function hasSelfIntersection(pts: Vec2[], n: number): boolean {
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      for (let j = i + 1; j < n; j++) {
        if (j === (i + 1) % n) continue;
        if ((j + 1) % n === i) continue;
        if (segmentsCross(a, b, pts[j], pts[(j + 1) % n])) return true;
      }
    }
    return false;
  }

  it("winds a simple loop at both pulse extremes and every step tier", () => {
    for (const steps of [12, 16, 24]) {
      const out = pool(steps * 2 + 4);
      for (const ph of [0, 0.3 * Math.PI * 2, Math.PI]) {
        const mw = 24 * jetGirth(ph, 0.3);
        const ml = 96 * jetLength(ph, 0.3);
        const n = buildMantleOutline(ml, mw, steps, out);
        expect(n).toBe(steps * 2 + 4);
        expect(hasSelfIntersection(out, n)).toBe(false);
      }
    }
  });

  it("keeps every photophore inside the mantle's bounding box", () => {
    const p: Vec2 = { x: 0, y: 0 };
    for (let n = 0; n < PHOTOPHORES; n++) {
      photophoreLocal(n, 96, 24, p);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(96);
      expect(Math.abs(p.y)).toBeLessThan(mantleHalf(p.x / 96, 24));
    }
  });

  it("alternates photophores between the two flanks", () => {
    const a: Vec2 = { x: 0, y: 0 };
    const b: Vec2 = { x: 0, y: 0 };
    photophoreLocal(0, 96, 24, a);
    photophoreLocal(1, 96, 24, b);
    expect(Math.sign(a.y)).toBe(-Math.sign(b.y));
  });
});

describe("fins", () => {
  it("builds two mirrored lobes that reach past the mantle edge", () => {
    const ind = plain();
    const a = pool(FIN_SAMPLES + 3);
    const b = pool(FIN_SAMPLES + 3);
    const na = buildFin(96, 24, look, ind, 1, 0, a);
    const nb = buildFin(96, 24, look, ind, -1, 0, b);
    expect(na).toBe(FIN_SAMPLES + 3);
    expect(nb).toBe(na);
    let reach = 0;
    for (let i = 0; i < na; i++) {
      reach = Math.max(reach, a[i].y);
      expect(a[i].y).toBeGreaterThanOrEqual(-1e-9);
      expect(b[i].y).toBeLessThanOrEqual(1e-9);
    }
    expect(reach).toBeGreaterThan(24);
  });

  it("ripples with the jet phase", () => {
    const ind = plain();
    const a = pool(FIN_SAMPLES + 3);
    const b = pool(FIN_SAMPLES + 3);
    buildFin(96, 24, look, ind, 1, 0, a);
    buildFin(96, 24, look, ind, 1, 1.2, b);
    let moved = 0;
    for (let i = 0; i < FIN_SAMPLES + 3; i++) {
      moved += Math.abs(a[i].y - b[i].y);
    }
    expect(moved).toBeGreaterThan(1);
  });
});

describe("individual", () => {
  it("is deterministic for a given phase and sits inside the design bounds", () => {
    const a = individual(2.3, 1, plain());
    const b = individual(2.3, 1, plain());
    expect(a).toEqual(b);
    for (let ph = 0; ph < Math.PI * 2; ph += 0.37) {
      const ind = individual(ph, 1, plain());
      expect(ind.mantleK).toBeGreaterThan(0.9);
      expect(ind.mantleK).toBeLessThan(1.1);
      expect(ind.girthK).toBeGreaterThan(0.88);
      expect(ind.girthK).toBeLessThan(1.12);
      expect(ind.finK).toBeGreaterThan(0.84);
      expect(ind.finK).toBeLessThan(1.16);
      expect(ind.tentK).toBeGreaterThan(0.84);
      expect(ind.tentK).toBeLessThan(1.16);
      expect(Number.isInteger(ind.seed)).toBe(true);
    }
  });

  it("collapses onto the dials when variety is zero", () => {
    const ind = individual(4.1, 0, plain());
    expect(ind.mantleK).toBeCloseTo(1, 10);
    expect(ind.armK).toBeCloseTo(1, 10);
  });

  it("gives two squid different proportions", () => {
    const a = individual(0.5, 1, plain());
    const b = individual(3.9, 1, plain());
    expect(a.armK).not.toBeCloseTo(b.armK, 3);
  });
});

describe("limbPoints", () => {
  const ind = plain();
  const S = 8;
  const out = pool((S + 1) * 2);
  const root: Vec2 = { x: 0, y: 0 };

  it("writes a closed loop of 2(S+1) points whose two edges meet at the tip", () => {
    const n = limbPoints(3, look, ind, 0.2, 0, 1, 96, 24, null, S, out, root);
    expect(n).toBe((S + 1) * 2);
    // the outward edge's last point and the return edge's first are the tip's
    // two sides, a taper apart
    const tipW = limbHalfWidth(3, 1, look, 0.2);
    expect(
      Math.hypot(out[S].x - out[S + 1].x, out[S].y - out[S + 1].y),
    ).toBeCloseTo(tipW * 2, 6);
  });

  it("bends a tentacle's tip toward a grip target", () => {
    const grip: Vec2 = { x: -60, y: -90 };
    const tip = (g: Vec2 | null): Vec2 => {
      limbPoints(ARMS, look, ind, 1, 0, 1, 96, 24, g, S, out, root);
      return {
        x: (out[S].x + out[S + 1].x) / 2,
        y: (out[S].y + out[S + 1].y) / 2,
      };
    };
    const free = tip(null);
    const held = tip(grip);
    const dFree = Math.hypot(free.x - grip.x, free.y - grip.y);
    const dHeld = Math.hypot(held.x - grip.x, held.y - grip.y);
    expect(dHeld).toBeLessThan(dFree * 0.5);
  });

  it("leaves the arms alone when there is a grip target", () => {
    const grip: Vec2 = { x: -60, y: -90 };
    const a = pool((S + 1) * 2);
    limbPoints(2, look, ind, 1, 0, 1, 96, 24, null, S, a, root);
    limbPoints(2, look, ind, 1, 0, 1, 96, 24, grip, S, out, root);
    for (let i = 0; i < (S + 1) * 2; i++) {
      expect(out[i].x).toBeCloseTo(a[i].x, 10);
      expect(out[i].y).toBeCloseTo(a[i].y, 10);
    }
  });

  it("sways differently on each limb so the fan never moves in lockstep", () => {
    // compare the centre-line's lateral offset at the tip, measured off the
    // limb's own straight line, for two limbs in mirrored slots
    const off = (i: number): number => {
      limbPoints(i, look, ind, 0, 0.7, 1, 96, 24, null, S, out, root);
      const tx = (out[S].x + out[S + 1].x) / 2 - root.x;
      const ty = (out[S].y + out[S + 1].y) / 2 - root.y;
      const dir = limbAngle(i, 0);
      // component perpendicular to the limb direction
      return -tx * Math.sin(dir) + ty * Math.cos(dir);
    };
    expect(Math.abs(off(2) - off(5))).toBeGreaterThan(0.5);
  });
});

describe("frame", () => {
  it("round-trips local ↔ world at any heading and size", () => {
    const w: Vec2 = { x: 0, y: 0 };
    const l: Vec2 = { x: 0, y: 0 };
    for (const h of [0, 0.7, Math.PI, -2.1]) {
      localToWorld(100, 200, h, 1.2, 30, -12, w);
      worldToLocal(100, 200, h, 1.2, w.x, w.y, l);
      expect(l.x).toBeCloseTo(30, 8);
      expect(l.y).toBeCloseTo(-12, 8);
    }
  });

  it("points +along in the heading direction", () => {
    const w: Vec2 = { x: 0, y: 0 };
    localToWorld(0, 0, Math.PI / 2, 1, 10, 0, w);
    expect(w.x).toBeCloseTo(0, 8);
    expect(w.y).toBeCloseTo(10, 8);
  });
});
