/**
 * Krill swarms: differential rotation, diel vertical migration, and balling-up
 * when the whale charges them. Only swarms near the camera are stepped.
 */
import { clamp } from "../core/math";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import type { Swarm } from "../state/Fauna";

export class KrillSystem implements System {
  readonly name = "krill";

  update(dt: number, ctx: GameContext): void {
    const { krill, camera, clock, whale } = ctx;
    for (const s of krill.swarms) {
      s.lit *= Math.exp(-dt / 4.2);
      if (Math.abs(s.x - camera.x) < 7000)
        this.step(s, dt, clock.t, whale.x, whale.y);
    }
  }

  private step(s: Swarm, dt: number, t: number, wx: number, wy: number): void {
    const dw = Math.hypot(wx - s.x, wy - s.y);
    const near = dw < s.r + 900;
    s.panic = near
      ? Math.min(1, s.panic + dt * 1.6)
      : Math.max(0, s.panic - dt * 0.7);
    s.y = s.baseY + Math.sin(t * 0.055 + s.ph) * 430; // diel migration
    s.x += Math.sin(t * 0.09 + s.ph * 1.7) * 6 * dt;
    s.r = s.r0 * (1 - 0.32 * s.panic);
    for (const p of s.parts) {
      const inner = 1 - p.r / (s.r0 + 1);
      p.a += s.spin * (0.22 + 0.75 * inner) * dt;
      p.r += Math.sin(t * 1.3 + p.ph) * 5 * dt;
      p.r = clamp(p.r, 6, s.r);
      const x = s.x + Math.cos(p.a) * p.r;
      const y = s.y + Math.sin(p.a) * p.r * 0.62;
      const dx = x - wx;
      const dy = y - wy;
      const d = Math.hypot(dx, dy);
      if (d < 320) {
        const push = (320 - d) / 320;
        p.kx += (dx / (d || 1)) * push * 260 * dt;
        p.ky += (dy / (d || 1)) * push * 260 * dt;
      }
      p.kx *= 1 - 1.8 * dt;
      p.ky *= 1 - 1.8 * dt;
      p.px = x + p.kx;
      p.py = y + p.ky;
    }
  }
}
