import type { Graphics } from "pixi.js";
import type { Camera } from "../../core/Camera";
import { clamp01, lerp, smoothstep, type Vec2 } from "../../core/math";
import { mixColor } from "../color";
import type { WhaleDrawOptions, WhaleSection, WhaleView } from "./WhaleView";

const BODY_END = 0.94;
/** hull segments per side at full detail; the point pools are sized for this */
const MAX_STEPS = 40;
/** body length (world units) the fixed feature offsets below were tuned at */
const REF_LEN = 280;
const TAU = Math.PI * 2;

/** Stylised Blue Whale girth: the real animal is 0.14 of its length tall, which
 * reads as a submarine, so the body carries a little extra. */
const GIRTH = 1.14;

/** Authentic Blue Whale body proportions — the full dorsal-to-ventral height at
 * arc position `t`. `juv` 0..1 morphs toward a calf: the head takes up more of
 * the body and is blunter, the forebody stays full, the tail tapers less. */
function profile(t: number, w: number, juv = 0): number {
  // Rostrum: a long tapering wedge that keeps a small rounded tip rather than
  // closing to a needle. Calves are blunter and their head is proportionally
  // longer, so the ramp both shortens and softens.
  const tip = 0.11 + juv * 0.07;
  const ramp = Math.pow(clamp01(t / (0.3 - juv * 0.06)), 0.62 - juv * 0.2);
  const head = tip + (1 - tip) * ramp;
  // Aft of the girth peak the body eases away quadratically — full through the
  // midbody, then a fast run-out into a slim tail stock.
  const x = clamp01((t - 0.32) / 0.62);
  const aft = 1 - (0.72 - 0.18 * juv) * x * x - 0.1 * Math.pow(x, 6);

  return w * GIRTH * head * aft;
}

/** Raised splash guard just ahead of the blowhole — the one bump that breaks
 * the dorsal line, and a big part of why a blue whale reads as a blue whale. */
function guard(t: number, w: number, juv: number): number {
  const d = (t - 0.085) / 0.05;
  return w * (0.075 - 0.03 * juv) * Math.exp(-d * d);
}

/** How much of the section's height sits above the spine. Low at the head, so
 * the rostrum runs nearly straight while the pleated throat hangs deep beneath
 * it; evening out through the body. This asymmetry is most of the silhouette. */
const topFrac = (t: number): number =>
  0.3 + 0.15 * smoothstep(0, 0.4, t) - 0.05 * smoothstep(0.55, 0.95, t);

/** spine → back */
const topHalf = (t: number, w: number, juv = 0): number =>
  profile(t, w, juv) * topFrac(t) + guard(t, w, juv);
/** spine → belly */
const botHalf = (t: number, w: number, juv = 0): number =>
  profile(t, w, juv) * (1 - topFrac(t));

/** Cross-section angle of the gape, from the rostrum tip back to the jaw
 * corner. The pale throat is bounded above by this line, so the head keeps a
 * dark rostrum instead of going white all over. */
const mouthPsi = (t: number): number => 0.26 + 1.0 * smoothstep(0, 0.17, t);

/** Lateral half-width as a fraction of the vertical half-height. A blue whale
 * is broad and flat across the head, a touch taller than wide through the
 * barrel, and strongly compressed into a blade-like tail stock — which is what
 * makes the silhouette narrow so much as it rolls edge-on. */
const latK = (t: number): number =>
  (0.99 - 0.15 * smoothstep(0.02, 0.32, t)) *
  (1 - 0.52 * smoothstep(0.45, 0.96, t));

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

/** open smooth polyline through `pts[0..count)`, for the rim / pleat strokes */
function drawRibbon(g: Graphics, pts: Vec2[], count: number): void {
  if (count < 2) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < count; i++) {
    const c = pts[i - 1];
    const d = pts[i];
    g.quadraticCurveTo(c.x, c.y, (c.x + d.x) / 2, (c.y + d.y) / 2);
  }
}

/** cheap deterministic 0..1 hash, for placing the skin mottling. `seed` gives
 * each whale in a pod its own marbling. */
function hash01(n: number, seed: number): number {
  const s = Math.sin((n + seed * 1.37) * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * `cos` of a cross-section angle that has been clipped to the visible half.
 * Angles behind the body snap to whichever silhouette edge they went round,
 * so a surface marking slides onto the outline and stops instead of leaking
 * through the far side.
 */
function cosVisible(r: number): number {
  let x = r % TAU;
  if (x < 0) x += TAU;
  if (x <= Math.PI) return Math.cos(x);
  return x < Math.PI * 1.5 ? -1 : 1;
}

export class ProceduralWhaleView implements WhaleView {
  // Pre-allocated point pools + scratch vectors — draw() touches no `new` so a
  // pod of whales at 60fps produces no per-frame garbage from the geometry.
  private readonly outline: Vec2[] = ProceduralWhaleView.pool();
  private readonly pale: Vec2[] = ProceduralWhaleView.pool();
  /** smoothed per-vertex spine tangents, rebuilt once per draw */
  private readonly tan: Vec2[] = Array.from({ length: 24 }, () => ({
    x: 1,
    y: 0,
  }));
  /** cumulative spine arc length per vertex, rebuilt once per draw */
  private readonly cum: number[] = new Array(24).fill(0);
  private readonly p: Vec2 = { x: 0, y: 0 };
  private readonly f: Vec2 = { x: 1, y: 0 };
  private readonly per: Vec2 = { x: 0, y: 0 };
  private readonly w0: Vec2 = { x: 0, y: 0 };
  private readonly w1: Vec2 = { x: 0, y: 0 };
  /** scratch band extent: `x` the top (dorsal-most) edge, `y` the bottom */
  private readonly band: Vec2 = { x: 0, y: 0 };

  // Countershade palette, rebuilt only when the skin / belly inputs change so a
  // pod sharing one skin colour costs a single `mixColor` sweep per frame.
  private ckSkin = -1;
  private ckBelly = -1;
  private cDark = 0;
  private cFin = 0;
  private cSheen = 0;
  private cShadow = 0;
  private cBlotch = 0;
  private cMid = 0;
  private cRim = 0;
  private cCrease = 0;
  private cEye = 0;

  private static pool(): Vec2[] {
    return Array.from({ length: MAX_STEPS * 2 + 8 }, () => ({ x: 0, y: 0 }));
  }

  private palette(skin: number, belly: number): void {
    if (skin === this.ckSkin && belly === this.ckBelly) return;
    this.ckSkin = skin;
    this.ckBelly = belly;
    this.cDark = mixColor(skin, 0x000000, 0.3); // far-side fins
    this.cFin = mixColor(skin, 0x000000, 0.12); // near-side fins
    this.cSheen = mixColor(skin, 0xcfe7f2, 0.34); // light from above
    this.cShadow = mixColor(skin, 0x00060f, 0.52); // form shadow underneath
    this.cBlotch = mixColor(skin, 0xa9c8d6, 0.5); // pale mottling flecks
    this.cMid = mixColor(belly, skin, 0.52); // soft countershade edge
    this.cRim = mixColor(skin, 0xffffff, 0.6);
    this.cCrease = mixColor(skin, 0x000508, 0.42); // pleats, mouth, blowhole
    this.cEye = mixColor(skin, 0x000000, 0.86);
  }

  draw(
    g: Graphics,
    sp: ReadonlyArray<Vec2>,
    opts: WhaleDrawOptions,
    cam: Camera,
  ): void {
    const { scale, facing, skin, belly, alpha } = opts;
    const width = opts.width ?? 48;
    const juv = clamp01(opts.juv ?? 0);
    const seed = opts.seed ?? 0;
    const last = sp.length - 1;
    if (last < 1) return;

    // designer hook: route a named section to its own Graphics, or the shared one
    const pick = (s: WhaleSection): Graphics => opts.layer?.(s) ?? g;

    this.palette(skin, belly);

    // --- arc-length table: `t` tracks real length, not joint index, so head
    //     and peduncle proportions hold if the spine stretches unevenly --------
    this.cum[0] = 0;
    let total = 0;
    for (let i = 1; i <= last; i++) {
      total += Math.hypot(sp[i].x - sp[i - 1].x, sp[i].y - sp[i - 1].y);
      this.cum[i] = total;
    }
    if (total < 1e-3) return;

    // --- smoothed per-vertex tangents, once per draw. A near-zero segment
    //     keeps its neighbour's tangent instead of snapping the frame to +x. ---
    for (let i = 0; i <= last; i++) {
      const a = sp[Math.max(0, i - 1)];
      const b = sp[Math.min(last, i + 1)];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const len = Math.hypot(dx, dy);
      if (len > 1e-6) {
        this.tan[i].x = dx / len;
        this.tan[i].y = dy / len;
      } else if (i > 0) {
        this.tan[i].x = this.tan[i - 1].x;
        this.tan[i].y = this.tan[i - 1].y;
      } else {
        this.tan[i].x = 1;
        this.tan[i].y = 0;
      }
    }

    const px = scale * cam.scale;
    // smooth LOD/visibility ramps so nothing pops as the camera scale drifts
    const detail = smoothstep(0.08, 0.26, px); // fins + hull resolution
    const faceDetail = smoothstep(0.24, 0.5, px); // eye, mouth, pleats
    const mottle = smoothstep(0.22, 0.48, px); // dappled skin + rim light

    // Hull resolution snaps to a few fixed tiers, so sample points don't crawl
    // as the camera scale drifts. (True hysteresis would need per-whale state;
    // this view instance is shared across the whole pod.)
    const STEPS = Math.max(
      16,
      Math.min(MAX_STEPS, Math.round((20 + 20 * detail) / 8) * 8),
    );

    // Body length in pre-`scale` units. The fixed feature offsets (flipper
    // reach, fluke span, fleck spread) were tuned at REF_LEN; `featK` keeps
    // them proportional if the measured body is a different length.
    const featK = total / scale / REF_LEN;

    // ---- roll basis -------------------------------------------------------
    // The body is modelled as an offset ellipse in cross-section, and rolling
    // it about the long axis is an honest 2D projection of that ellipse rather
    // than a pile of blend factors: `cs` / `sn` are how much of the ventral
    // axis points down-screen and how much points at the camera. `rollK` eases
    // the angle back toward level, then we renormalise so the pair stays a
    // unit vector and the projection below stays exact at every blend value.
    const roll = opts.roll ?? 0;
    const rk = clamp01(opts.rollK ?? (opts.roll != null ? 1 : 0));
    const bx = 1 + (Math.cos(roll) - 1) * rk;
    const by = Math.sin(roll) * rk;
    const bl = Math.hypot(bx, by) || 1;
    const cs = bx / bl; // ventral axis → screen-down  (1 level, -1 belly-up)
    const sn = by / bl; // ventral axis → toward camera (1 belly-on, -1 back-on)

    // --- spine frame + point projection, writing into pre-allocated vectors ---
    const frameAt = (t: number): void => {
      const target = clamp01(t) * total;
      let i = 0;
      while (i < last - 1 && this.cum[i + 1] < target) i++;
      const seg = this.cum[i + 1] - this.cum[i] || 1;
      const k = clamp01((target - this.cum[i]) / seg);
      this.p.x = sp[i].x + (sp[i + 1].x - sp[i].x) * k;
      this.p.y = sp[i].y + (sp[i + 1].y - sp[i].y) * k;
      // interpolate the smoothed vertex tangents, then renormalise, so the
      // outline offset turns continuously through each spine joint (no kinks)
      const fx = this.tan[i].x + (this.tan[i + 1].x - this.tan[i].x) * k;
      const fy = this.tan[i].y + (this.tan[i + 1].y - this.tan[i].y) * k;
      const fl = Math.hypot(fx, fy);
      if (fl > 1e-6) {
        this.f.x = fx / fl;
        this.f.y = fy / fl;
      }
      this.per.x = -this.f.y * facing;
      this.per.y = this.f.x * facing;
    };

    /** screen-space point `fwd` along the spine tangent and `prp` off it */
    const at = (t: number, fwd: number, prp: number, out: Vec2): Vec2 => {
      frameAt(t);
      const wx = this.p.x + (this.f.x * fwd + this.per.x * prp) * scale;
      const wy = this.p.y + (this.f.y * fwd + this.per.y * prp) * scale;
      out.x = cam.sx(wx);
      out.y = cam.sy(wy);
      return out;
    };

    /** screen-space point from a body-frame offset: `ven` toward the belly,
     * `lat` out the whale's side. Both are rolled by the basis above, so a fin
     * that lives out on the flank swings through the roll on its own. */
    const at3 = (
      t: number,
      fwd: number,
      ven: number,
      lat: number,
      out: Vec2,
    ): Vec2 => at(t, fwd, ven * cs - lat * sn, out);

    /** how far toward the camera a body-frame offset sits; >0 is the near side */
    const depth3 = (ven: number, lat: number): number => ven * sn + lat * cs;

    // ---- cross-section, memoised on `t` ------------------------------------
    // Callers hit the same `t` two or three times in a row (top edge, bottom
    // edge, band centre), so one slot of memo removes most of the profile work.
    let mt = NaN;
    let mA = 0; // vertical semi-axis
    let mC = 0; // ventral offset of the section centre from the spine
    let mB = 0; // lateral semi-axis
    let mR = 0; // projected half-extent once rolled
    let mD = 0; // cross-section angle that has rolled onto the near edge
    const sect = (t: number): void => {
      if (t === mt) return;
      mt = t;
      const d = topHalf(t, width, juv);
      const v = botHalf(t, width, juv);
      mA = (d + v) * 0.5;
      mC = (v - d) * 0.5;
      mB = mA * latK(t);
      mR = Math.hypot(mA * cs, mB * sn);
      mD = Math.atan2(mB * sn, mA * cs);
    };

    /** silhouette edges — exact for the rolled ellipse, so at level roll these
     * are the plain back / belly lines and edge-on they narrow to the girth */
    const edgeTop = (t: number): number => {
      sect(t);
      return mC * cs - mR;
    };
    const edgeBot = (t: number): number => {
      sect(t);
      return mC * cs + mR;
    };

    /**
     * Cross-section angle `psi`: 0 at the ventral keel, ±π/2 out on the flanks
     * (+ is the flank facing the camera at level roll), ±π at the dorsal ridge.
     * This is the anchor every surface marking uses, which is what makes the
     * belly patch, mottling, pleats and eye all roll as one body.
     */
    const prpAt = (t: number, psi: number): number => {
      sect(t);
      return mC * cs + mR * cosVisible(psi + mD);
    };
    /** how squarely that surface point faces the camera: 1 head-on, 0 at the
     * silhouette edge, negative once it has rolled round the far side */
    const faceAt = (t: number, psi: number): number => {
      sect(t);
      return Math.sin(psi + mD);
    };

    /**
     * Visible screen extent of the surface band `psi` ∈ centre ± half, clipped
     * to the silhouette. A band that has rolled fully out of sight collapses to
     * zero height on the edge it went round, so it simply stops drawing.
     */
    const bandAt = (t: number, centre: number, half: number): void => {
      sect(t);
      const w = Math.min(half, 1.5); // keep the arc under a half turn
      const lo0 = centre - w + mD;
      const lo = lo0 - TAU * Math.floor(lo0 / TAU); // → [0, 2π)
      const hi = lo + 2 * w;
      let a = Math.max(lo, 0);
      let b = Math.min(hi, Math.PI);
      if (b <= a) {
        a = Math.max(lo, TAU);
        b = Math.min(hi, TAU + Math.PI);
      }
      const mid = mC * cs;
      if (b <= a) {
        const e = mid + ((lo + hi) * 0.5 < Math.PI * 1.5 ? -mR : mR);
        this.band.x = e;
        this.band.y = e;
        return;
      }
      this.band.x = mid + mR * Math.cos(b); // top
      this.band.y = mid + mR * Math.cos(a); // bottom
    };

    // shared band extent for the shading layers below
    const lo = 0.02;
    const hi = BODY_END - 0.04;

    /** fill the screen-space region between two perpendicular offsets */
    const drawBand = (
      dg: Graphics,
      topFn: (t: number) => number,
      botFn: (t: number) => number,
      color: number,
      a: number,
      lo0: number = lo,
      hi0: number = hi,
    ): void => {
      if (a <= 0.01) return;
      let m = 0;
      for (let s = 0; s <= STEPS; s++) {
        const t = lo0 + (s / STEPS) * (hi0 - lo0);
        at(t, 0, botFn(t), this.pale[m++]);
      }
      for (let s = STEPS; s >= 0; s--) {
        const t = lo0 + (s / STEPS) * (hi0 - lo0);
        at(t, 0, topFn(t), this.pale[m++]);
      }
      drawBlob(dg, this.pale, m);
      dg.fill({ color, alpha: Math.min(1, a) });
    };

    /** fill a band that lives on the skin, so it rolls with the body */
    const drawSurfBand = (
      dg: Graphics,
      centre: (t: number) => number,
      half: (t: number) => number,
      color: number,
      a: number,
      lo0: number = lo,
      hi0: number = hi,
    ): void => {
      if (a <= 0.01) return;
      let m = 0;
      for (let s = 0; s <= STEPS; s++) {
        const t = lo0 + (s / STEPS) * (hi0 - lo0);
        bandAt(t, centre(t), half(t));
        at(t, 0, this.band.y, this.pale[m++]);
      }
      for (let s = STEPS; s >= 0; s--) {
        const t = lo0 + (s / STEPS) * (hi0 - lo0);
        bandAt(t, centre(t), half(t));
        at(t, 0, this.band.x, this.pale[m++]);
      }
      drawBlob(dg, this.pale, m);
      dg.fill({ color, alpha: Math.min(1, a) });
    };

    // ---------- Pectoral flipper ----------
    // Long, slender and pointed, rooted low on the flank behind the eye and
    // trailing down and back. There are two of them, out on either side, so
    // they are foreshortened almost to nothing at level roll and swing to their
    // full span — one up, one down — as the whale turns onto its side.
    const drawPectoral = (side: number): void => {
      if (detail <= 0.02) return;
      const near = side * cs >= 0;
      const pg = pick(near ? "nearPectoral" : "farPectoral");
      const t = 0.27;
      sect(t);
      const rootV = mC + mA * 0.1; // low on the flank, a touch below the spine
      const rootL = side * mB * 0.9;
      const outL = side * (mB * 0.9 + 32 * featK); // lateral reach of the tip
      const drop = 22 * featK; // and how far it hangs below the root
      const aft = 38 * featK; // how far back it trails
      // a hair of perspective, so the near flipper isn't a pixel-exact copy of
      // the far one when the pair overlaps at level roll
      const q = 1 + 0.05 * (depth3(rootV, rootL) / Math.max(1, mA));

      /** a point on the blade: `u` out along the span, `fwd` its chord offset.
       * Keeping the span and the chord as separate axes is what lets the
       * flipper read as a blade at level roll (span foreshortened, chord not)
       * and as its full slender self once the whale rolls onto its side. */
      const pec = (u: number, fwd: number, out: Vec2): Vec2 =>
        at3(
          t,
          (-aft * u + fwd) * q,
          rootV + drop * u * q,
          rootL + (outL - rootL) * u * q,
          out,
        );

      const rfX = pec(0, 13 * featK, this.w0).x;
      const rfY = this.w0.y;
      const rbX = pec(0, -13 * featK, this.w0).x;
      const rbY = this.w0.y;
      const tipX = pec(1, 0, this.w0).x;
      const tipY = this.w0.y;

      pg.moveTo(rfX, rfY);
      pec(0.52, 5 * featK, this.w0); // leading edge, gently convex
      pg.quadraticCurveTo(this.w0.x, this.w0.y, tipX, tipY);
      pec(0.55, -13 * featK, this.w0); // trailing edge, gently concave
      pg.quadraticCurveTo(this.w0.x, this.w0.y, rbX, rbY);
      pec(0, -2 * featK, this.w0); // root fillet
      pg.quadraticCurveTo(this.w0.x, this.w0.y, rfX, rfY);
      pg.closePath();
      // the underside is pale, so a flipper seen from below lightens
      const under = clamp01(sn) * 0.42;
      pg.fill({
        color: mixColor(near ? this.cFin : this.cDark, belly, under),
        alpha: alpha * (near ? 1 : 0.9) * smoothstep(0.02, 0.35, detail),
      });
    };

    // ---------- Dorsal fin ----------
    // Small, blunt and falcate, set three-quarters of the way back. It is a
    // blade in the whale's mid-plane, so it stands tall at level roll, vanishes
    // into the body edge-on, and hangs the other way once the whale is inverted.
    const drawDorsal = (): void => {
      const near = sn < 0; // the back is the side facing the camera
      const dg = pick(near ? "dorsal" : "farDorsal");
      const t = 0.74;
      sect(t);
      const h = (mA * 0.5 + 3 * featK) * (1 - 0.22 * juv);
      // roots a hair inside the back, so the blade grows out of the body
      const base = (mC - mA) * 0.94;
      const frX = at3(t + 0.035, 0, base, 0, this.w0).x;
      const frY = this.w0.y;
      const bkX = at3(t - 0.055, 0, base, 0, this.w0).x;
      const bkY = this.w0.y;
      // the tip is swept well aft of the root — a falcate hook, not a triangle
      const tpX = at3(t - 0.05, -9 * featK, base - h, 0, this.w0).x;
      const tpY = this.w0.y;

      dg.moveTo(frX, frY);
      at3(t + 0.015, 1 * featK, base - h * 0.62, 0, this.w0); // convex leading
      dg.quadraticCurveTo(this.w0.x, this.w0.y, tpX, tpY);
      at3(t - 0.05, -6 * featK, base - h * 0.34, 0, this.w0); // concave trailing
      dg.quadraticCurveTo(this.w0.x, this.w0.y, bkX, bkY);
      at3(t - 0.01, 0, base * 0.55, 0, this.w0);
      dg.quadraticCurveTo(this.w0.x, this.w0.y, frX, frY);
      dg.closePath();
      dg.fill({ color: near ? this.cFin : this.cDark, alpha });
    };

    if (cs >= 0) {
      drawPectoral(-1);
    } else {
      drawPectoral(1);
    }
    if (sn >= 0) drawDorsal(); // the fin has rolled behind the body

    // ---------- Fluke ----------
    // The blades lie in the whale's horizontal plane, so from the side they are
    // seen almost edge-on — a slim swept blade — and open to their full span as
    // the whale rolls. The tips droop a little and the whole tail pitches with
    // the stroke, which is what keeps an edge-on fluke from reading as flat.
    {
      const fg = pick("fluke");
      const rootT = BODY_END;
      sect(rootT);
      const span = 34 * featK;
      const sweep = 18 * featK;
      const droop = 5 * featK; // tips trailing below the plane
      // Seen from dead abeam the blades would foreshorten to a hairline. Hold a
      // floor under the span projection so the tail always reads as a tail —
      // the one deliberate cheat in the roll, and the amount a real fluke shows
      // anyway once you are a few degrees off its plane.
      const SPREAD = 0.36;
      const snF = sn >= 0 ? Math.max(sn, SPREAD) : Math.min(sn, -SPREAD);

      // Angle of attack from the pose itself: how far the tail stock bows off
      // the chord through it. It peaks at the ends of each stroke, so the blade
      // flashes its face on every beat without any extra state to carry.
      frameAt(rootT);
      const jA = sp[last];
      const jB = sp[Math.max(0, last - 2)];
      const jC = sp[Math.max(0, last - 4)];
      const chl = Math.hypot(jA.x - jC.x, jA.y - jC.y) || 1;
      const bow =
        ((jB.x - jC.x) * this.per.x + (jB.y - jC.y) * this.per.y) / chl;
      const pitch = -clamp01(Math.abs(bow) * 1.9) * Math.sign(bow) * 0.5;
      const cp = Math.cos(pitch);
      const spn = Math.sin(pitch);
      /** one fluke point: `lat` out the span, `fwd`/`ven` in the pitched chord */
      const fluke = (fwd: number, ven: number, lat: number): Vec2 => {
        const v = ven + droop * Math.abs(lat / span);
        const fw = fwd * cp + v * spn;
        const vn = v * cp - fwd * spn;
        return at(rootT, fw, vn * cs - lat * snF, this.w0);
      };

      const rx = fluke(2 * featK, 0, 0).x;
      const ry = this.w0.y;
      fluke(-sweep, 0, -span);
      const topX = this.w0.x;
      const topY = this.w0.y;
      fluke(-sweep * 0.3, 0, 0);
      const notchX = this.w0.x;
      const notchY = this.w0.y;
      fluke(-sweep, 0, span);
      const botX = this.w0.x;
      const botY = this.w0.y;

      fg.moveTo(rx, ry);
      fluke(3 * featK, 0, -span * 0.6); // leading edge, root → tip
      fg.quadraticCurveTo(this.w0.x, this.w0.y, topX, topY);
      fluke(-sweep * 1.35, 0, -span * 0.36); // concave trailing edge
      fg.quadraticCurveTo(this.w0.x, this.w0.y, notchX, notchY);
      fluke(-sweep * 1.35, 0, span * 0.36);
      fg.quadraticCurveTo(this.w0.x, this.w0.y, botX, botY);
      fluke(3 * featK, 0, span * 0.6);
      fg.quadraticCurveTo(this.w0.x, this.w0.y, rx, ry);
      fg.closePath();
      // the flukes' undersides are pale like the belly
      fg.fill({
        color: mixColor(this.cFin, belly, clamp01(sn) * 0.32),
        alpha,
      });
    }

    // ---------- Main body hull ----------
    // Wound as one loop: top edge aft, bottom edge forward, then the head cap.
    // (The cap points come last so the outline never crosses itself at the
    // rostrum, which would confuse earcut and notch the snout.)
    {
      const hg = pick("hull");
      let n = 0;
      for (let s = 1; s <= STEPS; s++) {
        const t = (s / STEPS) * BODY_END;
        at(t, 0, edgeTop(t), this.outline[n++]);
      }
      for (let s = STEPS; s >= 1; s--) {
        const t = (s / STEPS) * BODY_END;
        at(t, 0, edgeBot(t), this.outline[n++]);
      }
      at(0.01, 0, edgeBot(0.01), this.outline[n++]);
      at(0, 1, 0, this.outline[n++]);
      at(0.01, 0, edgeTop(0.01), this.outline[n++]);
      drawBlob(hg, this.outline, n);
      hg.fill({ color: skin, alpha });
    }

    // ---------- Pale belly countershading ----------
    // Pigment, not light: the pale patch is painted on the skin around the
    // ventral keel and rides higher up the flanks through the throat. Because
    // it is anchored to cross-section angles it wraps the whole body as the
    // whale rolls belly-on, slides to the upper flank past a half roll, and
    // disappears entirely when the back comes round — all from one band.
    {
      const bg = pick("belly");
      // How high up the flank the pale reaches: highest at the pleated throat,
      // settling to the lower third along the body and running out before the
      // tail stock. Over the head it can never cross the gape.
      const reach = (t: number): number =>
        Math.min(
          (1.1 + 0.3 * smoothstep(0.42, 0.08, t)) *
            (1 - 0.8 * smoothstep(0.6, 0.9, t)),
          mouthPsi(t),
        );
      drawSurfBand(
        bg,
        () => 0,
        (t) => Math.min(reach(t) + 0.22, mouthPsi(t) + 0.1),
        this.cMid,
        alpha * 0.5,
      );
      drawSurfBand(bg, () => 0, reach, belly, alpha * 0.95);
    }

    // ---------- Ventral pleats ----------
    // The throat grooves. They fan out of the chin and run back to the navel,
    // and they are the fastest read that this is a rorqual.
    if (faceDetail > 0.05) {
      const pg = pick("pleats");
      const t0 = 0.03;
      const t1 = 0.36;
      const lines = 3 + Math.round(5 * faceDetail);
      for (let j = 0; j < lines; j++) {
        const psi = (0.16 + (j + 0.6) * (0.82 / lines)) * (1 - 0.1 * juv);
        for (let s2 = 0; s2 < 2; s2++) {
          const ps = s2 ? -psi : psi;
          const vis = clamp01(faceAt((t0 + t1) * 0.5, ps) * 1.4);
          if (vis <= 0.03) continue;
          let m = 0;
          const PS = 7;
          for (let s = 0; s <= PS; s++) {
            const t = t0 + (s / PS) * (t1 - t0);
            // the grooves converge at the chin and fade out at the navel
            const k =
              smoothstep(0.02, 0.15, t) * (1 - 0.3 * smoothstep(0.24, 0.36, t));
            at(t, 0, prpAt(t, ps * k), this.pale[m++]);
          }
          drawRibbon(pg, this.pale, m);
          pg.stroke({
            width: Math.max(0.6, 0.9 * px),
            color: this.cCrease,
            alpha: alpha * 0.22 * vis * faceDetail,
          });
        }
      }
    }

    // ---------- Dappled skin mottling ----------
    // Scattered pale flecks across the back — the blue whale's signature
    // marbling. Each fleck is pinned to a spot on the skin, so it slides round
    // the body with the roll and fades out as it reaches the silhouette.
    if (mottle > 0.02) {
      const mg = pick("mottle");
      const flecks = 5 + Math.round(11 * mottle);
      for (let k = 0; k < flecks; k++) {
        const r1 = hash01(k + 0.5, seed);
        const r2 = hash01(k * 2.7 + 1.3, seed);
        const r3 = hash01(k * 4.1 + 5.9, seed);
        const t = 0.1 + r1 * 0.78;
        // spread over the upper two-thirds of the girth, both flanks
        const psi = (0.34 + 0.66 * r2) * Math.PI * (r3 < 0.5 ? 1 : -1);
        const vis = faceAt(t, psi);
        if (vis <= 0.02) continue;
        at(t, (r3 - 0.5) * 14 * featK, prpAt(t, psi), this.w0);
        mg.circle(
          this.w0.x,
          this.w0.y,
          (1.5 + r3 * 3.6) * px * (0.4 + 0.6 * vis),
        );
        mg.fill({
          color: this.cBlotch,
          // fade each fleck in with the mottle ramp instead of popping on
          alpha:
            alpha *
            mottle *
            clamp01(11 * mottle - k) *
            vis *
            (0.14 + 0.17 * r2),
        });
      }
    }

    // ---------- Light from above ----------
    // Screen-space, not body-space: the sun stays overhead however the whale is
    // turned, so this wash keeps sitting on whichever surface is uppermost. Two
    // stacked tiers make a cheap gradient without a shader.
    {
      const sg = pick("sheen");
      const tiers = mottle > 0.4 ? 3 : 1;
      for (let i = 0; i < tiers; i++) {
        const d = 0.52 - i * 0.17; // how far down the body this tier reaches
        drawBand(
          sg,
          (t) => edgeTop(t) * 0.995,
          (t) => lerp(edgeTop(t), edgeBot(t), d),
          this.cSheen,
          alpha * (i === 0 ? 0.3 : 0.2) * (i === 0 ? 1 : mottle),
        );
      }
    }

    // ---------- Form shadow underneath ----------
    {
      const dg = pick("shade");
      const tiers = mottle > 0.4 ? 2 : 1;
      for (let i = 0; i < tiers; i++) {
        const d = 0.7 + i * 0.16;
        drawBand(
          dg,
          (t) => lerp(edgeTop(t), edgeBot(t), d),
          (t) => edgeBot(t) * 0.995,
          this.cShadow,
          alpha * (i === 0 ? 0.26 : 0.2) * (i === 0 ? 1 : mottle),
        );
      }
    }

    if (sn < 0) drawDorsal(); // the back is toward us, so the fin is in front
    if (cs >= 0) {
      drawPectoral(1);
    } else {
      drawPectoral(-1);
    }

    // ---------- Rim light ----------
    // A bright line along the top of the body and a darker one underneath, to
    // lift the silhouette off the water. Both follow the screen edges, so they
    // stay put through a roll.
    if (mottle > 0.03) {
      const rg = pick("rim");
      const RS = 14;
      let b = 0;
      for (let s = 0; s <= RS; s++) {
        const t = 0.035 + (s / RS) * 0.66;
        at(t, 0, edgeTop(t) * 0.96, this.outline[b++]);
      }
      drawRibbon(rg, this.outline, b);
      rg.stroke({
        width: Math.max(0.8, 1.4 * px),
        color: this.cRim,
        alpha: alpha * 0.4 * mottle,
      });

      b = 0;
      for (let s = 0; s <= RS; s++) {
        const t = 0.06 + (s / RS) * 0.8;
        at(t, 0, edgeBot(t) * 0.97, this.outline[b++]);
      }
      drawRibbon(rg, this.outline, b);
      rg.stroke({
        width: Math.max(0.7, 1.1 * px),
        color: this.cShadow,
        alpha: alpha * 0.3 * mottle,
      });
    }

    // ---------- Eye, mouth line & blowhole ----------
    // All three are pinned to the skin like the mottling, so they mirror onto
    // whichever flank is facing the camera and slip out of sight on their own.
    if (faceDetail > 0.02) {
      const fcg = pick("face");
      const eyeT = 0.215;
      const jawT = 0.2;

      for (let s2 = 0; s2 < 2; s2++) {
        const side = s2 ? -1 : 1;
        const vis = clamp01(faceAt(eyeT, side * 1.16) * 1.5);
        if (vis <= 0.03) continue;
        const fk = faceDetail * vis;

        // the long gape: out of the rostrum tip, back and down to the jaw
        // corner just ahead of the eye
        let m = 0;
        const MS = 8;
        for (let s = 0; s <= MS; s++) {
          const t = 0.004 + (s / MS) * (jawT - 0.004);
          const psi = side * mouthPsi(t);
          at(t, 0, prpAt(t, psi), this.pale[m++]);
        }
        drawRibbon(fcg, this.pale, m);
        fcg.stroke({
          width: Math.max(0.7, 1.15 * px),
          color: this.cCrease,
          alpha: alpha * 0.6 * fk,
        });

        // eye, low and just behind the corner of the mouth
        at(eyeT, -1.5 * featK, prpAt(eyeT, side * 1.16), this.w0);
        const er = Math.max(1.1, 1.9 * px);
        fcg.circle(this.w0.x, this.w0.y, er);
        fcg.fill({ color: this.cEye, alpha: alpha * fk });
        if (px > 0.8) {
          fcg.circle(this.w0.x - er * 0.3, this.w0.y - er * 0.3, er * 0.34);
          fcg.fill({ color: 0xdfeef5, alpha: alpha * fk * 0.65 });
        }
      }

      // blowhole, a paired slit on the dorsal ridge behind the splash guard.
      // It sits exactly on the top edge at level roll, which is where you see
      // it from the side, so it stays legible until the belly comes round.
      const blowT = 0.115;
      const bvis = clamp01(0.6 + faceAt(blowT, Math.PI));
      if (bvis > 0.03) {
        at(blowT, 2.5 * featK, prpAt(blowT, Math.PI) * 0.99, this.w0);
        at(blowT, -3.5 * featK, prpAt(blowT, Math.PI) * 0.99, this.w1);
        fcg.moveTo(this.w0.x, this.w0.y);
        fcg.lineTo(this.w1.x, this.w1.y);
        fcg.stroke({
          width: Math.max(0.9, 1.8 * px),
          color: this.cCrease,
          alpha: alpha * 0.7 * bvis * faceDetail,
        });
      }
    }
  }
}
