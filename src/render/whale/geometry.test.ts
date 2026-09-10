import { describe, expect, it } from "vitest";

import {
  BODY_END,
  botHalf,
  cosVisible,
  hash01,
  latK,
  mouthPsi,
  profile,
  rollBasis,
  type RollBasis,
  topFrac,
  topHalf,
} from "./geometry";

describe("profile", () => {
  it("keeps a rounded tip at the rostrum rather than closing to a needle", () => {
    expect(profile(0, 40)).toBeGreaterThan(0);
  });

  it("ramps up monotonically through the head", () => {
    let prev = -Infinity;
    for (let t = 0; t <= 0.3; t += 0.02) {
      const h = profile(t, 40);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });

  it("runs out to a slim tail stock aft of the girth peak", () => {
    expect(profile(0.94, 40)).toBeLessThan(profile(0.4, 40) * 0.5);
  });

  it("scales linearly with the width input", () => {
    expect(profile(0.4, 80)).toBeCloseTo(profile(0.4, 40) * 2, 6);
  });

  it("gives a calf a proportionally blunter, longer head", () => {
    // near the tip the juvenile morph carries more height
    expect(profile(0.05, 40, 1)).toBeGreaterThan(profile(0.05, 40, 0));
  });
});

describe("topHalf / botHalf", () => {
  it("sum to the full profile, exactly clear of the splash guard", () => {
    for (let t = 0.3; t < 0.9; t += 0.1) {
      const sum = topHalf(t, 40) + botHalf(t, 40);
      expect(sum).toBeCloseTo(profile(t, 40), 6);
    }
  });

  it("hangs a deeper throat than back over the head (topFrac < 0.5)", () => {
    expect(topFrac(0.1)).toBeLessThan(0.5);
    expect(botHalf(0.1, 40)).toBeGreaterThan(topHalf(0.1, 40));
  });
});

describe("mouthPsi", () => {
  it("opens from the rostrum tip back to a wide jaw corner", () => {
    expect(mouthPsi(0)).toBeCloseTo(0.26, 6);
    expect(mouthPsi(0.24)).toBeGreaterThan(mouthPsi(0));
    expect(mouthPsi(1)).toBeCloseTo(1.26, 6);
  });
});

describe("latK", () => {
  it("compresses the tail stock into a blade", () => {
    expect(latK(0.9)).toBeLessThan(latK(0.3));
  });
});

describe("cosVisible", () => {
  it("matches cos on the visible front half", () => {
    for (const a of [0, 0.5, 1, Math.PI - 0.01]) {
      expect(cosVisible(a)).toBeCloseTo(Math.cos(a), 10);
    }
  });

  it("snaps angles round the back to the silhouette edge they crossed", () => {
    // just past π went round the ventral/keel edge → -1
    expect(cosVisible(Math.PI + 0.1)).toBe(-1);
    // approaching 2π came round the dorsal edge → +1
    expect(cosVisible(Math.PI * 1.9)).toBe(1);
  });

  it("is 2π-periodic and handles negative input", () => {
    expect(cosVisible(-0.4)).toBeCloseTo(cosVisible(Math.PI * 2 - 0.4), 10);
  });
});

describe("hash01", () => {
  it("stays in [0, 1)", () => {
    for (let n = 0; n < 50; n++) {
      const v = hash01(n, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic", () => {
    expect(hash01(7, 2)).toBe(hash01(7, 2));
  });

  it("decorrelates whales in a pod by seed", () => {
    let same = 0;
    for (let n = 0; n < 32; n++) {
      if (Math.abs(hash01(n, 1) - hash01(n, 2)) < 1e-3) same++;
    }
    expect(same).toBeLessThan(3);
  });
});

describe("rollBasis", () => {
  const out: RollBasis = { cs: 0, sn: 0 };

  it("is level (cs=1, sn=0) with no roll", () => {
    rollBasis(0, 1, out);
    expect(out.cs).toBeCloseTo(1, 10);
    expect(out.sn).toBeCloseTo(0, 10);
  });

  it("is a unit vector at every angle and blend", () => {
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      for (const k of [0, 0.25, 0.5, 0.75, 1]) {
        rollBasis(a, k, out);
        expect(Math.hypot(out.cs, out.sn)).toBeCloseTo(1, 10);
      }
    }
  });

  it("faces the camera belly-on at 90°", () => {
    rollBasis(Math.PI / 2, 1, out);
    expect(out.cs).toBeCloseTo(0, 10);
    expect(out.sn).toBeCloseTo(1, 10);
  });

  it("inverts (cs=-1) at 180°", () => {
    rollBasis(Math.PI, 1, out);
    expect(out.cs).toBeCloseTo(-1, 10);
  });

  it("rollK=0 collapses any angle back to level", () => {
    rollBasis(Math.PI, 0, out);
    expect(out.cs).toBeCloseTo(1, 10);
    expect(out.sn).toBeCloseTo(0, 10);
  });

  it("clamps rollK to [0,1]", () => {
    rollBasis(Math.PI / 2, 5, out);
    expect(Math.hypot(out.cs, out.sn)).toBeCloseTo(1, 10);
  });
});

describe("constants", () => {
  it("hands the body off to the fluke just before the spine end", () => {
    expect(BODY_END).toBeGreaterThan(0.9);
    expect(BODY_END).toBeLessThan(1);
  });
});
