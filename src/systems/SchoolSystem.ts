/** Fish schools (boids). Not food — they exist so a sonar return isn't a meal. */
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
    sc.ax = sc.x + Math.sin(t * 0.22 + sc.ph) * 520;
    sc.ay = sc.y + Math.sin(t * 0.31 + sc.ph * 2.1) * 180;
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
        a.vx += cx * 0.42 * dt + ax * 0.75 * dt + sx * 70 * dt;
        a.vy += cy * 0.42 * dt + ay * 0.75 * dt + sy * 70 * dt;
      }
      a.vx += (sc.ax - a.x) * 0.2 * dt;
      a.vy += (sc.ay - a.y) * 0.4 * dt;
      const dx = a.x - wx;
      const dy = a.y - wy;
      const d = Math.hypot(dx, dy);
      if (d < 620) {
        const p = (620 - d) / 620;
        a.vx += (dx / (d || 1)) * p * 640 * dt;
        a.vy += (dy / (d || 1)) * p * 640 * dt;
      }
      a.vx *= 1 - 1.25 * dt;
      a.vy *= 1 - 1.25 * dt;
      const sp = Math.hypot(a.vx, a.vy);
      const max = 135;
      const min = 26;
      if (sp > max) {
        a.vx = (a.vx / sp) * max;
        a.vy = (a.vy / sp) * max;
      } else if (sp < min && sp > 0.01) {
        a.vx = (a.vx / sp) * min;
        a.vy = (a.vy / sp) * min;
      }
      a.x += a.vx * dt;
      a.y += a.vy * dt;
    }
  }
}
