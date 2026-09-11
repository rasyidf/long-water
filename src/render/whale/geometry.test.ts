import type { Vec2 } from "../../core/math";
import { describe, expect, it } from "vitest";

import {
  bandAt,
  bodyPoint,
  BODY_END,
  botHalf,
  buildArcLength,
  buildHullOutline,
  buildTangents,
  computeSection,
  cosVisible,
  edgeBot,
  edgeTop,
  faceAt,
  hash01,
  latK,
  mouthPsi,
  profile,
  prpAt,
  rollBasis,
  type RollBasis,
  type Section,
  spineFrameAt,
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

describe("buildArcLength", () => {
  it("sums segment lengths cumulatively", () => {
    const sp: Vec2[] = [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 3, y: 8 },
    ];
    const cum = [0, 0, 0];
    const total = buildArcLength(sp, cum, 2);
    expect(cum).toEqual([0, 5, 9]);
    expect(total).toBeCloseTo(9, 6);
  });
});

describe("buildTangents", () => {
  it("gives every vertex the same unit tangent along a straight spine", () => {
    const sp: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    const tan: Vec2[] = sp.map(() => ({ x: 0, y: 0 }));
    buildTangents(sp, tan, 3);
    const ref = tan[1];
    for (const v of tan) {
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 6);
      expect(v.x).toBeCloseTo(ref.x, 6);
      expect(v.y).toBeCloseTo(ref.y, 6);
    }
  });

  it("keeps the previous vertex's tangent across a degenerate segment instead of snapping to +x", () => {
    // vertex 2's neighbours (1 and 3) coincide, so its own segment is degenerate
    const sp: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0 },
    ];
    const tan: Vec2[] = sp.map(() => ({ x: 0, y: 0 }));
    buildTangents(sp, tan, 3);
    expect(tan[2]).toEqual(tan[1]);
    expect(tan[3]).toEqual(tan[2]);
  });
});

describe("spineFrameAt", () => {
  it("interpolates position along a straight spine with a unit, perpendicular frame", () => {
    const sp: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];
    const cum = [0, 0, 0, 0];
    const total = buildArcLength(sp, cum, 3);
    const tan: Vec2[] = sp.map(() => ({ x: 0, y: 0 }));
    buildTangents(sp, tan, 3);
    const p: Vec2 = { x: 0, y: 0 };
    const f: Vec2 = { x: 1, y: 0 };
    const per: Vec2 = { x: 0, y: 0 };
    spineFrameAt(sp, cum, tan, total, 3, 0.5, 1, p, f, per);
    expect(p.x).toBeCloseTo(1.5, 6);
    expect(p.y).toBeCloseTo(0, 6);
    expect(Math.hypot(f.x, f.y)).toBeCloseTo(1, 6);
    expect(f.x * per.x + f.y * per.y).toBeCloseTo(0, 10);
    expect(Math.hypot(per.x, per.y)).toBeCloseTo(1, 6);
  });

  it("negating facing flips the perpendicular", () => {
    const sp: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const cum = [0, 1];
    const tan: Vec2[] = [
      { x: 0, y: 1 },
      { x: 0, y: 1 },
    ];
    const p: Vec2 = { x: 0, y: 0 };
    const perA: Vec2 = { x: 0, y: 0 };
    const perB: Vec2 = { x: 0, y: 0 };
    spineFrameAt(sp, cum, tan, 1, 1, 0.5, 1, p, { x: 0, y: 1 }, perA);
    spineFrameAt(sp, cum, tan, 1, 1, 0.5, -1, p, { x: 0, y: 1 }, perB);
    expect(perA.x).toBeCloseTo(-perB.x, 6);
    expect(perA.y).toBeCloseTo(-perB.y, 6);
  });

  it("leaves the tangent untouched when the interpolated frame is degenerate", () => {
    // opposing unit tangents at the two vertices cancel exactly at the midpoint
    const sp: Vec2[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ];
    const cum = [0, 1];
    const tan: Vec2[] = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
    ];
    const p: Vec2 = { x: 0, y: 0 };
    const f: Vec2 = { x: 0, y: 1 }; // stand-in for "the previous frame"
    const per: Vec2 = { x: 0, y: 0 };
    spineFrameAt(sp, cum, tan, 1, 1, 0.5, 1, p, f, per);
    expect(f.x).toBeCloseTo(0, 10);
    expect(f.y).toBeCloseTo(1, 10);
    // per is still derived from the (unchanged) f, not left stale
    expect(per.x).toBeCloseTo(-1, 10);
    expect(per.y).toBeCloseTo(0, 10);
  });
});

describe("computeSection / edgeTop / edgeBot", () => {
  const sec: Section = { A: 0, C: 0, B: 0, R: 0, D: 0 };

  it("matches topHalf/botHalf exactly at level roll", () => {
    for (const t of [0.1, 0.4, 0.7]) {
      computeSection(t, 40, 0, 1, 0, sec);
      expect(edgeTop(sec, 1)).toBeCloseTo(-topHalf(t, 40), 6);
      expect(edgeBot(sec, 1)).toBeCloseTo(botHalf(t, 40), 6);
    }
  });

  it("narrows to the lateral semi-axis when rolled edge-on", () => {
    computeSection(0.4, 40, 0, 0, 1, sec);
    expect(sec.R).toBeCloseTo(sec.B, 6);
  });
});

describe("prpAt / faceAt", () => {
  const sec: Section = { A: 0, C: 0, B: 0, R: 0, D: 0 };

  it("the ventral keel (psi=0) sits on the belly edge, on the silhouette", () => {
    computeSection(0.4, 40, 0, 1, 0, sec);
    expect(prpAt(sec, 1, 0)).toBeCloseTo(botHalf(0.4, 40), 6);
    expect(faceAt(sec, 0)).toBeCloseTo(0, 10);
  });

  it("the dorsal ridge (psi=π) sits on the back edge at level roll", () => {
    computeSection(0.4, 40, 0, 1, 0, sec);
    expect(prpAt(sec, 1, Math.PI)).toBeCloseTo(-topHalf(0.4, 40), 6);
  });

  it("the flank (psi=π/2) faces the camera square-on at level roll", () => {
    computeSection(0.4, 40, 0, 1, 0, sec);
    expect(faceAt(sec, Math.PI / 2)).toBeCloseTo(1, 10);
  });
});

describe("bandAt", () => {
  const sec: Section = { A: 0, C: 0, B: 0, R: 0, D: 0 };

  it("collapses to a point matching prpAt as the half-width shrinks to zero", () => {
    computeSection(0.4, 40, 0, 1, 0, sec);
    const out: Vec2 = { x: 0, y: 0 };
    bandAt(sec, 1, 0.3, 1e-4, out);
    const p = prpAt(sec, 1, 0.3);
    expect(out.x).toBeCloseTo(p, 2);
    expect(out.y).toBeCloseTo(p, 2);
  });
});

describe("bodyPoint", () => {
  it("offsets from p along f and per, scaled", () => {
    const p: Vec2 = { x: 10, y: 20 };
    const f: Vec2 = { x: 1, y: 0 };
    const per: Vec2 = { x: 0, y: 1 };
    const out: Vec2 = { x: 0, y: 0 };
    bodyPoint(p, f, per, 2, 3, 5, out);
    expect(out.x).toBeCloseTo(10 + 2 * 5, 6);
    expect(out.y).toBeCloseTo(20 + 3 * 5, 6);
  });
});

describe("buildHullOutline", () => {
  // Orientation-based proper segment intersection: shared endpoints or
  // collinear touches don't count, only a genuine crossing does.
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
  // Bug #1 was a self-intersecting hull outline (the head cap closed before
  // the top/bottom edges met, crossing the closing segment and notching the
  // snout) — this walks every non-adjacent pair of edges in the wound loop.
  function hasSelfIntersection(pts: Vec2[], n: number): boolean {
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      for (let j = i + 1; j < n; j++) {
        if (j === (i + 1) % n) continue; // shares vertex b
        if ((j + 1) % n === i) continue; // shares vertex a (wraps around)
        const c = pts[j];
        const d = pts[(j + 1) % n];
        if (segmentsCross(a, b, c, d)) return true;
      }
    }
    return false;
  }

  function buildOutline(sp: Vec2[], steps: number): { pts: Vec2[]; n: number } {
    const last = sp.length - 1;
    const cum = new Array(last + 1).fill(0);
    const total = buildArcLength(sp, cum, last);
    const tan: Vec2[] = sp.map(() => ({ x: 0, y: 0 }));
    buildTangents(sp, tan, last);
    const p: Vec2 = { x: 0, y: 0 };
    const f: Vec2 = { x: 1, y: 0 };
    const per: Vec2 = { x: 0, y: 0 };
    const sec: Section = { A: 0, C: 0, B: 0, R: 0, D: 0 };
    const pts: Vec2[] = Array.from({ length: steps * 2 + 8 }, () => ({
      x: 0,
      y: 0,
    }));
    const n = buildHullOutline(
      sp,
      cum,
      tan,
      total,
      last,
      1,
      1,
      40,
      0,
      1,
      0,
      steps,
      p,
      f,
      per,
      sec,
      pts,
    );
    return { pts, n };
  }

  for (const steps of [8, 20, 40]) {
    it(`never self-intersects at the rostrum on a straight spine (STEPS=${steps})`, () => {
      const sp: Vec2[] = Array.from({ length: 10 }, (_, i) => ({
        x: i * 30,
        y: 0,
      }));
      const { pts, n } = buildOutline(sp, steps);
      expect(hasSelfIntersection(pts, n)).toBe(false);
    });
  }

  it("stays non-self-intersecting on a curved spine", () => {
    const sp: Vec2[] = Array.from({ length: 10 }, (_, i) => {
      const t = i / 9;
      return { x: t * 300, y: Math.sin(t * Math.PI * 1.5) * 60 };
    });
    const { pts, n } = buildOutline(sp, 20);
    expect(hasSelfIntersection(pts, n)).toBe(false);
  });
});

describe("constants", () => {
  it("hands the body off to the fluke just before the spine end", () => {
    expect(BODY_END).toBeGreaterThan(0.9);
    expect(BODY_END).toBeLessThan(1);
  });
});
