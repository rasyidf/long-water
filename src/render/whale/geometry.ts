/**
 * Pure body geometry for the procedural blue whale — no Pixi, no camera, no
 * per-frame state. `ProceduralWhaleView` builds its outline and skin markings
 * from these; the split keeps the shape math unit-testable (see
 * `geometry.test.ts`) and independent of the renderer.
 */
import { clamp01, smoothstep, type Vec2 } from "../../core/math";

export const TAU = Math.PI * 2;
/** arc position where the body ends and the tail stock hands off to the fluke */
export const BODY_END = 0.94;

/** Stylised Blue Whale girth: the real animal is 0.14 of its length tall, which
 * reads as a submarine, so the body carries a little extra. */
export const GIRTH = 1.14;

/** Authentic Blue Whale body proportions — the full dorsal-to-ventral height at
 * arc position `t`. `juv` 0..1 morphs toward a calf: the head takes up more of
 * the body and is blunter, the forebody stays full, the tail tapers less. */
export function profile(t: number, w: number, juv = 0): number {
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
export function guard(t: number, w: number, juv: number): number {
  const d = (t - 0.085) / 0.05;
  return w * (0.075 - 0.03 * juv) * Math.exp(-d * d);
}

/** How much of the section's height sits above the spine. Low at the head, so
 * the rostrum runs nearly straight while the pleated throat hangs deep beneath
 * it; evening out through the body. This asymmetry is most of the silhouette. */
export const topFrac = (t: number): number =>
  0.3 + 0.15 * smoothstep(0, 0.4, t) - 0.05 * smoothstep(0.55, 0.95, t);

/** spine → back */
export const topHalf = (t: number, w: number, juv = 0): number =>
  profile(t, w, juv) * topFrac(t) + guard(t, w, juv);
/** spine → belly */
export const botHalf = (t: number, w: number, juv = 0): number =>
  profile(t, w, juv) * (1 - topFrac(t));

/** Cross-section angle of the gape, from the rostrum tip back to the jaw
 * corner. The pale throat is bounded above by this line, so the head keeps a
 * dark rostrum instead of going white all over. */
export const mouthPsi = (t: number): number =>
  0.26 + 1.0 * smoothstep(0, 0.17, t);

/** Lateral half-width as a fraction of the vertical half-height. A blue whale
 * is broad and flat across the head, a touch taller than wide through the
 * barrel, and strongly compressed into a blade-like tail stock — which is what
 * makes the silhouette narrow so much as it rolls edge-on. */
export const latK = (t: number): number =>
  (0.99 - 0.15 * smoothstep(0.02, 0.32, t)) *
  (1 - 0.52 * smoothstep(0.45, 0.96, t));

/**
 * `cos` of a cross-section angle that has been clipped to the visible half.
 * Angles behind the body snap to whichever silhouette edge they went round,
 * so a surface marking slides onto the outline and stops instead of leaking
 * through the far side.
 */
export function cosVisible(r: number): number {
  let x = r % TAU;
  if (x < 0) x += TAU;
  if (x <= Math.PI) return Math.cos(x);
  return x < Math.PI * 1.5 ? -1 : 1;
}

/** cheap deterministic 0..1 hash, for placing the skin mottling. `seed` gives
 * each whale in a pod its own marbling. */
export function hash01(n: number, seed: number): number {
  const s = Math.sin((n + seed * 1.37) * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Barrel-roll basis. The body is an offset ellipse in cross-section, and
 * rolling it about the long axis is an honest 2D projection of that ellipse
 * rather than a pile of blend factors. `rollK` eases the angle back toward
 * level; the pair is then renormalised to a unit vector so the projection stays
 * exact at every blend value. Written into `out` to keep the caller allocation-
 * free per frame.
 */
export interface RollBasis {
  /** ventral axis → screen-down: 1 level, 0 edge-on, -1 belly-up */
  cs: number;
  /** ventral axis → toward camera: 1 belly-on, -1 back-on */
  sn: number;
}

export function rollBasis(
  roll: number,
  rollK: number,
  out: RollBasis,
): RollBasis {
  const rk = clamp01(rollK);
  const bx = 1 + (Math.cos(roll) - 1) * rk;
  const by = Math.sin(roll) * rk;
  const bl = Math.hypot(bx, by) || 1;
  out.cs = bx / bl;
  out.sn = by / bl;
  return out;
}

/**
 * Cumulative arc length per spine vertex, index-aligned with `sp` and written
 * into the caller's `cum` array so a pod of whales produces no per-frame
 * garbage. Returns the total body length.
 */
export function buildArcLength(
  sp: ReadonlyArray<Vec2>,
  cum: number[],
  last: number,
): number {
  cum[0] = 0;
  let total = 0;
  for (let i = 1; i <= last; i++) {
    total += Math.hypot(sp[i].x - sp[i - 1].x, sp[i].y - sp[i - 1].y);
    cum[i] = total;
  }
  return total;
}

/**
 * Smoothed per-vertex spine tangents, written into `tan`. Averaging each
 * vertex's neighbours removes the kink a piecewise-constant tangent leaves at
 * every spine joint. A degenerate segment (two spine points collapsed
 * together) keeps the previous vertex's tangent instead of snapping to +x.
 */
export function buildTangents(
  sp: ReadonlyArray<Vec2>,
  tan: Vec2[],
  last: number,
): void {
  for (let i = 0; i <= last; i++) {
    const a = sp[Math.max(0, i - 1)];
    const b = sp[Math.min(last, i + 1)];
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      tan[i].x = dx / len;
      tan[i].y = dy / len;
    } else if (i > 0) {
      tan[i].x = tan[i - 1].x;
      tan[i].y = tan[i - 1].y;
    } else {
      tan[i].x = 1;
      tan[i].y = 0;
    }
  }
}

/**
 * Interpolated spine position + unit tangent/perpendicular at arc position
 * `t` ∈ [0,1], walking a pointer through the (monotonic) arc-length table
 * rather than a binary search. Written into the three `out` vectors so the
 * caller stays allocation-free. `fOut` is left untouched (keeping whatever it
 * held from the previous call) if the interpolated tangent is degenerate.
 */
export function spineFrameAt(
  sp: ReadonlyArray<Vec2>,
  cum: ReadonlyArray<number>,
  tan: ReadonlyArray<Vec2>,
  total: number,
  last: number,
  t: number,
  facing: number,
  pOut: Vec2,
  fOut: Vec2,
  perOut: Vec2,
): void {
  const target = clamp01(t) * total;
  let i = 0;
  while (i < last - 1 && cum[i + 1] < target) i++;
  const seg = cum[i + 1] - cum[i] || 1;
  const k = clamp01((target - cum[i]) / seg);
  pOut.x = sp[i].x + (sp[i + 1].x - sp[i].x) * k;
  pOut.y = sp[i].y + (sp[i + 1].y - sp[i].y) * k;
  const fx = tan[i].x + (tan[i + 1].x - tan[i].x) * k;
  const fy = tan[i].y + (tan[i + 1].y - tan[i].y) * k;
  const fl = Math.hypot(fx, fy);
  if (fl > 1e-6) {
    fOut.x = fx / fl;
    fOut.y = fy / fl;
  }
  perOut.x = -fOut.y * facing;
  perOut.y = fOut.x * facing;
}

/**
 * World-space point offset `fwd` along the spine tangent `f` and `prp` along
 * its perpendicular `per`, scaled by `scale` and added to the spine position
 * `p`. Pure counterpart of `ProceduralWhaleView`'s screen-space `at()`
 * helper — camera projection happens after this, in the view.
 */
export function bodyPoint(
  p: Vec2,
  f: Vec2,
  per: Vec2,
  fwd: number,
  prp: number,
  scale: number,
  out: Vec2,
): Vec2 {
  out.x = p.x + (f.x * fwd + per.x * prp) * scale;
  out.y = p.y + (f.y * fwd + per.y * prp) * scale;
  return out;
}

/**
 * Body cross-section at arc position `t`: an offset ellipse with vertical
 * semi-axis `A`, ventral centre offset `C`, lateral semi-axis `B`, plus the
 * projected half-extent `R` and cross-section angle `D` once rolled onto the
 * near silhouette edge by the basis `cs`/`sn` (see `rollBasis`). Written into
 * `out` so a caller can memoize on `t` without allocating.
 */
export interface Section {
  A: number;
  C: number;
  B: number;
  R: number;
  D: number;
}

export function computeSection(
  t: number,
  width: number,
  juv: number,
  cs: number,
  sn: number,
  out: Section,
): Section {
  const d = topHalf(t, width, juv);
  const v = botHalf(t, width, juv);
  out.A = (d + v) * 0.5;
  out.C = (v - d) * 0.5;
  out.B = out.A * latK(t);
  out.R = Math.hypot(out.A * cs, out.B * sn);
  out.D = Math.atan2(out.B * sn, out.A * cs);
  return out;
}

/** silhouette edges — exact for the rolled ellipse, so at level roll these
 * are the plain back / belly lines and edge-on they narrow to the girth */
export const edgeTop = (sec: Section, cs: number): number => sec.C * cs - sec.R;
export const edgeBot = (sec: Section, cs: number): number => sec.C * cs + sec.R;

/**
 * Cross-section angle `psi`: 0 at the ventral keel, ±π/2 out on the flanks
 * (+ is the flank facing the camera at level roll), ±π at the dorsal ridge.
 * This is the anchor every surface marking uses, which is what makes the
 * belly patch, mottling, pleats and eye all roll as one body.
 */
export const prpAt = (sec: Section, cs: number, psi: number): number =>
  sec.C * cs + sec.R * cosVisible(psi + sec.D);

/** how squarely that surface point faces the camera: 1 head-on, 0 at the
 * silhouette edge, negative once it has rolled round the far side */
export const faceAt = (sec: Section, psi: number): number =>
  Math.sin(psi + sec.D);

/**
 * Visible screen extent of the surface band `psi` ∈ centre ± half, clipped
 * to the silhouette. A band that has rolled fully out of sight collapses to
 * zero height on the edge it went round, so it simply stops drawing. Writes
 * the top/bottom offsets into `out.x`/`out.y`.
 */
export function bandAt(
  sec: Section,
  cs: number,
  centre: number,
  half: number,
  out: Vec2,
): Vec2 {
  const w = Math.min(half, 1.5); // keep the arc under a half turn
  const lo0 = centre - w + sec.D;
  const lo = lo0 - TAU * Math.floor(lo0 / TAU); // → [0, 2π)
  const hi = lo + 2 * w;
  let a = Math.max(lo, 0);
  let b = Math.min(hi, Math.PI);
  if (b <= a) {
    a = Math.max(lo, TAU);
    b = Math.min(hi, TAU + Math.PI);
  }
  const mid = sec.C * cs;
  if (b <= a) {
    const e = mid + ((lo + hi) * 0.5 < Math.PI * 1.5 ? -sec.R : sec.R);
    out.x = e;
    out.y = e;
    return out;
  }
  out.x = mid + sec.R * Math.cos(b); // top
  out.y = mid + sec.R * Math.cos(a); // bottom
  return out;
}

/**
 * Hull silhouette outline in world space, wound as one loop: top edge aft,
 * bottom edge forward, then the head cap. The cap points come last so the
 * outline never crosses itself at the rostrum — an earlier bug closed the cap
 * before the top/bottom edges met, which crossed the closing segment and
 * notched the snout (see `geometry.test.ts` for the self-intersection check).
 * Spine-frame and cross-section scratch (`p`/`f`/`per`/`sec`) are
 * caller-provided so this stays allocation-free; the point count written into
 * `out` is returned.
 */
export function buildHullOutline(
  sp: ReadonlyArray<Vec2>,
  cum: ReadonlyArray<number>,
  tan: ReadonlyArray<Vec2>,
  total: number,
  last: number,
  facing: number,
  scale: number,
  width: number,
  juv: number,
  cs: number,
  sn: number,
  steps: number,
  p: Vec2,
  f: Vec2,
  per: Vec2,
  sec: Section,
  out: Vec2[],
): number {
  let n = 0;
  const emit = (t: number, fwd: number, prp: number): void => {
    spineFrameAt(sp, cum, tan, total, last, t, facing, p, f, per);
    bodyPoint(p, f, per, fwd, prp, scale, out[n++]);
  };
  const edge = (t: number, top: boolean): void => {
    computeSection(t, width, juv, cs, sn, sec);
    emit(t, 0, top ? edgeTop(sec, cs) : edgeBot(sec, cs));
  };
  for (let s = 1; s <= steps; s++) edge((s / steps) * BODY_END, true);
  for (let s = steps; s >= 1; s--) edge((s / steps) * BODY_END, false);
  edge(0.01, false);
  emit(0, 1, 0);
  edge(0.01, true);
  return n;
}

/**
 * One fin/fluke outline point in the form the view's `at(t, fwd, prp, out)`
 * projector already expects — `prp` has the roll basis (`ven*cs - lat*sn`)
 * baked in, so the caller doesn't need `at3`/`depth3` at all.
 */
export interface FinPoint {
  t: number;
  fwd: number;
  prp: number;
}

/**
 * Pectoral flipper blade, six points wound as one closed quadratic loop:
 * root, leading-edge control, tip, trailing-edge control, root-back,
 * root-fillet control (back to the root). Rooted low on the flank at a fixed
 * `t`; `side` is ±1 for which side of the body. The blade lives on its own
 * span/chord axes — span foreshortens at level roll, chord doesn't — which is
 * what lets it read as a blade edge-on and its full slender self rolled onto
 * its side.
 */
export function pectoralAnchors(
  sec: Section,
  t: number,
  side: number,
  cs: number,
  sn: number,
  featK: number,
  out: FinPoint[],
): void {
  const rootV = sec.C + sec.A * 0.1; // low on the flank, a touch below the spine
  const rootL = side * sec.B * 0.9;
  const outL = side * (sec.B * 0.9 + 32 * featK); // lateral reach of the tip
  const drop = 22 * featK; // and how far it hangs below the root
  const aft = 38 * featK; // how far back it trails
  // a hair of perspective, so the near flipper isn't a pixel-exact copy of
  // the far one when the pair overlaps at level roll
  const q = 1 + 0.05 * ((rootV * sn + rootL * cs) / Math.max(1, sec.A));

  const pec = (i: number, u: number, fwd: number): void => {
    const ven = rootV + drop * u * q;
    const lat = rootL + (outL - rootL) * u * q;
    out[i].t = t;
    out[i].fwd = (-aft * u + fwd) * q;
    out[i].prp = ven * cs - lat * sn;
  };

  pec(0, 0, 13 * featK); // root front
  pec(1, 0.52, 5 * featK); // leading edge, gently convex
  pec(2, 1, 0); // tip
  pec(3, 0.55, -13 * featK); // trailing edge, gently concave
  pec(4, 0, -13 * featK); // root back
  pec(5, 0, -2 * featK); // root fillet
}

/**
 * Dorsal fin blade, six points wound the same way as `pectoralAnchors`.
 * Lives in the whale's mid-plane (`lat` is always 0), a blade set three-
 * quarters of the way back and swept aft into a falcate hook. `sec` is the
 * cross-section at the fin's root `t`; the points themselves sit at small
 * `t` offsets fore/aft of it.
 */
export function dorsalAnchors(
  sec: Section,
  t: number,
  juv: number,
  cs: number,
  featK: number,
  out: FinPoint[],
): void {
  const h = (sec.A * 0.5 + 3 * featK) * (1 - 0.22 * juv);
  // roots a hair inside the back, so the blade grows out of the body
  const base = (sec.C - sec.A) * 0.94;

  const pt = (i: number, dt: number, fwd: number, ven: number): void => {
    out[i].t = t + dt;
    out[i].fwd = fwd;
    out[i].prp = ven * cs;
  };

  pt(0, 0.035, 0, base); // front root
  pt(1, 0.015, 1 * featK, base - h * 0.62); // convex leading
  pt(2, -0.05, -9 * featK, base - h); // tip, swept well aft — a falcate hook
  pt(3, -0.05, -6 * featK, base - h * 0.34); // concave trailing
  pt(4, -0.055, 0, base); // back root
  pt(5, -0.01, 0, base * 0.55); // closing fillet
}

/**
 * Angle of attack the fluke pitches to, from the pose itself: how far the
 * tail stock bows off the chord through it (`jA`/`jB`/`jC`, the last three
 * spine samples, `per` the perpendicular at the fluke root). Peaks at the
 * ends of each stroke, so the blade flashes its face on every beat without
 * any extra state to carry.
 */
export function flukePitch(per: Vec2, jA: Vec2, jB: Vec2, jC: Vec2): number {
  const chl = Math.hypot(jA.x - jC.x, jA.y - jC.y) || 1;
  const bow = ((jB.x - jC.x) * per.x + (jB.y - jC.y) * per.y) / chl;
  return -clamp01(Math.abs(bow) * 1.9) * Math.sign(bow) * 0.5;
}

/**
 * Fluke, eight points wound as one closed quadratic loop: root, then two
 * blades either side of a centre notch, each with its own leading-edge
 * control. The blades lie in the whale's horizontal plane, so from the side
 * they are seen almost edge-on; `SPREAD` floors the span projection so an
 * edge-on tail still reads as a tail (the one deliberate cheat in the roll).
 * `pitch` (see `flukePitch`) tips the whole blade with the stroke, and
 * `droop` trails the tips below the plane.
 */
export function flukeAnchors(
  t: number,
  cs: number,
  sn: number,
  pitch: number,
  featK: number,
  out: FinPoint[],
): void {
  const span = 34 * featK;
  const sweep = 18 * featK;
  const droop = 5 * featK; // tips trailing below the plane
  const SPREAD = 0.36;
  const snF = sn >= 0 ? Math.max(sn, SPREAD) : Math.min(sn, -SPREAD);
  const cp = Math.cos(pitch);
  const spn = Math.sin(pitch);

  const pt = (i: number, fwd: number, ven: number, lat: number): void => {
    const v = ven + droop * Math.abs(lat / span);
    out[i].t = t;
    out[i].fwd = fwd * cp + v * spn;
    out[i].prp = (v * cp - fwd * spn) * cs - lat * snF;
  };

  pt(0, 2 * featK, 0, 0); // root
  pt(1, 3 * featK, 0, -span * 0.6); // leading edge, root → near tip
  pt(2, -sweep, 0, -span); // near tip
  pt(3, -sweep * 1.35, 0, -span * 0.36); // concave trailing edge → notch
  pt(4, -sweep * 0.3, 0, 0); // centre notch
  pt(5, -sweep * 1.35, 0, span * 0.36); // concave trailing edge → far tip
  pt(6, -sweep, 0, span); // far tip
  pt(7, 3 * featK, 0, span * 0.6); // leading edge, far tip → root
}
