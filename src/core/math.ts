/** Small pure helpers shared across systems. No engine or state dependencies. */

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Framerate-independent approach: eases `cur` toward `target`, closing the
 * remaining gap at rate `hz` (larger = snappier). Stable for any `dt`, unlike
 * the `cur += (target - cur) * k` form which overshoots once `k > 1`.
 */
export function expApproach(
  cur: number,
  target: number,
  hz: number,
  dt: number,
): number {
  return target + (cur - target) * Math.exp(-hz * dt);
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Hermite ease between edges `a` and `b`; 0 below `a`, 1 above `b`. */
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a || 1));
  return t * t * (3 - 2 * t);
}

/** Deterministic pseudo-random in [0,1) from an integer key. Stable per key, so
 * it's safe to derive per-object visual jitter (shaft width, drift phase…). */
export function hash01(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Rotate a velocity toward a desired velocity no faster than `maxRadPerSec`.
 * Below ~8 u/s the heading is undefined and a free pivot is allowed — this is
 * what gives every swimmer the turn radius of a large animal.
 */
export function clampTurn(
  oldVx: number,
  oldVy: number,
  newVx: number,
  newVy: number,
  maxRadPerSec: number,
  dt: number,
): Vec2 {
  const oldSp = Math.hypot(oldVx, oldVy);
  const newSp = Math.hypot(newVx, newVy);
  if (oldSp < 8 || newSp < 8) return { x: newVx, y: newVy };
  const oldH = Math.atan2(oldVy, oldVx);
  const newH = Math.atan2(newVy, newVx);
  const diff = ((newH - oldH + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const step = maxRadPerSec * dt;
  if (Math.abs(diff) <= step) return { x: newVx, y: newVy };
  const h = oldH + (diff > 0 ? step : -step);
  return { x: Math.cos(h) * newSp, y: Math.sin(h) * newSp };
}
