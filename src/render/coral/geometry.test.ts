import { describe, expect, it } from "vitest";

import {
  breathe,
  buildStaghorn,
  currentAt,
  domeRadius,
  fanRadius,
  fingerCount,
  genome,
  type Genome,
  grooveCount,
  HUE,
  KIND_COUNT,
  KIND_NAMES,
  makeSegments,
  MAX_SEGMENTS,
  plateRadius,
  polypPulse,
  sinkColor,
  STIFFNESS,
  swayAt,
  type Tentacle,
  tentacleAt,
  tentacleCount,
  type Tube,
  tubeAt,
  tubeCount,
  veinCount,
  WATER,
} from "./geometry";

const gn = (): Genome => ({
  height: 1,
  spread: 1,
  tone: 0,
  lean: 0,
  jitter: 0,
  count: 0,
  phase: 0,
});

const CUR = { currentScale: 900, currentSpeed: 1, gust: 0.45 };

describe("kinds", () => {
  it("names, hues and stiffness all cover every kind", () => {
    expect(KIND_NAMES).toHaveLength(KIND_COUNT);
    expect(HUE).toHaveLength(KIND_COUNT);
    expect(STIFFNESS).toHaveLength(KIND_COUNT);
  });

  it("the brain coral is rock and the whip gives most", () => {
    expect(STIFFNESS[2]).toBe(0);
    expect(Math.max(...STIFFNESS)).toBe(STIFFNESS[4]);
  });
});

describe("genome", () => {
  it("is deterministic per seabed x", () => {
    const a = genome(1234.4, 0.5, gn());
    const b = genome(1234.4, 0.5, gn());
    expect(a).toEqual(b);
  });

  it("differs between neighbours", () => {
    const a = genome(1000, 0, gn());
    const b = genome(1150, 0, gn());
    expect(a.height === b.height && a.tone === b.tone).toBe(false);
  });

  it("stays within the design bounds", () => {
    for (let x = 0; x < 40000; x += 731) {
      const g = genome(x, 0, gn());
      expect(g.height).toBeGreaterThanOrEqual(0.82);
      expect(g.height).toBeLessThanOrEqual(1.18);
      expect(g.spread).toBeGreaterThanOrEqual(0.82);
      expect(g.spread).toBeLessThanOrEqual(1.18);
      expect(g.tone).toBeGreaterThanOrEqual(0);
      expect(g.tone).toBeLessThan(1);
      expect(Math.abs(g.lean)).toBeLessThanOrEqual(0.12);
    }
  });

  it("carries the item's phase through untouched", () => {
    expect(genome(10, 2.5, gn()).phase).toBe(2.5);
  });
});

describe("currentAt", () => {
  it("is deterministic", () => {
    expect(currentAt(7, 3000, 12.5, CUR)).toBe(currentAt(7, 3000, 12.5, CUR));
  });

  it("stays within [-1, 1]", () => {
    for (let x = 0; x < 30000; x += 313) {
      for (const t of [0, 4.2, 31, 900]) {
        const c = currentAt(7, x, t, CUR);
        expect(c).toBeGreaterThanOrEqual(-1);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it("actually moves — it is not a flat field", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < 120; t += 0.5) {
      const c = currentAt(7, 5000, t, CUR);
      lo = Math.min(lo, c);
      hi = Math.max(hi, c);
    }
    expect(hi - lo).toBeGreaterThan(0.2);
  });

  it("neighbours in a patch lean together (a lag, not lockstep or noise)", () => {
    // 60 units apart with a 900-unit surge: near-identical but not equal
    const a = currentAt(7, 5000, 3, CUR);
    const b = currentAt(7, 5060, 3, CUR);
    expect(Math.abs(a - b)).toBeLessThan(0.25);
    expect(a).not.toBe(b);
  });

  it("changes with the seed", () => {
    expect(currentAt(7, 5000, 3, CUR)).not.toBe(currentAt(8, 5000, 3, CUR));
  });
});

describe("swayAt", () => {
  it("pins the root", () => {
    expect(swayAt(0, 1, 0.16)).toBe(0);
  });

  it("is bounded by |current| · stiffness at the tip", () => {
    for (const c of [-1, -0.3, 0.5, 1]) {
      for (let f = 0; f <= 1; f += 0.1) {
        expect(Math.abs(swayAt(f, c, 0.16))).toBeLessThanOrEqual(
          Math.abs(c) * 0.16 + 1e-12,
        );
      }
    }
  });

  it("grows monotonically up the growth", () => {
    let prev = -1;
    for (let f = 0; f <= 1; f += 0.05) {
      const s = swayAt(f, 1, 0.1);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it("rock (stiffness 0) never moves", () => {
    expect(swayAt(1, 1, 0)).toBe(0);
  });
});

describe("breathe / polypPulse", () => {
  it("stay within (0, 1] over a long run", () => {
    for (let t = 0; t < 200; t += 0.13) {
      for (const f of [breathe(t, 1.2), polypPulse(t, 0.4), breathe(t, 0, 2)]) {
        expect(f).toBeGreaterThan(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });

  it("never fully shuts a tube mouth", () => {
    let lo = Infinity;
    for (let t = 0; t < 50; t += 0.05) lo = Math.min(lo, breathe(t, 0));
    expect(lo).toBeGreaterThan(0.5);
  });
});

describe("sinkColor", () => {
  it("leaves the hue alone at k = 0 and lands on the water at k = 1", () => {
    expect(sinkColor(0xff6f6b, WATER, 0)).toBe(0xff6f6b);
    const full = sinkColor(0xff6f6b, WATER, 1);
    // red and green reach the water; blue keeps a little of its own
    expect((full >> 16) & 255).toBe((WATER >> 16) & 255);
    expect((full >> 8) & 255).toBe((WATER >> 8) & 255);
  });

  it("loses red faster than blue", () => {
    const half = sinkColor(0xff8080, 0x104060, 0.5);
    const rLoss = (0xff - ((half >> 16) & 255)) / (0xff - 0x10);
    const bLoss = (0x80 - (half & 255)) / (0x80 - 0x60);
    expect(rLoss).toBeGreaterThan(bLoss);
  });

  it("never produces a channel out of range or NaN", () => {
    for (let k = -1; k <= 2; k += 0.25) {
      const c = sinkColor(0xdd6f9e, WATER, k);
      expect(Number.isNaN(c)).toBe(false);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
  });
});

describe("buildStaghorn", () => {
  const segs = makeSegments();

  it("is deterministic for a genome", () => {
    const g = genome(4321, 0, gn());
    const n1 = buildStaghorn(g, 100, 3, 1, segs);
    const a = segs.slice(0, n1).map((s) => ({ ...s }));
    const n2 = buildStaghorn(g, 100, 3, 1, segs);
    expect(n2).toBe(n1);
    expect(segs.slice(0, n2)).toEqual(a);
  });

  it("writes at least the two trunks and never overruns the pool", () => {
    for (let d = 0; d <= 6; d++) {
      const n = buildStaghorn(gn(), 100, d, 1.4, segs);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(MAX_SEGMENTS);
    }
  });

  it("caps depth at 4 so the count is bounded", () => {
    const n4 = buildStaghorn(gn(), 100, 4, 1, segs);
    const n9 = buildStaghorn(gn(), 100, 9, 1, segs);
    expect(n9).toBe(n4);
  });

  it("roots both trunks on the rock and tapers every arm", () => {
    const n = buildStaghorn(gn(), 100, 3, 1, segs);
    const trunks = segs.slice(0, n).filter((s) => s.level === 0);
    expect(trunks).toHaveLength(2);
    for (const s of trunks) expect(s.y0).toBe(0);
    for (let i = 0; i < n; i++) {
      expect(segs[i].w1).toBeLessThan(segs[i].w0);
      expect(segs[i].y1).toBeGreaterThan(segs[i].y0);
    }
  });

  it("marks exactly the deepest level as tips", () => {
    const n = buildStaghorn(gn(), 100, 2, 1, segs);
    for (let i = 0; i < n; i++) {
      expect(segs[i].tip).toBe(segs[i].level === 2);
    }
  });

  it("produces no NaN at scale extremes", () => {
    for (const h of [0.5, 4, 900]) {
      const n = buildStaghorn(genome(77, 0, gn()), h, 4, 2, segs);
      for (let i = 0; i < n; i++) {
        for (const v of [segs[i].x0, segs[i].y0, segs[i].x1, segs[i].y1]) {
          expect(Number.isFinite(v)).toBe(true);
        }
      }
    }
  });
});

describe("tube sponge", () => {
  const tube: Tube = { bx: 0, tx: 0, th: 0, r0: 0, r1: 0, ph: 0 };

  it("clumps 3..5 tubes", () => {
    for (let x = 0; x < 20000; x += 517) {
      const n = tubeCount(genome(x, 0, gn()));
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it("keeps every tube between 0.6 and 1 of the height", () => {
    for (let x = 0; x < 20000; x += 517) {
      const g = genome(x, 0, gn());
      const n = tubeCount(g);
      for (let i = 0; i < n; i++) {
        tubeAt(g, i, n, 100, tube);
        expect(tube.th).toBeGreaterThanOrEqual(60);
        expect(tube.th).toBeLessThanOrEqual(100);
        expect(tube.r1).toBeLessThan(tube.r0);
      }
    }
  });

  it("leans the outer tubes outward and gives each its own phase", () => {
    const g = gn();
    tubeAt(g, 0, 3, 100, tube);
    expect(tube.tx).toBeLessThan(tube.bx);
    const p0 = tube.ph;
    tubeAt(g, 2, 3, 100, tube);
    expect(tube.tx).toBeGreaterThan(tube.bx);
    expect(tube.ph).not.toBe(p0);
  });
});

describe("sea fan", () => {
  it("keeps the membrane radius positive across the whole fan", () => {
    const g = genome(300, 1, gn());
    for (let a = -1.4; a <= 1.4; a += 0.05) {
      for (const t of [0, 1.3, 7.7]) {
        const r = fanRadius(a, g, t, 2);
        expect(r).toBeGreaterThan(0);
        expect(r).toBeLessThan(1.2);
      }
    }
  });

  it("is still at flutter 0 and ripples at flutter 1", () => {
    const g = gn();
    expect(fanRadius(0.4, g, 0, 0)).toBe(fanRadius(0.4, g, 3, 0));
    expect(fanRadius(0.4, g, 0, 1)).not.toBe(fanRadius(0.4, g, 3, 1));
  });

  it("draws more veins with more detail, always an odd count", () => {
    const g = gn();
    expect(veinCount(g, 1)).toBeGreaterThan(veinCount(g, 0));
    for (const d of [0, 0.3, 0.7, 1]) expect(veinCount(g, d) % 2).toBe(1);
  });
});

describe("anemone", () => {
  const tent: Tentacle = { x: 0, y: 0, ang: 0, len: 0, w: 0 };

  it("rings the disc with 10..16 tentacles", () => {
    for (let x = 0; x < 20000; x += 517) {
      const n = tentacleCount(genome(x, 0, gn()));
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(16);
    }
  });

  it("roots every tentacle on the disc rim and fans them outward", () => {
    const g = gn();
    const n = 12;
    for (let i = 0; i < n; i++) {
      tentacleAt(g, i, n, 100, 0, 0, tent);
      expect(tent.y).toBeCloseTo(44, 6);
      expect(Math.abs(tent.x)).toBeLessThanOrEqual(34.0001);
      expect(tent.len).toBeGreaterThan(0);
      // outer tentacles lie flatter than the middle ones
      if (i === 0) expect(tent.ang).toBeLessThan(0);
      if (i === n - 1) expect(tent.ang).toBeGreaterThan(0);
    }
  });

  it("wobble 0 freezes it; each tentacle wobbles on its own phase", () => {
    const g = gn();
    tentacleAt(g, 3, 12, 100, 0, 0, tent);
    const a0 = tent.ang;
    tentacleAt(g, 3, 12, 100, 5, 0, tent);
    expect(tent.ang).toBe(a0);
    tentacleAt(g, 3, 12, 100, 5, 1, tent);
    const a3 = tent.ang;
    tentacleAt(g, 4, 12, 100, 5, 1, tent);
    expect(tent.ang - a3).not.toBeCloseTo(a3 - a0, 3);
  });
});

describe("table / brain outlines", () => {
  it("scallop and dome radii stay near 1 and finite", () => {
    const g = genome(999, 0, gn());
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      for (const r of [plateRadius(a, g), domeRadius(a, g)]) {
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeGreaterThan(0.9);
        expect(r).toBeLessThan(1.1);
      }
    }
  });

  it("finger and groove counts scale with detail and stay small", () => {
    const g = gn();
    expect(fingerCount(g, 0)).toBe(3);
    expect(fingerCount(g, 1)).toBeGreaterThan(fingerCount(g, 0));
    expect(fingerCount({ ...g, count: 1 }, 1)).toBeLessThanOrEqual(9);
    expect(grooveCount(g, 0)).toBe(2);
    expect(grooveCount({ ...g, count: 1 }, 1)).toBeLessThanOrEqual(5);
  });
});
