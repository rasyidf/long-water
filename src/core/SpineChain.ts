/**
 * A swimmer's backbone: a fixed-length joint chain that tail-chases a head
 * position, with a bending-relaxation pass so kinks resolve like a real body.
 *
 * The rigid `base` chain is the physical spine. `applyUndulation` derives a
 * *display* copy with the swimming wave layered on; the wave is never fed back
 * into `base`, so it can't accumulate into the chain's own shape.
 *
 * Shared verbatim by the player whale and every pod whale — see `SpineSystem`.
 */
import type { Vec2 } from "./math";

export const SPINE_JOINTS = 16;

export function makeChain(x: number, y: number, spacing = 18): Vec2[] {
  const c: Vec2[] = [];
  for (let i = 0; i < SPINE_JOINTS; i++) c.push({ x: x - i * spacing, y });
  return c;
}

/** Constrain `base` so each joint sits `len/(n-1)` from the one ahead, head at (headX,headY). */
export function chaseChain(
  base: Vec2[],
  headX: number,
  headY: number,
  len: number,
): void {
  const n = base.length;
  const seg = len / (n - 1);
  const satisfy = () => {
    base[0].x = headX;
    base[0].y = headY;
    for (let i = 1; i < n; i++) {
      const dx = base[i].x - base[i - 1].x;
      const dy = base[i].y - base[i - 1].y;
      const d = Math.hypot(dx, dy) || 1;
      base[i].x = base[i - 1].x + (dx / d) * seg;
      base[i].y = base[i - 1].y + (dy / d) * seg;
    }
  };
  satisfy();
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 1; i < n - 1; i++) {
      const mx = (base[i - 1].x + base[i + 1].x) / 2;
      const my = (base[i - 1].y + base[i + 1].y) / 2;
      base[i].x += (mx - base[i].x) * 0.5;
      base[i].y += (my - base[i].y) * 0.5;
    }
    satisfy();
  }
}

/** Write a swimming-wave copy of `base` into `out` (same length). */
export function applyUndulation(
  out: Vec2[],
  base: Vec2[],
  wagPhase: number,
  strokeAmp: number,
): void {
  const n = base.length;
  for (let i = 0; i < n; i++) {
    out[i].x = base[i].x;
    out[i].y = base[i].y;
  }

  for (let i = 1; i < n; i++) {
    const t = i / (n - 1);
    
    // SMOOTHER TANGENT: Look ahead and behind, rather than just behind
    const prev = base[i - 1];
    const next = i < n - 1 ? base[i + 1] : base[i]; // tail cap
    
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const d = Math.hypot(dx, dy) || 1;
    
    const rear = Math.max(0, (t - 0.34) / 0.66);
    const off = Math.sin(wagPhase - i * 0.62) * strokeAmp * Math.pow(rear, 1.7);
    
    // Apply normal
    out[i].x += (-dy / d) * off;
    out[i].y += (dx / d) * off;
  }
}

export function strokeAmpFor(speed: number): number {
  return Math.max(3, Math.min(11, 3 + speed * 0.045));
}
