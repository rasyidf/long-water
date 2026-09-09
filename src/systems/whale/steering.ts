/**
 * Small reusable steering primitives for whale brains. Each returns a velocity
 * or force contribution; the brain sums them into a desired velocity and hands
 * the result to `stepLocomotion` as a force.
 */
import type { Vec2 } from "../../core/math";

/** desired velocity of magnitude `speed` pointing from `(fx,fy)` to `(tx,ty)` */
export function seekVel(
  fx: number,
  fy: number,
  tx: number,
  ty: number,
  speed: number,
  out: Vec2,
): Vec2 {
  const dx = tx - fx;
  const dy = ty - fy;
  const d = Math.hypot(dx, dy) || 1;
  out.x = (dx / d) * speed;
  out.y = (dy / d) * speed;
  return out;
}

/** speed to seek an anchor `dist` away: proportional, clamped to `[min, max]` */
export function arriveSpeed(
  dist: number,
  gain: number,
  min: number,
  max: number,
): number {
  return Math.max(min, Math.min(max, dist * gain));
}

/**
 * Sum of short-range pushes away from `others` closer than `radius`.
 * Accumulates into `out` (does not clear it).
 */
export function separation(
  x: number,
  y: number,
  others: ReadonlyArray<{ x: number; y: number }>,
  radius: number,
  push: number,
  out: Vec2,
): Vec2 {
  for (const o of others) {
    const ox = x - o.x;
    const oy = y - o.y;
    const od = Math.hypot(ox, oy);
    if (od > 0.001 && od < radius) {
      const p = (radius - od) / radius;
      out.x += (ox / od) * p * push;
      out.y += (oy / od) * p * push;
    }
  }
  return out;
}
