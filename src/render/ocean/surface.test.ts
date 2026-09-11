import { describe, expect, it } from "vitest";

import { OCEAN_DEFAULTS, cloneOceanParams } from "./params";
import {
  causticCells,
  foamRuns,
  glints,
  octaveAmp,
  surfaceHeightAt,
  surfacePoint,
  traceSurface,
  waveEnvelope,
  waveK,
  waveOmega,
  type WaveParams,
} from "./surface";

const base = (patch: Partial<WaveParams> = {}): WaveParams => ({
  ...cloneOceanParams().wave,
  ...patch,
});

/** a single clean sine train, for the properties that need a known answer */
const sine = (patch: Partial<WaveParams> = {}): WaveParams =>
  base({
    octaves: [{ length: 400, height: 10, speed: 1 }],
    steep: 0,
    groupiness: 0,
    chopHeight: 0,
    ...patch,
  });

describe("dispersion", () => {
  it("gives longer waves a shorter wavenumber", () => {
    expect(waveK({ length: 800, height: 1, speed: 1 })).toBeLessThan(
      waveK({ length: 200, height: 1, speed: 1 }),
    );
  });

  it("matches the deep-water period for a 100 m swell", () => {
    // T = sqrt(2*pi*L/g); at 1 unit = 0.1 m a 1000-unit wave is 100 m
    const T = (Math.PI * 2) / waveOmega({ length: 1000, height: 1, speed: 1 });
    expect(T).toBeCloseTo(Math.sqrt((Math.PI * 2 * 100) / 9.81), 1);
  });

  it("makes long swell outrun short chop", () => {
    const fast = { length: 1000, height: 1, speed: 1 };
    const slow = { length: 100, height: 1, speed: 1 };
    const c = (o: typeof fast): number => waveOmega(o) / waveK(o);
    expect(c(fast)).toBeGreaterThan(c(slow));
  });

  it("reverses travel with a negative speed", () => {
    expect(waveOmega({ length: 400, height: 1, speed: -1 })).toBeLessThan(0);
  });
});

describe("surfacePoint", () => {
  it("is a plain cosine train with no steepening and no noise", () => {
    const p = sine();
    const k = waveK(p.octaves[0]);
    for (const u of [0, 37, 123, -260]) {
      const pt = surfacePoint(p, u, 0);
      expect(pt.x).toBeCloseTo(u, 9);
      expect(pt.y).toBeCloseTo(-10 * Math.cos(k * u), 9);
    }
  });

  it("puts a crest above the mean line at the origin", () => {
    expect(surfacePoint(sine(), 0, 0).y).toBeLessThan(0);
  });

  it("travels: the crest moves downwind over time", () => {
    const p = sine();
    const o = p.octaves[0];
    const shift = (waveOmega(o) / waveK(o)) * 2; // 2 s of phase speed
    expect(surfacePoint(p, shift, 2).y).toBeCloseTo(surfacePoint(p, 0, 0).y, 6);
  });

  it("displaces points toward the crest once steepened", () => {
    const p = sine({ steep: 0.8 });
    const o = p.octaves[0];
    const quarter = o.length * 0.25; // a quarter wave past the crest at u=0
    expect(surfacePoint(p, quarter, 0).x).toBeLessThan(quarter);
    expect(surfacePoint(p, -quarter, 0).x).toBeGreaterThan(-quarter);
  });

  it("scales with wind", () => {
    const calm = surfacePoint(sine({ wind: 0.25 }), 0, 0).y;
    const blown = surfacePoint(sine({ wind: 1 }), 0, 0).y;
    expect(Math.abs(blown)).toBeCloseTo(Math.abs(calm) * 4, 6);
  });

  it("goes flat at zero wind with no chop", () => {
    const p = sine({ wind: 0 });
    for (let u = -500; u < 500; u += 37) {
      expect(surfacePoint(p, u, 1.5).y).toBeCloseTo(0, 9);
    }
  });
});

describe("octaveAmp", () => {
  it("never inverts a train, however deep the grouping", () => {
    const p = base({ groupiness: 1 });
    for (let u = -6000; u < 6000; u += 53) {
      expect(octaveAmp(p, p.octaves[0], 0, u, 3)).toBeGreaterThanOrEqual(0);
    }
  });

  it("is the plain height when grouping is off", () => {
    const p = base({ groupiness: 0, wind: 1 });
    expect(octaveAmp(p, p.octaves[0], 0, 912, 4)).toBe(p.octaves[0].height);
  });

  it("actually modulates when grouping is on", () => {
    const p = base({ groupiness: 0.8 });
    const vals: number[] = [];
    for (let u = 0; u < 20000; u += 311)
      vals.push(octaveAmp(p, p.octaves[0], 0, u, 0));
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(1);
  });
});

describe("waveEnvelope", () => {
  it("bounds the surface it describes", () => {
    const p = base();
    const env = waveEnvelope(p);
    for (let u = -4000; u < 4000; u += 13) {
      expect(Math.abs(surfacePoint(p, u, 7.3).y)).toBeLessThanOrEqual(env);
    }
  });

  it("is zero for a dead flat sea", () => {
    expect(waveEnvelope(base({ wind: 0, chopHeight: 0 }))).toBe(0);
  });
});

describe("surfaceHeightAt", () => {
  it("inverts the horizontal displacement", () => {
    const p = base({ steep: 0.6 });
    for (const wx of [0, 137, -940, 2300]) {
      const y = surfaceHeightAt(p, wx, 2.5);
      // find the traced point that actually landed on this x
      let best = Infinity;
      let bestY = 0;
      for (let u = wx - 200; u <= wx + 200; u += 0.5) {
        const pt = surfacePoint(p, u, 2.5);
        if (Math.abs(pt.x - wx) < best) {
          best = Math.abs(pt.x - wx);
          bestY = pt.y;
        }
      }
      expect(y).toBeCloseTo(bestY, 0);
    }
  });

  it("is exact when there is nothing to invert", () => {
    const p = sine();
    expect(surfaceHeightAt(p, 250, 0)).toBeCloseTo(
      surfacePoint(p, 250, 0).y,
      9,
    );
  });
});

describe("traceSurface", () => {
  it("returns count + 1 samples spanning the range", () => {
    const s = traceSurface(base(), 0, 1000, 50, 0);
    expect(s).toHaveLength(51);
    expect(s[0].u).toBe(0);
    expect(s[50].u).toBeCloseTo(1000, 9);
  });

  it("reuses the buffer it is handed", () => {
    const buf = traceSurface(base(), 0, 1000, 50, 0);
    const first = buf[0];
    const again = traceSurface(base(), 0, 1000, 50, 1, buf);
    expect(again).toBe(buf);
    expect(again[0]).toBe(first);
  });

  it("shrinks a reused buffer to the new sample count", () => {
    const buf = traceSurface(base(), 0, 1000, 120, 0);
    expect(traceSurface(base(), 0, 1000, 20, 0, buf)).toHaveLength(21);
    expect(buf).toHaveLength(21);
  });

  it("reports the slope of a known sine train", () => {
    const p = sine();
    const k = waveK(p.octaves[0]);
    const s = traceSurface(p, 0, 400, 400, 0);
    const at = s[100]; // a quarter wave along: steepest descent
    expect(at.slope).toBeCloseTo(10 * k * Math.sin(k * at.x), 2);
  });

  it("finds no cusp in an unsteepened train", () => {
    const s = traceSurface(sine(), 0, 2000, 400, 0);
    for (const p of s) expect(p.steepness).toBeLessThan(0.02);
  });

  it("compresses the trace at the crest once steepened", () => {
    const p = sine({ steep: 0.9, foamStart: 0, foamPatchiness: 0 });
    const s = traceSurface(p, -200, 600, 400, 0);
    // u = 0 and u = 400 are crests, u = 200 is a trough
    const crest = s.reduce((a, b) => (b.y < a.y ? b : a));
    const trough = s.reduce((a, b) => (b.y > a.y ? b : a));
    expect(crest.steepness).toBeGreaterThan(trough.steepness);
    // `steep` is normalised: the dial is the fraction of the way to a cusp
    expect(crest.steepness).toBeCloseTo(0.9, 1);
  });

  it("puts foam on crests and never in troughs", () => {
    const p = base({ steep: 0.95, foamStart: 0.1, foamPatchiness: 0 });
    const s = traceSurface(p, 0, 6000, 600, 0);
    const foamy = s.filter((x) => x.foam > 0.05);
    expect(foamy.length).toBeGreaterThan(0);
    for (const f of foamy) expect(f.y).toBeLessThan(0);
  });

  it("has no foam at all on a calm, unsteepened sea", () => {
    const s = traceSurface(sine({ steep: 0 }), 0, 4000, 500, 0);
    for (const p of s) expect(p.foam).toBe(0);
  });

  it("foams less as foamStart rises", () => {
    const total = (foamStart: number): number =>
      traceSurface(
        base({ steep: 0.9, foamStart, foamPatchiness: 0 }),
        0,
        8000,
        800,
        0,
      ).reduce((a, b) => a + b.foam, 0);
    expect(total(0.1)).toBeGreaterThan(total(0.5));
  });

  it("scales foam with foamAmount", () => {
    const p = base({ steep: 0.9, foamPatchiness: 0, foamAmount: 1 });
    const full = traceSurface(p, 0, 4000, 400, 0).reduce(
      (a, b) => a + b.foam,
      0,
    );
    const half = traceSurface(
      { ...p, foamAmount: 0.5 },
      0,
      4000,
      400,
      0,
    ).reduce((a, b) => a + b.foam, 0);
    expect(half).toBeLessThan(full);
    expect(half).toBeGreaterThan(0);
  });
});

describe("foamRuns", () => {
  const fake = (foam: number[]) =>
    foam.map((f, i) => ({
      x: i,
      y: 0,
      u: i,
      slope: 0,
      steepness: 0,
      foam: f,
    }));

  it("groups contiguous foaming samples", () => {
    const runs = foamRuns(fake([0, 0, 0.5, 0.9, 0.4, 0, 0, 0.7, 0.8, 0]), 0.1);
    expect(runs).toEqual([
      { from: 2, to: 4, peak: 0.9 },
      { from: 7, to: 8, peak: 0.8 },
    ]);
  });

  it("drops single-sample specks that would draw as a dot", () => {
    expect(foamRuns(fake([0, 0.9, 0]), 0.1)).toEqual([]);
  });

  it("closes a run that reaches the end of the trace", () => {
    expect(foamRuns(fake([0, 0.3, 0.4]), 0.1)).toEqual([
      { from: 1, to: 2, peak: 0.4 },
    ]);
  });

  it("returns nothing for a calm trace", () => {
    expect(foamRuns(fake([0, 0, 0, 0]))).toEqual([]);
  });
});

describe("glints", () => {
  const s = traceSurface(base(), -3000, 3000, 600, 0);

  it("returns nothing at zero strength", () => {
    expect(glints(s, 0, 0.2, 3000, 0)).toEqual([]);
  });

  it("concentrates the specular path under the sun", () => {
    const near = glints(s, 0, 0, 1500, 1).reduce((a, b) => a + b.k, 0);
    const off = glints(s, 9000, 0, 1500, 1).reduce((a, b) => a + b.k, 0);
    expect(near).toBeGreaterThan(off);
  });

  it("only lights facets tilted toward the sun", () => {
    for (const g of glints(s, 0, 0.4, 1e9, 1)) {
      expect(Math.abs(s[g.at].slope - 0.4)).toBeLessThan(0.16);
    }
  });

  it("sparkles: which facets are lit churns with time", () => {
    const lit = (t: number): string =>
      glints(s, 0, 0, 1e9, 1, t)
        .map((g) => g.at)
        .join(",");
    expect(lit(0)).not.toBe(lit(4));
  });

  it("stays a sparse scatter, not a continuous ribbon", () => {
    expect(glints(s, 0, 0, 1e9, 1).length).toBeLessThan(s.length * 0.25);
  });

  it("only indexes samples that exist", () => {
    for (const g of glints(s, 0, 0.1, 3000, 1)) {
      expect(g.at).toBeGreaterThanOrEqual(0);
      expect(g.at).toBeLessThan(s.length);
      expect(g.k).toBeGreaterThan(0);
    }
  });
});

describe("causticCells", () => {
  it("returns nothing at zero strength", () => {
    const s = traceSurface(base(), 0, 2000, 200, 0);
    expect(causticCells(base(), s, 0, 0)).toEqual([]);
  });

  it("focuses under troughs, not crests", () => {
    const p = sine({ seed: 5 });
    const s = traceSurface(p, -400, 400, 400, 0);
    const cells = causticCells(p, s, 0, 6);
    expect(cells.length).toBeGreaterThan(0);
    const k = waveK(p.octaves[0]);
    for (const c of cells) {
      // troughs of -A*cos(kx) sit where cos(kx) = -1
      expect(Math.cos(k * c.x)).toBeLessThan(-0.9);
    }
  });

  it("emits one cell per focus, not one per concave sample", () => {
    const p = sine({ seed: 5 });
    // four wavelengths of a single train: at most one focus each
    const s = traceSurface(p, 0, 1600, 800, 0);
    expect(causticCells(p, s, 0, 6).length).toBeLessThanOrEqual(5);
  });

  it("scatters the foci through the sunlit band", () => {
    const p = base();
    const s = traceSurface(p, 0, 20000, 1600, 0);
    const depths = causticCells(p, s, 0, 6).map((c) => c.depth);
    expect(depths.length).toBeGreaterThan(6);
    expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(30);
    for (const d of depths) expect(d).toBeGreaterThan(0);
  });

  it("brightens with strength", () => {
    const p = sine({ seed: 5 });
    const s = traceSurface(p, -400, 400, 400, 0);
    const sum = (k: number): number =>
      causticCells(p, s, 0, k).reduce((a, b) => a + b.k, 0);
    expect(sum(12)).toBeGreaterThan(sum(6));
  });
});

describe("OCEAN_DEFAULTS", () => {
  it("clones deeply — a tool editing an octave must not move the defaults", () => {
    const c = cloneOceanParams();
    c.wave.octaves[0].height = 999;
    c.sky.timeOfDay = 0.1;
    expect(OCEAN_DEFAULTS.wave.octaves[0].height).not.toBe(999);
    expect(OCEAN_DEFAULTS.sky.timeOfDay).not.toBe(0.1);
  });

  it("describes a sea whose crests break somewhere", () => {
    const s = traceSurface(OCEAN_DEFAULTS.wave, 0, 20000, 1400, 3);
    expect(s.some((p) => p.foam > 0.1)).toBe(true);
  });
});
