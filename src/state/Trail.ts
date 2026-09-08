/**
 * The player whale's own swum path. Pod whales steer toward points sampled from
 * it (never trace it — see `PodSystem`). The front stretch is low-passed so it
 * can't carry a corner sharper than a real body could turn through.
 */
import type { Vec2 } from "../core/math";

export class Trail {
  readonly points: Vec2[] = [];

  constructor(x: number, y: number, count = 700, spacing = 3.5) {
    for (let i = 0; i < count; i++) this.points.push({ x: x - i * spacing, y });
  }

  /** collapse the path to a straight stub behind (x, y) — used after a load */
  reset(x: number, y: number, count = 700, spacing = 3.5): void {
    this.points.length = 0;
    for (let i = 0; i < count; i++) this.points.push({ x: x - i * spacing, y });
  }

  push(x: number, y: number): void {
    const h = this.points[0];
    if (Math.hypot(x - h.x, y - h.y) > 3.5) this.points.unshift({ x, y });
    else {
      h.x = x;
      h.y = y;
    }
    if (this.points.length > 900) this.points.pop();
    this.smoothFront(90);
  }

  private smoothFront(n: number): void {
    const tr = this.points;
    const end = Math.min(n, tr.length - 2);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = end; i >= 1; i--) {
        tr[i].x = tr[i - 1].x * 0.25 + tr[i].x * 0.5 + tr[i + 1].x * 0.25;
        tr[i].y = tr[i - 1].y * 0.25 + tr[i].y * 0.5 + tr[i + 1].y * 0.25;
      }
      tr[0].x = tr[0].x * 0.7 + tr[1].x * 0.3;
      tr[0].y = tr[0].y * 0.7 + tr[1].y * 0.3;
    }
  }

  /** point `dist` world units back along the path */
  sample(dist: number): Vec2 {
    const tr = this.points;
    let acc = 0;
    for (let i = 1; i < tr.length; i++) {
      const dx = tr[i].x - tr[i - 1].x;
      const dy = tr[i].y - tr[i - 1].y;
      const d = Math.hypot(dx, dy);
      if (acc + d >= dist) {
        const f = (dist - acc) / d;
        return { x: tr[i - 1].x + dx * f, y: tr[i - 1].y + dy * f };
      }
      acc += d;
    }
    const last = tr[tr.length - 1];
    const prev = tr[tr.length - 2] ?? last;
    const dx = last.x - prev.x;
    const dy = last.y - prev.y;
    const d = Math.hypot(dx, dy) || 1;
    return {
      x: last.x + (dx / d) * (dist - acc),
      y: last.y + (dy / d) * (dist - acc),
    };
  }

  /** anchor point `dist` back, offset `side` units perpendicular to the wake */
  pointBeside(dist: number, side: number): Vec2 {
    const p = this.sample(dist);
    const q = this.sample(dist + 50);
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: p.x + (-dy / d) * side, y: p.y + (dx / d) * side };
  }
}
