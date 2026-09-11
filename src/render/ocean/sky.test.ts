import { describe, expect, it } from "vitest";

import { OCEAN_DEFAULTS, cloneOceanParams, sunLean } from "./params";
import {
  birds,
  cloudBanks,
  cloudPuffs,
  shaftProfile,
  skyLight,
  skyPalette,
  stars,
  type SkyParams,
} from "./sky";

const sky = (patch: Partial<SkyParams> = {}): SkyParams => ({
  ...cloneOceanParams().sky,
  ...patch,
});

describe("skyLight", () => {
  it("runs the sun from east to west across the day", () => {
    expect(skyLight(0.25).ax).toBeCloseTo(-1, 6); // sunrise, one side
    expect(skyLight(0.5).ax).toBeCloseTo(0, 6); // noon, overhead
    expect(skyLight(0.75).ax).toBeCloseTo(1, 6); // sunset, the other
  });

  it("peaks at noon and sits on the horizon at sunrise and sunset", () => {
    expect(skyLight(0.5).altitude).toBeCloseTo(1, 6);
    expect(skyLight(0.25).altitude).toBeCloseTo(0, 6);
    expect(skyLight(0.75).altitude).toBeCloseTo(0, 6);
  });

  it("hands the sky to the moon once the sun is down", () => {
    expect(skyLight(0.5).moon).toBe(false);
    expect(skyLight(0).moon).toBe(true);
    // the moon takes the mirrored position, so the sky is never unlit
    expect(skyLight(0).altitude).toBeGreaterThan(0);
  });

  it("keeps some light through twilight, none at midnight", () => {
    expect(skyLight(0.5).daylight).toBe(1);
    expect(skyLight(0.25).daylight).toBeGreaterThan(0);
    expect(skyLight(0.25).daylight).toBeLessThan(1);
    expect(skyLight(0).daylight).toBe(0);
  });

  it("wraps cleanly across midnight", () => {
    expect(skyLight(1.25).ax).toBeCloseTo(skyLight(0.25).ax, 9);
    expect(skyLight(-0.25).ax).toBeCloseTo(skyLight(0.75).ax, 9);
  });

  it("leans the light the way the sun actually is", () => {
    expect(skyLight(0.35).lean).toBeLessThan(0); // morning sun to one side
    expect(skyLight(0.5).lean).toBeCloseTo(0, 6); // straight down at noon
    expect(skyLight(0.65).lean).toBeGreaterThan(0);
  });
});

describe("skyPalette", () => {
  it("is defined all the way round the clock", () => {
    for (let tod = 0; tod < 1; tod += 0.01) {
      const p = skyPalette(tod);
      for (const v of Object.values(p)) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(0xffffff);
      }
    }
  });

  it("wraps: midnight from either side is the same sky", () => {
    expect(skyPalette(0.999).top).not.toBe(skyPalette(0.5).top);
    expect(skyPalette(1).top).toBe(skyPalette(0).top);
  });

  it("is darker at midnight than at noon", () => {
    const lum = (c: number): number =>
      ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
    expect(lum(skyPalette(0).top)).toBeLessThan(lum(skyPalette(0.5).top));
  });

  it("warms the horizon at sunset", () => {
    const red = (c: number): number => (c >> 16) & 255;
    const blue = (c: number): number => c & 255;
    const dusk = skyPalette(0.72).horizon;
    expect(red(dusk)).toBeGreaterThan(blue(dusk));
    const noon = skyPalette(0.5).horizon;
    expect(red(noon)).toBeLessThan(blue(noon));
  });

  it("moves continuously — no palette jump between keyframes", () => {
    const chan = (c: number, i: number): number => (c >> (i * 8)) & 255;
    let prev = skyPalette(0);
    for (let tod = 0.002; tod <= 1; tod += 0.002) {
      const now = skyPalette(tod);
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(chan(now.top, i) - chan(prev.top, i))).toBeLessThan(4);
        expect(
          Math.abs(chan(now.horizon, i) - chan(prev.horizon, i)),
        ).toBeLessThan(4);
      }
      prev = now;
    }
  });
});

describe("cloudPuffs", () => {
  it("sits every puff on one flat base — the shape that reads as cumulus", () => {
    for (const puff of cloudPuffs(sky(), 3, 0)) {
      expect(puff.dy).toBeCloseTo(-puff.ry, 9);
    }
  });

  it("is deterministic per index and deck", () => {
    expect(cloudPuffs(sky(), 4, 1)).toEqual(cloudPuffs(sky(), 4, 1));
    expect(cloudPuffs(sky(), 4, 1)).not.toEqual(cloudPuffs(sky(), 5, 1));
  });

  it("flattens toward streaks as cloudPuff drops", () => {
    const tall = cloudPuffs(sky({ cloudPuff: 1 }), 2, 0);
    const flat = cloudPuffs(sky({ cloudPuff: 0 }), 2, 0);
    for (let i = 0; i < tall.length; i++) {
      expect(flat[i].ry).toBeLessThan(tall[i].ry);
      expect(flat[i].rx).toBeCloseTo(tall[i].rx, 9);
    }
  });

  it("scales with cloudScale", () => {
    const small = cloudPuffs(sky({ cloudScale: 500 }), 2, 0);
    const big = cloudPuffs(sky({ cloudScale: 1000 }), 2, 0);
    expect(big[0].rx).toBeCloseTo(small[0].rx * 2, 6);
  });
});

describe("cloudBanks", () => {
  it("clears the sky at zero cover", () => {
    expect(cloudBanks(sky({ cloudCover: 0 }), 0, 0)).toEqual([]);
  });

  it("fills more of the sky as cover rises", () => {
    const n = (cloudCover: number): number =>
      cloudBanks(sky({ cloudCover }), 0, 0, 0, 8).length;
    expect(n(0.2)).toBeLessThan(n(0.9));
  });

  it("keeps every bank inside the visible sky", () => {
    for (let deck = 0; deck < 3; deck++) {
      for (const b of cloudBanks(sky(), deck, 0, 0, 8)) {
        expect(b.alt).toBeGreaterThan(0);
        expect(b.alt).toBeLessThanOrEqual(1);
        expect(b.alpha).toBeGreaterThan(0);
        expect(b.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it("stacks further decks higher and fainter", () => {
    const mean = (xs: number[]): number =>
      xs.reduce((a, b) => a + b, 0) / xs.length;
    const near = cloudBanks(sky({ cloudCover: 1 }), 0, 0, 0, 8);
    const far = cloudBanks(sky({ cloudCover: 1 }), 2, 0, 0, 8);
    expect(mean(far.map((b) => b.alt))).toBeGreaterThan(
      mean(near.map((b) => b.alt)),
    );
    expect(mean(far.map((b) => b.alpha))).toBeLessThan(
      mean(near.map((b) => b.alpha)),
    );
  });

  it("drifts downwind over time, carrying each bank with it", () => {
    const p = sky({ cloudCover: 1, cloudDrift: 6 });
    const at = (t: number): Map<number, number> =>
      new Map(cloudBanks(p, 0, t, 0, 8).map((b) => [b.index, b.u]));
    const t0 = at(0);
    const t10 = at(10);
    let checked = 0;
    for (const [index, u] of t10) {
      const was = t0.get(index);
      if (was === undefined) continue;
      expect(u).toBeCloseTo(was - (6 / 60) * 10, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(4);
  });

  it("slides with the camera pan, so decks separate as it tracks", () => {
    const p = sky({ cloudCover: 1 });
    const at = (pan: number): Map<number, number> =>
      new Map(cloudBanks(p, 0, 0, pan, 8).map((b) => [b.index, b.u]));
    const a = at(0);
    for (const [index, u] of at(0.25)) {
      const was = a.get(index);
      if (was !== undefined) expect(u).toBeCloseTo(was - 0.25, 6);
    }
  });

  it("covers the screen and little beyond it", () => {
    const p = sky({ cloudCover: 1 });
    const spacing = p.cloudScale * 1.9;
    for (const b of cloudBanks(p, 0, 0)) {
      expect(Math.abs(b.u)).toBeLessThan(0.75 + 2 * spacing);
    }
    // the field reaches across the whole viewport, not just its middle
    const us = cloudBanks(p, 0, 0).map((b) => b.u);
    expect(Math.min(...us)).toBeLessThan(-0.4);
    expect(Math.max(...us)).toBeGreaterThan(0.4);
  });
});

describe("stars", () => {
  it("stays hidden while the sun is up", () => {
    expect(stars(sky({ timeOfDay: 0.5 }), 0)).toEqual([]);
  });

  it("comes out at night", () => {
    expect(stars(sky({ timeOfDay: 0 }), 0).length).toBeGreaterThan(0);
  });

  it("thins out as the density dial drops", () => {
    const n = (d: number): number =>
      stars(sky({ timeOfDay: 0, stars: d }), 0).length;
    expect(n(0.2)).toBeLessThan(n(1));
  });

  it("keeps every star inside the visible sky", () => {
    for (const s of stars(sky({ timeOfDay: 0 }), 0)) {
      expect(s.alt).toBeGreaterThanOrEqual(0);
      expect(s.alt).toBeLessThanOrEqual(1);
      expect(Math.abs(s.u)).toBeLessThan(0.75);
      expect(s.r).toBeGreaterThan(0);
    }
  });

  it("fades out toward the horizon, where haze would swallow them", () => {
    const low = stars(sky({ timeOfDay: 0 }), 0).filter((s) => s.alt < 0.05);
    for (const s of low) expect(s.k).toBeLessThan(0.7);
  });

  it("twinkles — the same star changes brightness over time", () => {
    const at = (t: number): number => stars(sky({ timeOfDay: 0 }), t)[0].k;
    expect(at(0)).not.toBeCloseTo(at(1.3), 3);
  });
});

describe("birds", () => {
  it("returns none when the dial is off", () => {
    expect(birds(sky({ birds: 0 }), 0)).toEqual([]);
  });

  it("scales roughly with the per-screen dial", () => {
    const n = (b: number): number => birds(sky({ birds: b }), 0).length;
    expect(n(8)).toBeGreaterThan(n(1));
  });

  it("flies above the water and flaps", () => {
    const flock = birds(sky({ birds: 6 }), 0);
    expect(flock.length).toBeGreaterThan(0);
    for (const b of flock) {
      expect(b.alt).toBeGreaterThan(0);
      expect(b.alt).toBeLessThanOrEqual(1);
      expect(b.span).toBeGreaterThan(0);
      expect(Math.abs(b.flap)).toBeLessThanOrEqual(1);
    }
    const wings = (t: number): number => birds(sky({ birds: 6 }), t)[0].flap;
    expect(wings(0)).not.toBeCloseTo(wings(0.4), 3);
  });
});

describe("shaftProfile", () => {
  it("is dark at the surface, brightest just under it, gone at depth", () => {
    expect(shaftProfile(0)).toBe(0);
    expect(shaftProfile(0.16)).toBeCloseTo(1, 6);
    expect(shaftProfile(1)).toBeCloseTo(0, 6);
  });

  it("never leaves 0..1", () => {
    for (let t = 0; t <= 1; t += 0.01) {
      expect(shaftProfile(t)).toBeGreaterThanOrEqual(0);
      expect(shaftProfile(t)).toBeLessThanOrEqual(1);
    }
  });
});

describe("sunLean", () => {
  it("matches the shipped sun angle at the default hour", () => {
    // the default `timeOfDay` is chosen so the derived lean lands on SUN_LEAN,
    // keeping god-rays and ship shadows at the angle they were art-directed at
    expect(sunLean()).toBeCloseTo(0.12, 2);
    expect(OCEAN_DEFAULTS.sky.timeOfDay).toBeGreaterThan(0.5);
  });
});
