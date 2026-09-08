/** Bubble pool. Listens for `fx:bubbles`; integrates and culls each frame. */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

function range(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export class ParticleSystem implements System {
  readonly name = "particles";

  init(ctx: GameContext): void {
    ctx.bus.on("fx:bubbles", (e) => {
      const spread = e.spread ?? 0;
      for (let i = 0; i < e.count; i++)
        ctx.particles.bubbles.push({
          x: e.x + (spread ? range(-spread, spread) : 0),
          y: e.y,
          vx: e.splash ? range(-190, 190) : range(-40, 40),
          vy: e.splash ? range(-440, -40) : range(-120, -30),
          life: e.splash ? range(0.4, 1.5) : range(0.6, 1.4),
          r: e.splash ? range(2, 8) : range(1, 3),
          splash: e.splash,
        });
    });
    ctx.bus.on("game:restart", () => (ctx.particles.bubbles.length = 0));
  }

  update(dt: number, ctx: GameContext): void {
    const b = ctx.particles.bubbles;
    for (let i = b.length - 1; i >= 0; i--) {
      const p = b[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.splash ? 900 * dt : -40 * dt;
      p.life -= dt;
      if (p.life <= 0 || p.y > 4200) b.splice(i, 1);
    }
  }
}
