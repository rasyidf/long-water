/** Fish schools (boids). Not food — they exist so a sonar return isn't a meal.
 *
 * Open-water schools roam a wandering anchor and scatter radially when the
 * whale charges through. Reef schools (those with a `home` coral anchor)
 * instead take cover: as the whale bears down they abandon their wander, pull
 * tight, and pour back into the coral cluster, only spilling out again once the
 * threat has passed. */
import { clamp01 } from "../core/math";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import type { School } from "../state/Fauna";

export class SchoolSystem implements System {
  readonly name = "school";

  update(dt: number, ctx: GameContext): void {
    const { schools, camera, clock, whale } = ctx;
    for (const sc of schools.schools) {
      sc.lit *= Math.exp(-dt / 3.4);
      if (Math.abs(sc.x - camera.x) < 5000)
        this.step(sc, dt, clock.t, whale.x, whale.y);
    }
  }

  private step(
    sc: School,
    dt: number,
    t: number,
    wx: number,
    wy: number,
  ): void {
    const reef = sc.homeX !== undefined && sc.homeY !== undefined;
    let wander = 1;

    if (reef) {
      const hx = sc.homeX as number;
      const hy = sc.homeY as number;
      const dToWhale = Math.hypot(wx - hx, wy - hy);
      const threat = clamp01((1500 - dToWhale) / 1500);
      // takes cover fast, drifts back out slowly
      const rate = threat > sc.shelter ? 2.6 : 0.9;
      sc.shelter += (threat - sc.shelter) * Math.min(1, dt * rate);
      // the roaming centre collapses onto the coral as the school hunkers
      const pull = Math.min(1, dt * (0.4 + 2.4 * sc.shelter));
      sc.x += (hx - sc.x) * pull;
      sc.y += (hy - sc.y) * pull;
      wander = 1 - 0.85 * sc.shelter;
    }

    sc.ax = sc.x + Math.sin(t * 0.22 + sc.ph) * 520 * wander;
    sc.ay = sc.y + Math.sin(t * 0.31 + sc.ph * 2.1) * 180 * wander;

    const shelter = reef ? sc.shelter : 0;
    const cohesion = 0.42 * (1 + 2.4 * shelter); // ball up in cover
    const flee = reef ? 640 * (1 - 0.72 * shelter) : 640; // hide, don't bolt
    const maxSp = 135 - 78 * shelter;
    const minSp = 26 * (1 - 0.85 * shelter);

    const F = sc.fish;
    for (let i = 0; i < F.length; i++) {
      const a = F[i];
      let sx = 0;
      let sy = 0;
      let ax = 0;
      let ay = 0;
      let cx = 0;
      let cy = 0;
      let n = 0;
      for (let j = 0; j < F.length; j++) {
        if (i === j) continue;
        const b = F[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 90000) continue;
        n++;
        cx += b.x;
        cy += b.y;
        ax += b.vx;
        ay += b.vy;
        if (d2 < 2600) {
          const d = Math.sqrt(d2) || 1;
          sx -= dx / d;
          sy -= dy / d;
        }
      }
      if (n) {
        cx = cx / n - a.x;
        cy = cy / n - a.y;
        ax = ax / n - a.vx;
        ay = ay / n - a.vy;
        a.vx += cx * cohesion * dt + ax * 0.75 * dt + sx * 70 * dt;
        a.vy += cy * cohesion * dt + ay * 0.75 * dt + sy * 70 * dt;
      }
      a.vx += (sc.ax - a.x) * 0.2 * dt;
      a.vy += (sc.ay - a.y) * 0.4 * dt;

      if (reef && shelter > 0.05) {
        // stream back toward the coral itself, not just the wander anchor
        a.vx += ((sc.homeX as number) - a.x) * 0.9 * shelter * dt;
        a.vy += ((sc.homeY as number) - a.y) * 0.9 * shelter * dt;
      }

      const dx = a.x - wx;
      const dy = a.y - wy;
      const d = Math.hypot(dx, dy);
      if (d < 620) {
        const p = (620 - d) / 620;
        a.vx += (dx / (d || 1)) * p * flee * dt;
        a.vy += (dy / (d || 1)) * p * flee * dt;
      }
      a.vx *= 1 - 1.25 * dt;
      a.vy *= 1 - 1.25 * dt;
      const sp = Math.hypot(a.vx, a.vy);
      if (sp > maxSp) {
        a.vx = (a.vx / sp) * maxSp;
        a.vy = (a.vy / sp) * maxSp;
      } else if (sp < minSp && sp > 0.01) {
        a.vx = (a.vx / sp) * minSp;
        a.vy = (a.vy / sp) * minSp;
      }
      a.x += a.vx * dt;
      a.y += a.vy * dt;
    }
  }
}
