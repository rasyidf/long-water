/**
 * Pure body geometry for the procedural blue whale — no Pixi, no camera, no
 * per-frame state. `ProceduralWhaleView` builds its outline and skin markings
 * from these; the split keeps the shape math unit-testable (see
 * `geometry.test.ts`) and independent of the renderer.
 */
import { clamp01, smoothstep } from "../../core/math";

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
