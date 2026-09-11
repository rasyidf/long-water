/**
 * Procedural reef coral — seven kinds, every one a filled silhouette with a
 * rim / vein highlight and a soft contact shadow at its root, so it reads as
 * part of the reef instead of a decal floating on top of it.
 *
 * The shape math lives in `geometry.ts`; this file only bends it with the
 * current, projects it to screen and issues `Graphics` calls. Everything is
 * drawn in a local frame — `fx` sideways in px, `fy` up from the seabed root
 * in px — through `X()` / `Y()`, which fold in the patch-wide current sway
 * (quadratic in height, root pinned) and the item's own lean. Draw calls are
 * split into named sections (`opts.layer`) so the designer can isolate each.
 *
 * Draw touches no `new`: point pools and scratch objects are preallocated, so
 * a reef of a few hundred growths at 60 fps produces no per-frame garbage.
 */
import type { Graphics } from "pixi.js";

import type { Camera } from "../../core/Camera";
import { hash01, smoothstep, type Vec2 } from "../../core/math";
import type { Coral } from "../../state/Fauna";
import { mixColor } from "../color";
import { sunLean } from "../ocean/params";
import type { CoralSection, CoralView, CoralDrawOptions } from "./CoralView";
import {
  breathe,
  buildStaghorn,
  domeRadius,
  fanRadius,
  fingerCount,
  genome,
  type Genome,
  grooveCount,
  HUE,
  KIND_COUNT,
  makeSegments,
  plateRadius,
  polypPulse,
  type Segment,
  sinkColor,
  STIFFNESS,
  swayAt,
  currentAt,
  type Tentacle,
  tentacleAt,
  tentacleCount,
  type Tube,
  tubeAt,
  tubeCount,
  veinCount,
  WATER,
} from "./geometry";
import type { CoralParams } from "./params";

/** the widest outline any kind traces (the table plate, 28 samples + cap) */
const MAX_PTS = 64;
/** nominal height in world units at scale 1 */
const BASE_H = 88;
/** footprint half-width per kind as a fraction of height — contact shadow */
const FOOT = [0.3, 0.42, 0.62, 0.48, 0.16, 0.36, 0.34] as const;

const BLACK = 0x02050a;

/** Smooth closed curve through `pts[0..count)`, quadratics via the midpoints. */
function drawBlob(g: Graphics, pts: Vec2[], count: number): void {
  if (count < 3) return;
  const a = pts[0];
  const z = pts[count - 1];
  g.moveTo((z.x + a.x) / 2, (z.y + a.y) / 2);
  for (let i = 0; i < count; i++) {
    const c = pts[i];
    const d = pts[(i + 1) % count];
    g.quadraticCurveTo(c.x, c.y, (c.x + d.x) / 2, (c.y + d.y) / 2);
  }
  g.closePath();
}

/** open smooth polyline through `pts[0..count)`, for rims and veins */
function drawRibbon(g: Graphics, pts: Vec2[], count: number): void {
  if (count < 2) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < count; i++) {
    const c = pts[i - 1];
    const d = pts[i];
    g.quadraticCurveTo(c.x, c.y, (c.x + d.x) / 2, (c.y + d.y) / 2);
  }
  g.lineTo(pts[count - 1].x, pts[count - 1].y);
}

export class ProceduralCoralView implements CoralView {
  // ── scratch, rewritten per draw ──────────────────────────────────────────
  private readonly pts: Vec2[] = Array.from({ length: MAX_PTS }, () => ({
    x: 0,
    y: 0,
  }));
  private readonly segs: Segment[] = makeSegments();
  private readonly gn: Genome = {
    height: 1,
    spread: 1,
    tone: 0,
    lean: 0,
    jitter: 0,
    count: 0,
    phase: 0,
  };
  private readonly tube: Tube = { bx: 0, tx: 0, th: 0, r0: 0, r1: 0, ph: 0 };
  private readonly tent: Tentacle = { x: 0, y: 0, ang: 0, len: 0, w: 0 };

  /** the current item's frame: screen root, height in px, bend inputs */
  private ox = 0;
  private oy = 0;
  private h = 0;
  private cur = 0;
  private stiff = 0;
  private lean = 0;
  /** ±1: which side of the growth faces the sun */
  private litSide = -1;
  private detail = 0;
  private t = 0;
  private alpha = 0;

  // ── palette, rebuilt only when its (quantised) inputs change ─────────────
  private ck = -1;
  private cBody = 0;
  private cTip = 0;
  private cRim = 0;
  private cShade = 0;
  private cDark = 0;
  private cSoft = 0;

  private palette(
    kind: number,
    tone: number,
    light: number,
    sonar: number,
    p: CoralParams,
  ): void {
    const key =
      kind +
      ((tone * 15) | 0) * 8 +
      ((light * 7) | 0) * 128 +
      ((sonar * 3) | 0) * 1024 +
      ((p.sink * 40) | 0) * 4096 +
      ((p.hueJitter * 20) | 0) * 262144;
    if (key === this.ck) return;
    this.ck = key;
    // per-kind hue, jittered toward a neighbour kind's per item, then sunk
    // toward the water so it sits in the reef instead of glowing; deeper (less
    // ambient light) sinks further and loses its warm channels first
    const hue = mixColor(
      HUE[kind],
      HUE[(kind + 1 + ((tone * 3) | 0)) % KIND_COUNT],
      tone * 0.35 * p.hueJitter,
    );
    this.cBody = sinkColor(
      hue,
      WATER,
      p.sink + tone * 0.14 + (1 - light) * 0.28 - sonar * 0.2,
    );
    this.cTip = mixColor(hue, 0xfff1e2, 0.5 + sonar * 0.3);
    this.cRim = mixColor(hue, 0xffffff, 0.62);
    this.cShade = mixColor(this.cBody, BLACK, 0.45);
    this.cDark = mixColor(this.cBody, BLACK, 0.62);
    this.cSoft = mixColor(this.cBody, this.cTip, 0.32);
  }

  // ── local → screen ───────────────────────────────────────────────────────

  /** screen x of local (`fx` sideways, `fy` up), bent by current and lean */
  private X(fx: number, fy: number): number {
    const f = fy / this.h;
    return (
      this.ox + fx + this.h * swayAt(f, this.cur, this.stiff) + this.lean * fy
    );
  }
  private Y(fy: number): number {
    return this.oy - fy;
  }
  /** write local point `i` of the pool */
  private put(i: number, fx: number, fy: number): void {
    this.pts[i].x = this.X(fx, fy);
    this.pts[i].y = this.Y(fy);
  }

  draw(g: Graphics, cr: Coral, opts: CoralDrawOptions, cam: Camera): void {
    const p = opts.params;
    const a = opts.alpha;
    if (a <= 0.01) return;
    const pick = (s: CoralSection): Graphics => opts.layer?.(s) ?? g;

    const gn = genome(cr.x, cr.ph, this.gn);
    const kind = ((cr.kind % KIND_COUNT) + KIND_COUNT) % KIND_COUNT;
    const sc = cam.scale;
    this.ox = cam.sx(cr.x);
    this.oy = cam.sy(cr.y);
    this.h = BASE_H * cr.scale * sc * p.heightScale * gn.height;
    this.t = opts.t;
    this.alpha = a;
    // the patch-wide current, scaled by the dial; the kind decides how much
    // of it the growth actually gives to
    this.cur = currentAt(p.seed, cr.x, opts.t, p) * p.sway;
    this.stiff = STIFFNESS[kind];
    this.lean = gn.lean;
    // light comes down from the sun: `sunLean` is its horizontal run per unit
    // of drop, so the face turned toward it is on the opposite side
    this.litSide = sunLean() > 0 ? -1 : 1;
    // smooth LOD ramp on on-screen height so veins / buds / polyps fade in
    // instead of popping as the camera zooms
    this.detail = smoothstep(10, 56, this.h);
    this.palette(kind, gn.tone, opts.light, opts.sonar, p);

    const h = this.h;
    const foot = h * FOOT[kind] * gn.spread * p.spread;

    // ---------- Contact shadow ----------
    // A soft dark ellipse on the rock under the holdfast, so the growth sits
    // on the reef rather than floating in front of it.
    {
      const sg = pick("shadow");
      sg.ellipse(this.ox, this.oy + 2 * sc, foot * 0.7, h * 0.1);
      sg.fill({ color: BLACK, alpha: a * 0.32 });
    }

    // ---------- Holdfast ----------
    // The low mound where the skeleton meets the rock. The brain coral and
    // the table plate sit on their own base and skip it.
    if (kind !== 2) {
      const hg = pick("holdfast");
      const w = foot * (kind === 6 ? 0.45 : 0.6);
      hg.moveTo(this.X(-w, 0), this.Y(0));
      hg.quadraticCurveTo(
        this.X(0, h * 0.09),
        this.Y(h * 0.09),
        this.X(w, 0),
        this.Y(0),
      );
      hg.closePath();
      hg.fill({ color: this.cShade, alpha: a * 0.85 });
    }

    switch (kind) {
      case 0:
        this.fan(pick, gn, p);
        break;
      case 1:
        this.staghorn(pick, gn, p);
        break;
      case 2:
        this.brain(pick, gn, p);
        break;
      case 3:
        this.tubes(pick, gn, p);
        break;
      case 4:
        this.whip(pick, gn, p);
        break;
      case 5:
        this.anemone(pick, gn, p);
        break;
      default:
        this.table(pick, gn, p);
    }
  }

  // ---------- Sea fan ----------
  // A filled membrane on a short stalk, veins radiating from the stalk top.
  // The membrane flutters: a ripple travels across its edge, and the whole
  // sheet leans with the current.
  private fan(
    pick: (s: CoralSection) => Graphics,
    gn: Genome,
    p: CoralParams,
  ): void {
    const h = this.h;
    const a = this.alpha;
    const t = this.t;
    const w = h * 0.7 * gn.spread * p.spread;
    const R = h * 0.85;
    const pivot = h * 0.2;
    const HALF = 1.35;

    // stalk
    const bg = pick("body");
    bg.moveTo(this.X(-w * 0.07, 0), this.Y(0));
    bg.lineTo(this.X(-w * 0.1, pivot), this.Y(pivot));
    bg.lineTo(this.X(w * 0.1, pivot), this.Y(pivot));
    bg.lineTo(this.X(w * 0.07, 0), this.Y(0));
    bg.closePath();
    bg.fill({ color: this.cBody, alpha: a });

    // membrane: radial samples around the pivot, rippled at the edge
    const N = 17;
    let m = 0;
    for (let i = 0; i <= N; i++) {
      const ang = -HALF + (i / N) * 2 * HALF;
      const r = R * fanRadius(ang, gn, t, p.flutter);
      this.put(
        m++,
        Math.sin(ang) * r * 0.82 * gn.spread * p.spread,
        pivot + Math.cos(ang) * r,
      );
    }
    this.put(m++, 0, pivot * 0.9);
    drawBlob(bg, this.pts, m);
    bg.fill({ color: this.cBody, alpha: a * 0.82 });

    // form shadow: the stalk's lower half, in the dark
    const sg = pick("shade");
    sg.moveTo(this.X(-w * 0.07, 0), this.Y(0));
    sg.lineTo(this.X(-w * 0.085, pivot * 0.5), this.Y(pivot * 0.5));
    sg.lineTo(this.X(w * 0.085, pivot * 0.5), this.Y(pivot * 0.5));
    sg.lineTo(this.X(w * 0.07, 0), this.Y(0));
    sg.closePath();
    sg.fill({ color: this.cShade, alpha: a * 0.5 });

    // veins, from the stalk top out to the rippled edge
    if (this.detail > 0.03) {
      const dg = pick("detail");
      const n = veinCount(gn, this.detail);
      for (let i = 0; i < n; i++) {
        const s = (i / (n - 1) - 0.5) * 2;
        const ang = s * HALF * 0.92;
        const r = R * fanRadius(ang, gn, t, p.flutter) * 0.97;
        const ex = Math.sin(ang) * r * 0.82 * gn.spread * p.spread;
        const ey = pivot + Math.cos(ang) * r;
        dg.moveTo(this.X(0, pivot), this.Y(pivot));
        dg.quadraticCurveTo(
          this.X(ex * 0.32, pivot + (ey - pivot) * 0.6),
          this.Y(pivot + (ey - pivot) * 0.6),
          this.X(ex, ey),
          this.Y(ey),
        );
      }
      dg.stroke({
        width: Math.max(1, h * 0.018),
        color: this.cTip,
        alpha: a * 0.4 * this.detail,
      });

      // polyps beading the edge where the veins arrive
      const pg = pick("polyps");
      const k = polypPulse(t, gn.phase, p.polypPulse);
      for (let i = 0; i < n; i++) {
        if (hash01(i * 17 + Math.round(gn.tone * 100)) > p.polypDensity)
          continue;
        const s = (i / (n - 1) - 0.5) * 2;
        const ang = s * HALF * 0.92;
        const r = R * fanRadius(ang, gn, t, p.flutter);
        pg.circle(
          this.X(
            Math.sin(ang) * r * 0.82 * gn.spread * p.spread,
            pivot + Math.cos(ang) * r,
          ),
          this.Y(pivot + Math.cos(ang) * r),
          h * 0.018 * (0.8 + 0.2 * k),
        );
      }
      pg.fill({ color: this.cTip, alpha: a * 0.35 * this.detail });
    }

    // rim light along the sunlit shoulder of the membrane
    if (p.rim > 0.01) {
      const rg = pick("rim");
      const S = 8;
      let b = 0;
      for (let i = 0; i <= S; i++) {
        const ang = this.litSide * HALF * 0.85 * (1 - i / S);
        const r = R * fanRadius(ang, gn, t, p.flutter) * 0.985;
        this.put(
          b++,
          Math.sin(ang) * r * 0.82 * gn.spread * p.spread,
          pivot + Math.cos(ang) * r,
        );
      }
      drawRibbon(rg, this.pts, b);
      rg.stroke({
        width: Math.max(1, h * 0.022),
        color: this.cRim,
        alpha: a * 0.3 * p.rim,
      });
    }
  }

  // ---------- Staghorn ----------
  // A recursively branching thicket of tapered arms, budded at the tips. The
  // skeleton is rigid; only the fine outer branches give to the current, which
  // the quadratic sway already does — the trunks barely move, the tips do.
  private staghorn(
    pick: (s: CoralSection) => Graphics,
    gn: Genome,
    p: CoralParams,
  ): void {
    const h = this.h;
    const a = this.alpha;
    const n = buildStaghorn(
      gn,
      h,
      p.branchDepth,
      p.branchSpread * p.spread,
      this.segs,
    );
    // LOD: drop the outermost branch levels while the coral is small on screen
    const maxLevel = this.detail < 0.25 ? 1 : this.detail < 0.55 ? 2 : 4;
    const pulse = polypPulse(this.t, gn.phase, p.polypPulse);

    const bg = pick("body");
    const dg = pick("detail");
    const rg = pick("rim");
    const sg = pick("shade");
    for (let i = 0; i < n; i++) {
      const s = this.segs[i];
      if (s.level > maxLevel) continue;
      const dx = s.x1 - s.x0;
      const dy = s.y1 - s.y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dy / len;
      const ny = -dx / len;
      bg.moveTo(
        this.X(s.x0 + nx * s.w0, s.y0 + ny * s.w0),
        this.Y(s.y0 + ny * s.w0),
      );
      bg.lineTo(
        this.X(s.x0 - nx * s.w0, s.y0 - ny * s.w0),
        this.Y(s.y0 - ny * s.w0),
      );
      bg.lineTo(
        this.X(s.x1 - nx * s.w1, s.y1 - ny * s.w1),
        this.Y(s.y1 - ny * s.w1),
      );
      bg.lineTo(
        this.X(s.x1 + nx * s.w1, s.y1 + ny * s.w1),
        this.Y(s.y1 + ny * s.w1),
      );
      bg.closePath();
      bg.fill({ color: this.cBody, alpha: a });

      // a bud at every branch end (or where the LOD cut the branch short)
      if (s.tip || s.level === maxLevel) {
        dg.circle(
          this.X(s.x1, s.y1),
          this.Y(s.y1),
          s.w1 * 1.3 * (0.9 + 0.1 * pulse),
        );
        dg.fill({ color: this.cTip, alpha: a * (0.5 + 0.1 * pulse) });
      }

      // sunlit edge of the trunks and first forks
      if (s.level <= 1 && p.rim > 0.01) {
        const side = nx * this.litSide >= 0 ? 1 : -1;
        rg.moveTo(
          this.X(s.x0 + nx * s.w0 * side, s.y0 + ny * s.w0 * side),
          this.Y(s.y0 + ny * s.w0 * side),
        );
        rg.lineTo(
          this.X(s.x1 + nx * s.w1 * side, s.y1 + ny * s.w1 * side),
          this.Y(s.y1 + ny * s.w1 * side),
        );
        rg.stroke({
          width: Math.max(0.8, h * 0.012),
          color: this.cRim,
          alpha: a * 0.28 * p.rim,
        });
      }

      // form shadow: the lower half of each trunk, in the dark of the reef
      if (s.level === 0) {
        const mx = (s.x0 + s.x1) * 0.5;
        const my = (s.y0 + s.y1) * 0.5;
        const wm = (s.w0 + s.w1) * 0.5;
        sg.moveTo(
          this.X(s.x0 + nx * s.w0, s.y0 + ny * s.w0),
          this.Y(s.y0 + ny * s.w0),
        );
        sg.lineTo(
          this.X(s.x0 - nx * s.w0, s.y0 - ny * s.w0),
          this.Y(s.y0 - ny * s.w0),
        );
        sg.lineTo(this.X(mx - nx * wm, my - ny * wm), this.Y(my - ny * wm));
        sg.lineTo(this.X(mx + nx * wm, my + ny * wm), this.Y(my + ny * wm));
        sg.closePath();
        sg.fill({ color: this.cShade, alpha: a * 0.35 });
      }
    }
  }

  // ---------- Brain coral ----------
  // A filled boulder dome, contour grooves nested inside it, a sunlit
  // shoulder on the side facing the sun. It is rock: the current never moves
  // it, only the polyps in the grooves stir.
  private brain(
    pick: (s: CoralSection) => Graphics,
    gn: Genome,
    p: CoralParams,
  ): void {
    const h = this.h;
    const a = this.alpha;
    const w = h * 0.62 * gn.spread * p.spread;
    const H = h * 0.9;

    const bg = pick("body");
    const N = 24;
    let m = 0;
    for (let i = 0; i <= N; i++) {
      const ang = -Math.PI / 2 + (i / N) * Math.PI;
      const r = domeRadius(ang, gn);
      this.put(m++, Math.sin(ang) * w * r, Math.max(0, Math.cos(ang) * H * r));
    }
    drawBlob(bg, this.pts, m);
    bg.fill({ color: this.cBody, alpha: a * 0.95 });

    // form shadow: a dark crescent where the dome meets the rock
    const sg = pick("shade");
    sg.moveTo(this.X(-w * 0.98, 0), this.Y(0));
    sg.quadraticCurveTo(
      this.X(0, h * 0.24),
      this.Y(h * 0.24),
      this.X(w * 0.98, 0),
      this.Y(0),
    );
    sg.closePath();
    sg.fill({ color: this.cShade, alpha: a * 0.32 });

    // grooves — arcs nested inside the dome, following its curve
    if (this.detail > 0.03) {
      const dg = pick("detail");
      const n = grooveCount(gn, this.detail);
      for (let i = 1; i <= n; i++) {
        const f = 1 - i / (n + 1);
        const wob = Math.sin(i * 2.3 + gn.jitter * 6.28) * 0.06;
        dg.moveTo(this.X(-w * f, h * 0.1), this.Y(h * 0.1));
        dg.quadraticCurveTo(
          this.X(wob * w, h * (0.3 + 0.62 * f)),
          this.Y(h * (0.3 + 0.62 * f)),
          this.X(w * f, h * 0.1),
          this.Y(h * 0.1),
        );
      }
      dg.stroke({
        width: Math.max(1, h * 0.018),
        color: BLACK,
        alpha: a * 0.2 * this.detail,
      });

      // polyps sitting in the outermost groove, stirring
      if (this.detail > 0.5) {
        const pg = pick("polyps");
        const f = 1 - 1 / (n + 1);
        const k = polypPulse(this.t, gn.phase, p.polypPulse);
        const cnt = Math.round(6 * p.polypDensity);
        for (let i = 0; i < cnt; i++) {
          const s = (i + 0.5) / cnt;
          // point on the quadratic groove at parameter s
          const u = 1 - s;
          const fx = u * u * -w * f + s * s * w * f;
          const fy =
            u * u * h * 0.1 +
            2 * u * s * h * (0.3 + 0.62 * f) +
            s * s * h * 0.1;
          pg.circle(this.X(fx, fy), this.Y(fy), h * 0.014 * (0.8 + 0.2 * k));
        }
        pg.fill({
          color: this.cSoft,
          alpha: a * 0.4 * (this.detail - 0.5) * 2,
        });
      }
    }

    // sunlit shoulder, on the sun's side only
    if (p.rim > 0.01) {
      const rg = pick("rim");
      const S = 8;
      let b = 0;
      for (let i = 0; i <= S; i++) {
        const ang = this.litSide * (1.25 - (i / S) * 1.1);
        const r = domeRadius(ang, gn) * 0.975;
        this.put(b++, Math.sin(ang) * w * r, Math.cos(ang) * H * r);
      }
      drawRibbon(rg, this.pts, b);
      rg.stroke({
        width: Math.max(1, h * 0.03),
        color: this.cRim,
        alpha: a * 0.22 * p.rim,
      });
    }
  }

  // ---------- Tube sponges ----------
  // A clump of tapered tubes with dark mouths and bright lips. Each mouth
  // breathes on its own phase — never shut, so a tube always reads as a tube.
  private tubes(
    pick: (s: CoralSection) => Graphics,
    gn: Genome,
    p: CoralParams,
  ): void {
    const h = this.h;
    const a = this.alpha;
    const t = this.t;
    const n = tubeCount(gn);
    const bg = pick("body");
    const sg = pick("shade");
    const dg = pick("detail");
    const rg = pick("rim");
    const pg = pick("polyps");
    for (let i = 0; i < n; i++) {
      const tb = tubeAt(gn, i, n, h * p.spread, this.tube);
      const th = tb.th;
      const { bx, tx, r0, r1 } = tb;
      bg.moveTo(this.X(bx - r0, 0), this.Y(0));
      bg.quadraticCurveTo(
        this.X(bx - r0 * 1.1, th * 0.55),
        this.Y(th * 0.55),
        this.X(tx - r1, th),
        this.Y(th),
      );
      bg.quadraticCurveTo(
        this.X(tx, th + r1 * 1.8),
        this.Y(th + r1 * 1.8),
        this.X(tx + r1, th),
        this.Y(th),
      );
      bg.quadraticCurveTo(
        this.X(bx + r0 * 1.1, th * 0.55),
        this.Y(th * 0.55),
        this.X(bx + r0, 0),
        this.Y(0),
      );
      bg.closePath();
      bg.fill({ color: this.cBody, alpha: a });

      // form shadow up the foot of the tube
      sg.moveTo(this.X(bx - r0, 0), this.Y(0));
      sg.lineTo(this.X(bx - r0 * 1.05, th * 0.28), this.Y(th * 0.28));
      sg.lineTo(this.X(bx + r0 * 1.05, th * 0.28), this.Y(th * 0.28));
      sg.lineTo(this.X(bx + r0, 0), this.Y(0));
      sg.closePath();
      sg.fill({ color: this.cShade, alpha: a * 0.4 });

      // the mouth, opening and closing slowly
      const br = breathe(t, tb.ph, p.polypPulse);
      dg.ellipse(this.X(tx, th), this.Y(th), r1 * 0.78, r1 * 0.36 * br);
      dg.fill({ color: this.cDark, alpha: a });

      // a bright lip so each tube reads separately
      if (p.rim > 0.01) {
        rg.ellipse(
          this.X(tx, th - r1 * 0.5),
          this.Y(th - r1 * 0.5),
          r1 * 0.9,
          r1 * 0.4,
        );
        rg.stroke({
          width: Math.max(1, h * 0.014),
          color: this.cTip,
          alpha: a * 0.5 * Math.min(1, p.rim),
        });
      }

      // a few pores up the sunlit flank
      if (this.detail > 0.4) {
        const cnt = Math.round(3 * p.polypDensity);
        for (let k = 0; k < cnt; k++) {
          const f = 0.35 + (k / Math.max(1, cnt)) * 0.45;
          const fx = bx + (tx - bx) * f + this.litSide * r0 * 0.55;
          pg.circle(this.X(fx, th * f), this.Y(th * f), h * 0.012);
        }
        pg.fill({ color: this.cDark, alpha: a * 0.5 * (this.detail - 0.4) });
      }
    }
  }

  // ---------- Sea whip ----------
  // Tall thin strands studded with polyps. The most mobile growth on the reef:
  // it bends with the patch current and each strand adds its own wave, so a
  // clump of three never moves as one.
  private whip(
    pick: (s: CoralSection) => Graphics,
    gn: Genome,
    p: CoralParams,
  ): void {
    const h = this.h;
    const a = this.alpha;
    const t = this.t;
    const bg = pick("body");
    const sg = pick("shade");
    const pg = pick("polyps");
    const rg = pick("rim");
    const STEP = 7;
    const pulse = polypPulse(t, gn.phase, p.polypPulse);
    for (let i = 0; i < 3; i++) {
      const s = (i - 1) * 0.5;
      const bx = s * h * 0.14 * gn.spread * p.spread;
      const H = h * (1.1 + 0.16 * i);
      const wave = h * 0.14 * Math.min(1.5, 0.35 + 0.65 * p.sway);
      // per-strand wave inputs, parked on the instance so the helpers below
      // need no closure per strand
      this.wBx = bx;
      this.wWave = wave;
      this.wPh = t * 1.5 * p.currentSpeed + gn.phase + i * 1.7;
      let m = 0;
      for (let k = 0; k <= STEP; k++) {
        const f = k / STEP;
        this.put(m++, this.bend(f) - this.rib(f), f * H);
      }
      for (let k = STEP; k >= 0; k--) {
        const f = k / STEP;
        this.put(m++, this.bend(f) + this.rib(f), f * H);
      }
      drawBlob(bg, this.pts, m);
      bg.fill({ color: this.cBody, alpha: a * 0.92 });

      // form shadow: the root fifth of the strand
      sg.moveTo(this.X(this.bend(0) - this.rib(0), 0), this.Y(0));
      sg.lineTo(
        this.X(this.bend(0.2) - this.rib(0.2), 0.2 * H),
        this.Y(0.2 * H),
      );
      sg.lineTo(
        this.X(this.bend(0.2) + this.rib(0.2), 0.2 * H),
        this.Y(0.2 * H),
      );
      sg.lineTo(this.X(this.bend(0) + this.rib(0), 0), this.Y(0));
      sg.closePath();
      sg.fill({ color: this.cShade, alpha: a * 0.45 });

      // polyps, pulsing; thinned by the density dial
      if (this.detail > 0.05) {
        for (let k = 1; k < STEP; k++) {
          if (
            hash01(k * 31 + i * 7 + Math.round(gn.tone * 100)) > p.polypDensity
          )
            continue;
          const f = k / STEP;
          pg.circle(
            this.X(this.bend(f), f * H),
            this.Y(f * H),
            h * 0.028 * (0.75 + 0.25 * pulse),
          );
        }
        pg.fill({ color: this.cTip, alpha: a * 0.45 * this.detail });
      }

      // a bright thread up the sunlit side of the upper strand
      if (p.rim > 0.01 && this.detail > 0.2) {
        let b = 0;
        for (let k = 2; k <= STEP; k++) {
          const f = k / STEP;
          this.put(
            b++,
            this.bend(f) + this.litSide * this.rib(f) * 0.55,
            f * H,
          );
        }
        drawRibbon(rg, this.pts, b);
        rg.stroke({
          width: Math.max(0.7, h * 0.008),
          color: this.cRim,
          alpha: a * 0.3 * p.rim * this.detail,
        });
      }
    }
  }

  /** whip strand centre-line x at height fraction `f` (see `whip`) */
  private wBx = 0;
  private wWave = 0;
  private wPh = 0;
  private bend(f: number): number {
    return this.wBx + Math.sin(f * 2.6 + this.wPh) * this.wWave * f;
  }
  /** whip strand half-width at height fraction `f` */
  private rib(f: number): number {
    return this.h * 0.022 * (1 - f * 0.7);
  }

  // ---------- Anemone ----------
  // A squat soft column under an oral disc ringed with short tentacles, each
  // wobbling on its own phase. The column leans with the current; the
  // tentacles are the living part and go in the polyps section.
  private anemone(
    pick: (s: CoralSection) => Graphics,
    gn: Genome,
    p: CoralParams,
  ): void {
    const h = this.h;
    const a = this.alpha;
    const t = this.t;
    const cw = h * 0.26 * gn.spread * p.spread;
    const dw = h * 0.34 * gn.spread * p.spread;
    const top = h * 0.44;

    // column
    const bg = pick("body");
    let m = 0;
    this.put(m++, -cw, 0);
    this.put(m++, -cw * 1.08, top * 0.55);
    this.put(m++, -dw, top);
    this.put(m++, 0, top * 1.04);
    this.put(m++, dw, top);
    this.put(m++, cw * 1.08, top * 0.55);
    this.put(m++, cw, 0);
    this.put(m++, 0, -h * 0.01);
    drawBlob(bg, this.pts, m);
    bg.fill({ color: this.cBody, alpha: a * 0.96 });

    // form shadow: the lower third of the column
    const sg = pick("shade");
    sg.moveTo(this.X(-cw, 0), this.Y(0));
    sg.lineTo(this.X(-cw * 1.04, top * 0.33), this.Y(top * 0.33));
    sg.lineTo(this.X(cw * 1.04, top * 0.33), this.Y(top * 0.33));
    sg.lineTo(this.X(cw, 0), this.Y(0));
    sg.closePath();
    sg.fill({ color: this.cShade, alpha: a * 0.4 });

    // oral disc + mouth, breathing
    const dg = pick("detail");
    dg.ellipse(this.X(0, top), this.Y(top), dw * 0.92, h * 0.065);
    dg.fill({ color: this.cSoft, alpha: a * 0.9 });
    const br = breathe(t, gn.phase, p.polypPulse);
    dg.ellipse(this.X(0, top), this.Y(top), dw * 0.28, h * 0.022 * br);
    dg.fill({ color: this.cDark, alpha: a * 0.9 });

    // tentacles: tapered ribbons off the disc rim, wobbling independently
    const pg = pick("polyps");
    const n = Math.max(
      4,
      Math.round(tentacleCount(gn) * Math.min(1.4, p.polypDensity)),
    );
    const wobble =
      Math.min(1.6, p.polypPulse) * (0.4 + 0.6 * Math.min(1, p.sway + 0.2));
    for (let i = 0; i < n; i++) {
      const tc = tentacleAt(gn, i, n, h * p.spread, t, wobble, this.tent);
      const dx = Math.sin(tc.ang);
      const dy = Math.cos(tc.ang);
      const tipx = tc.x + dx * tc.len;
      const tipy = tc.y + dy * tc.len;
      // the control point bows the tentacle outward, so it curls rather than
      // pokes
      const cxp =
        tc.x + dx * tc.len * 0.45 - dy * tc.len * 0.18 * Math.sign(tc.x || 1);
      const cyp = tc.y + dy * tc.len * 0.55;
      const nx = dy * tc.w;
      const ny = -dx * tc.w;
      pg.moveTo(this.X(tc.x + nx, tc.y + ny), this.Y(tc.y + ny));
      pg.quadraticCurveTo(
        this.X(cxp + nx * 0.5, cyp + ny * 0.5),
        this.Y(cyp + ny * 0.5),
        this.X(tipx, tipy),
        this.Y(tipy),
      );
      pg.quadraticCurveTo(
        this.X(cxp - nx * 0.5, cyp - ny * 0.5),
        this.Y(cyp - ny * 0.5),
        this.X(tc.x - nx, tc.y - ny),
        this.Y(tc.y - ny),
      );
      pg.closePath();
    }
    pg.fill({ color: this.cSoft, alpha: a * 0.92 });
    if (this.detail > 0.3) {
      for (let i = 0; i < n; i++) {
        const tc = tentacleAt(gn, i, n, h * p.spread, t, wobble, this.tent);
        const tipx = tc.x + Math.sin(tc.ang) * tc.len;
        const tipy = tc.y + Math.cos(tc.ang) * tc.len;
        pg.circle(this.X(tipx, tipy), this.Y(tipy), tc.w * 0.7);
      }
      pg.fill({ color: this.cTip, alpha: a * 0.6 * this.detail });
    }

    // sunlit edge of the column
    if (p.rim > 0.01) {
      const rg = pick("rim");
      const s = this.litSide;
      rg.moveTo(this.X(s * cw * 0.96, h * 0.03), this.Y(h * 0.03));
      rg.quadraticCurveTo(
        this.X(s * cw * 1.06, top * 0.55),
        this.Y(top * 0.55),
        this.X(s * dw * 0.92, top * 0.96),
        this.Y(top * 0.96),
      );
      rg.stroke({
        width: Math.max(1, h * 0.02),
        color: this.cRim,
        alpha: a * 0.28 * p.rim,
      });
    }
  }

  // ---------- Table coral ----------
  // A stem under a flat plate with a scalloped rim — reads instantly in
  // silhouette. The underside is in shadow; small fingers grow up off the top
  // of the plate and sway a little in the current.
  private table(
    pick: (s: CoralSection) => Graphics,
    gn: Genome,
    p: CoralParams,
  ): void {
    const h = this.h;
    const a = this.alpha;
    const t = this.t;
    const sw = h * 0.08;
    const cy = h * 0.62;
    const pw = h * 0.85 * gn.spread * p.spread;
    const ph = h * 0.11;

    // stem
    const bg = pick("body");
    bg.moveTo(this.X(-sw, 0), this.Y(0));
    bg.lineTo(this.X(-sw * 0.8, cy), this.Y(cy));
    bg.lineTo(this.X(sw * 0.8, cy), this.Y(cy));
    bg.lineTo(this.X(sw, 0), this.Y(0));
    bg.closePath();
    bg.fill({ color: this.cBody, alpha: a });

    // plate: a scalloped ellipse
    const N = 28;
    let m = 0;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const r = plateRadius(ang, gn);
      this.put(m++, Math.cos(ang) * pw * r, cy + Math.sin(ang) * ph * r);
    }
    drawBlob(bg, this.pts, m);
    bg.fill({ color: this.cBody, alpha: a });

    // shade: the plate's underside, and the stem's lower half
    const sg = pick("shade");
    m = 0;
    for (let i = 0; i <= 14; i++) {
      const ang = Math.PI + (i / 14) * Math.PI;
      const r = plateRadius(ang, gn) * 0.97;
      this.put(m++, Math.cos(ang) * pw * r, cy + Math.sin(ang) * ph * r);
    }
    drawBlob(sg, this.pts, m);
    sg.fill({ color: this.cShade, alpha: a * 0.42 });
    sg.moveTo(this.X(-sw, 0), this.Y(0));
    sg.lineTo(this.X(-sw * 0.9, cy * 0.5), this.Y(cy * 0.5));
    sg.lineTo(this.X(sw * 0.9, cy * 0.5), this.Y(cy * 0.5));
    sg.lineTo(this.X(sw, 0), this.Y(0));
    sg.closePath();
    sg.fill({ color: this.cShade, alpha: a * 0.4 });

    // fingers up off the plate, each swaying on its own phase
    if (this.detail > 0.05) {
      const dg = pick("detail");
      const pg = pick("polyps");
      const n = fingerCount(gn, this.detail);
      for (let i = 0; i < n; i++) {
        const s = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * 0.72;
        const fx = s * pw;
        const top = cy + ph * Math.sqrt(Math.max(0, 1 - s * s)) * 0.6;
        const fh =
          h * (0.09 + 0.07 * hash01(i * 5 + Math.round(gn.tone * 300)));
        const fw = h * 0.028;
        const lean =
          Math.sin(t * 1.1 * p.currentSpeed + i * 1.3 + gn.phase) *
          fh *
          0.18 *
          p.sway;
        dg.moveTo(this.X(fx - fw, top), this.Y(top));
        dg.quadraticCurveTo(
          this.X(fx - fw * 0.6 + lean * 0.5, top + fh * 0.6),
          this.Y(top + fh * 0.6),
          this.X(fx + lean, top + fh),
          this.Y(top + fh),
        );
        dg.quadraticCurveTo(
          this.X(fx + fw * 0.6 + lean * 0.5, top + fh * 0.6),
          this.Y(top + fh * 0.6),
          this.X(fx + fw, top),
          this.Y(top),
        );
        dg.closePath();
        dg.fill({ color: this.cSoft, alpha: a * this.detail });
        if (hash01(i * 13 + Math.round(gn.jitter * 100)) <= p.polypDensity) {
          pg.circle(this.X(fx + lean, top + fh), this.Y(top + fh), fw * 0.9);
        }
      }
      pg.fill({ color: this.cTip, alpha: a * 0.55 * this.detail });
    }

    // rim light along the plate's sunlit top edge
    if (p.rim > 0.01) {
      const rg = pick("rim");
      const S = 9;
      let b = 0;
      for (let i = 0; i <= S; i++) {
        const ang = Math.PI / 2 - this.litSide * (i / S) * 1.35;
        // tucked inside the plate: the smoothed outline sits a little
        // within the sample points, so a rim on them would float off it
        const r = plateRadius(ang, gn) * 0.93;
        this.put(
          b++,
          Math.cos(ang) * pw * r,
          cy + Math.sin(ang) * ph * r * 0.78,
        );
      }
      drawRibbon(rg, this.pts, b);
      rg.stroke({
        width: Math.max(1, h * 0.022),
        color: this.cRim,
        alpha: a * 0.3 * p.rim,
      });
    }
  }
}
