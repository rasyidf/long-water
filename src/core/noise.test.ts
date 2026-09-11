import { describe, expect, it } from "vitest";

import {
  fbm01,
  fbm1,
  fbm2,
  perlin1,
  perlin2,
  ridge2,
  warpedFbm2,
} from "./noise";

describe("perlin2", () => {
  it("is deterministic for a given seed and point", () => {
    expect(perlin2(7, 1.25, -3.5)).toBe(perlin2(7, 1.25, -3.5));
  });

  it("gives different fields for different seeds", () => {
    const a = perlin2(1, 0.3, 0.7);
    const b = perlin2(2, 0.3, 0.7);
    expect(a).not.toBe(b);
  });

  it("stays within [-1, 1] across a wide sweep", () => {
    for (let i = 0; i < 4000; i++) {
      const v = perlin2(99, i * 0.137 - 200, i * 0.071 - 90);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("is zero on the lattice, where every gradient dot vanishes", () => {
    for (const [x, y] of [
      [0, 0],
      [3, -5],
      [17, 42],
    ]) {
      expect(Math.abs(perlin2(5, x, y))).toBeLessThan(1e-12);
    }
  });

  it("is continuous — neighbouring samples never jump", () => {
    let prev = perlin2(3, -5, 0.5);
    for (let x = -5; x < 5; x += 0.01) {
      const v = perlin2(3, x, 0.5);
      expect(Math.abs(v - prev)).toBeLessThan(0.1);
      prev = v;
    }
  });

  it("actually varies — it is not a constant field", () => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 500; i++) {
      const v = perlin1(11, i * 0.31);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(max - min).toBeGreaterThan(0.8);
  });

  it("repeats after 256 lattice cells (the permutation period)", () => {
    expect(perlin2(4, 0.5, 0.5)).toBeCloseTo(perlin2(4, 256.5, 0.5), 12);
  });
});

describe("fbm2", () => {
  it("stays within [-1, 1] — octaves are normalised by their amplitudes", () => {
    for (let i = 0; i < 3000; i++) {
      const v = fbm2(21, i * 0.113 - 150, i * 0.049, { octaves: 6 });
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("adds detail: more octaves means more short-range variation", () => {
    const rough = (octaves: number): number => {
      let sum = 0;
      let prev = fbm1(6, 0, { octaves });
      for (let x = 0.01; x < 30; x += 0.01) {
        const v = fbm1(6, x, { octaves });
        sum += Math.abs(v - prev);
        prev = v;
      }
      return sum;
    };
    expect(rough(5)).toBeGreaterThan(rough(1));
  });

  it("degenerates to plain perlin at one octave", () => {
    expect(fbm2(8, 1.3, 2.7, { octaves: 1 })).toBeCloseTo(
      perlin2(8, 1.3, 2.7),
      12,
    );
  });

  it("is deterministic", () => {
    expect(fbm2(3, 4.5, 6.5)).toBe(fbm2(3, 4.5, 6.5));
  });
});

describe("ridge2", () => {
  it("stays in [0, 1]", () => {
    for (let i = 0; i < 2000; i++) {
      const v = ridge2(13, i * 0.091, i * 0.037);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("peaks where the underlying noise crosses zero", () => {
    // on the lattice perlin is exactly 0, so the first (dominant) octave folds
    // to its maximum there
    expect(ridge2(13, 0, 0, { octaves: 1 })).toBeCloseTo(1, 12);
  });
});

describe("warpedFbm2", () => {
  it("is a no-op at zero strength", () => {
    expect(warpedFbm2(2, 1.1, 2.2, 0)).toBe(fbm2(2, 1.1, 2.2));
  });

  it("displaces the field once strength is non-zero", () => {
    expect(warpedFbm2(2, 1.1, 2.2, 1.5)).not.toBe(fbm2(2, 1.1, 2.2));
  });
});

describe("fbm01", () => {
  it("remaps into [0, 1] and centres on 0.5", () => {
    let sum = 0;
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const v = fbm01(17, i * 0.083, i * 0.029);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      sum += v;
    }
    expect(sum / N).toBeCloseTo(0.5, 1);
  });
});
