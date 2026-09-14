import { describe, expect, it } from "vitest";

import { DARK_FULL, DARK_START } from "../../config/constants";
import {
  moteAt,
  mulColor,
  murkLens,
  paletteShift,
  snowMote,
  sparkAt,
  sparkEnvelope,
  sparkGate,
  THERMO_AMP,
  thermoclineOffset,
  waterTint,
  WRAP,
  type Mote,
  type MurkLens,
  type Spark,
  type WaterParams,
} from "./column";
import { cloneOceanParams, OCEAN_DEFAULTS } from "./params";
import { OCEAN_PRESETS, oceanPreset } from "./presets";

const water = (patch: Partial<WaterParams> = {}): WaterParams => ({
  ...cloneOceanParams().water,
  ...patch,
});

const ch = (c: number): [number, number, number] => [
  (c >> 16) & 255,
  (c >> 8) & 255,
  c & 255,
];

const lens = (): MurkLens => ({ x: 0, y: 0, w: 0, h: 0, d: 0, alpha: 0 });
const mote = (): Mote => ({ x: 0, y: 0, d: 0, s: 0, a: 0 });
const spark = (): Spark => ({ x: 0, y: 0, d: 0, r: 0, a: 0, color: 0 });

describe("waterTint", () => {
  it("is the identity at the surface and at zero absorption", () => {
    expect(waterTint(0x17546f, 0, 0.8)).toBe(0x17546f);
    expect(waterTint(0x17546f, -40, 0.8)).toBe(0x17546f);
    expect(waterTint(0x17546f, 2000, 0)).toBe(0x17546f);
  });

  it("only ever darkens, monotonically with depth", () => {
    let prev = ch(0xc0a080);
    for (let y = 0; y <= 4000; y += 200) {
      const cur = ch(waterTint(0xc0a080, y, 0.6));
      for (let i = 0; i < 3; i++) expect(cur[i]).toBeLessThanOrEqual(prev[i]);
      prev = cur;
    }
  });

  it("drops red before green before blue", () => {
    const [r, g, b] = ch(waterTint(0xffffff, DARK_FULL, 1));
    expect(r).toBeLessThan(g);
    expect(g).toBeLessThan(b);
    expect(r).toBeLessThan(80);
    expect(b).toBeGreaterThan(180);
  });
});

describe("paletteShift / mulColor", () => {
  it("is white when the palette has not moved", () => {
    expect(paletteShift(0x3a7a90, 0x3a7a90)).toBe(0xffffff);
    expect(paletteShift(0x3a7a90, 0x3a7a90, 0.4)).toBe(0xffffff);
  });

  it("carries a darker hue as a per-channel ratio, never brightens", () => {
    const t = paletteShift(0x1d3d48, 0x3a7a90);
    const [r, g, b] = ch(t);
    expect(r).toBeCloseTo(255 * (0x1d / 0x3a), -1);
    expect(g).toBeCloseTo(255 * (0x3d / 0x7a), -1);
    expect(b).toBeCloseTo(255 * (0x48 / 0x90), -1);
    expect(paletteShift(0xffffff, 0x3a7a90)).toBe(0xffffff);
  });

  it("eases the shift back with k", () => {
    const full = ch(paletteShift(0x1d3d48, 0x3a7a90, 1));
    const half = ch(paletteShift(0x1d3d48, 0x3a7a90, 0.5));
    for (let i = 0; i < 3; i++) {
      expect(half[i]).toBeGreaterThan(full[i]);
      expect(half[i]).toBeLessThan(255);
    }
  });

  it("stacks tints like Pixi does", () => {
    expect(mulColor(0xffffff, 0x123456)).toBe(0x123456);
    expect(mulColor(0x808080, 0x808080)).toBe(0x404040);
  });
});

describe("murkLens", () => {
  it("is deterministic and stays inside the wrap tile", () => {
    const a = murkLens(4, 7, 1200, 300, 12.5, water(), lens());
    const b = murkLens(4, 7, 1200, 300, 12.5, water(), lens());
    expect(a).toEqual(b);
    for (let i = 0; i < 30; i++) {
      const L = murkLens(i, 7, 5000, -200, i * 3.1, water(), lens());
      expect(L.x).toBeGreaterThanOrEqual(0);
      expect(L.x).toBeLessThan(WRAP);
      expect(L.y).toBeGreaterThanOrEqual(0);
      expect(L.y).toBeLessThan(WRAP);
      expect(L.w).toBeGreaterThan(0);
      expect(L.h).toBeLessThan(L.w);
      expect(L.alpha).toBeGreaterThanOrEqual(0);
      expect(L.alpha).toBeLessThan(0.1);
    }
  });

  it("scales with the murk dial and vanishes at zero", () => {
    const a = murkLens(2, 1, 0, 0, 1, water({ murk: 1 }), lens()).alpha;
    const b = murkLens(2, 1, 0, 0, 1, water({ murk: 0.5 }), lens()).alpha;
    expect(b).toBeCloseTo(a * 0.5, 6);
    expect(murkLens(2, 1, 0, 0, 1, water({ murk: 0 }), lens()).alpha).toBe(0);
  });

  it("drifts with the current", () => {
    const p = water({ murkDrift: 20, murkScale: 0 });
    const a = murkLens(3, 1, 0, 0, 0, p, lens());
    const b = murkLens(3, 1, 0, 0, 10, p, lens());
    expect(a.x).not.toBeCloseTo(b.x, 3);
  });
});

describe("marine snow", () => {
  it("is deterministic and inside the wrap tile", () => {
    const a = snowMote(9, 3, 800, 1200, 4.2, water(), mote());
    const b = snowMote(9, 3, 800, 1200, 4.2, water(), mote());
    expect(a).toEqual(b);
    for (let i = 0; i < 40; i++) {
      const m = snowMote(i, 3, 12000, 2400, i * 0.7, water(), mote());
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x).toBeLessThan(WRAP);
      expect(m.y).toBeGreaterThanOrEqual(0);
      expect(m.y).toBeLessThan(WRAP);
      expect(m.d).toBeGreaterThanOrEqual(0.35);
      expect(m.d).toBeLessThanOrEqual(1);
      expect(m.s).toBeGreaterThanOrEqual(0.4);
      expect(m.s).toBeLessThanOrEqual(1.6);
      expect(m.a).toBeGreaterThan(0);
      expect(m.a).toBeLessThanOrEqual(0.24);
    }
  });

  it("sinks at the drift rate, faster for the near motes", () => {
    const p = water({ current: 0, snowDrift: 10 });
    const base = { x: 100, y: 100, s: 1, d: 1 };
    const a = moteAt(base, 0, 0, 0, 0, p, mote());
    const b = moteAt(base, 0, 0, 0, 10, p, mote());
    expect(b.y - a.y).toBeCloseTo(100, 6);
    const far = moteAt({ ...base, d: 0.5 }, 0, 0, 0, 10, p, mote());
    expect(far.y - a.y).toBeCloseTo(50, 6);
  });

  it("parallaxes with the camera, near motes tracking it hardest", () => {
    const p = water({ current: 0, snowDrift: 0 });
    const near = moteAt(
      { x: 2000, y: 2000, s: 1, d: 1 },
      0,
      100,
      0,
      0,
      p,
      mote(),
    );
    const far = moteAt(
      { x: 2000, y: 2000, s: 1, d: 0 },
      0,
      100,
      0,
      0,
      p,
      mote(),
    );
    expect(2000 - near.x).toBeGreaterThan(2000 - far.x);
  });
});

describe("bioluminescence", () => {
  it("gates off in the light and fully on in the dark", () => {
    expect(sparkGate(0)).toBe(0);
    expect(sparkGate(DARK_START - 1)).toBe(0);
    expect(sparkGate(DARK_START)).toBeCloseTo(0, 6);
    expect(sparkGate((DARK_START + DARK_FULL) / 2)).toBeGreaterThan(0.3);
    expect(sparkGate(DARK_FULL)).toBeCloseTo(1, 6);
    expect(sparkGate(DARK_FULL + 900)).toBe(1);
  });

  it("has an envelope in [0, 1] that is dark most of the cycle", () => {
    let lit = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const e = sparkEnvelope(i / N);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThanOrEqual(1);
      if (e > 0.05) lit++;
    }
    expect(lit / N).toBeLessThan(0.5);
    expect(lit / N).toBeGreaterThan(0.1);
    expect(sparkEnvelope(0.1)).toBeCloseTo(1, 6);
  });

  it("is deterministic, bounded, and drawn in cool colours", () => {
    const a = sparkAt(5, 2, 0, 0, 3, water(), spark());
    const b = sparkAt(5, 2, 0, 0, 3, water(), spark());
    expect(a).toEqual(b);
    for (let i = 0; i < 40; i++) {
      const s = sparkAt(i, 2, 3000, 2500, i * 1.3, water(), spark());
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThan(WRAP);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThan(WRAP);
      expect(s.a).toBeGreaterThanOrEqual(0);
      expect(s.a).toBeLessThanOrEqual(1);
      expect(s.r).toBeGreaterThan(0);
      const [r, , bl] = ch(s.color);
      expect(bl).toBeGreaterThan(r);
    }
  });
});

describe("thermocline", () => {
  it("is bounded by the strength dial and flat at zero", () => {
    expect(thermoclineOffset(500, 3, water({ thermoclineStrength: 0 }))).toBe(
      0,
    );
    for (let x = 0; x < 20000; x += 137) {
      const o = thermoclineOffset(x, 2.5, water({ thermoclineStrength: 0.5 }));
      expect(Math.abs(o)).toBeLessThanOrEqual(THERMO_AMP * 0.5 + 1e-9);
    }
  });

  it("actually ripples", () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = 0; x < 20000; x += 97) {
      const o = thermoclineOffset(x, 1, water({ thermoclineStrength: 1 }));
      lo = Math.min(lo, o);
      hi = Math.max(hi, o);
    }
    expect(hi - lo).toBeGreaterThan(THERMO_AMP * 0.3);
  });
});

describe("params", () => {
  it("deep-copies the water group", () => {
    const c = cloneOceanParams();
    expect(c.water).toEqual(OCEAN_DEFAULTS.water);
    expect(c.water).not.toBe(OCEAN_DEFAULTS.water);
    c.water.murk = 0.99;
    expect(OCEAN_DEFAULTS.water.murk).not.toBe(0.99);
  });

  it("ships with the day frozen, and every preset finite", () => {
    expect(OCEAN_DEFAULTS.water.dayLength).toBe(0);
    for (const pr of OCEAN_PRESETS) {
      const p = oceanPreset(pr.id);
      for (const v of Object.values(p.water)) {
        expect(Number.isFinite(v)).toBe(true);
      }
      expect(p.water.murk).toBeGreaterThanOrEqual(0);
      expect(p.water.murk).toBeLessThanOrEqual(1);
      expect(p.water.sparks).toBeLessThanOrEqual(1);
    }
  });
});
