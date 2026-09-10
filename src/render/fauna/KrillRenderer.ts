/** Krill swarms — amber motes, one GPU-instanced `Particle` per part. The
 * swarm dynamics (rotation, diel migration, panic balling) run in `KrillSystem`;
 * this renderer only projects `part.px/py` to the screen and fades each swarm
 * by depth light. The additive sonar-glow pass for krill is in `GlowRenderer`. */
import { Particle, Texture } from "pixi.js";
import { C } from "../../config/constants";
import { lightAt } from "../../core/light";
import type { GameContext } from "../../core/GameContext";
import type { System } from "../../core/System";

/** screen-space size of a krill mote, matching the old `Graphics` square */
const DOT = 2.3;

export class KrillRenderer implements System {
  readonly name = "render:krill";

  /** particles grouped by swarm, parallel to `ctx.krill.swarms` and its parts */
  private bySwarm: Particle[][] = [];

  init(ctx: GameContext): void {
    const layer = ctx.layers.krill;
    for (const s of ctx.krill.swarms) {
      const row: Particle[] = [];
      for (let i = 0; i < s.parts.length; i++) {
        const p = new Particle({
          texture: Texture.WHITE,
          scaleX: DOT,
          scaleY: DOT,
          tint: C.krill,
          alpha: 0,
        });
        layer.addParticle(p);
        row.push(p);
      }
      this.bySwarm.push(row);
    }
  }

  render(ctx: GameContext): void {
    const { camera: cam, krill } = ctx;
    const swarms = krill.swarms;
    for (let si = 0; si < swarms.length; si++) {
      const s = swarms[si];
      const row = this.bySwarm[si];
      if (!row) continue;
      const v = Math.max(lightAt(s.y) * 0.75, s.lit);
      const hidden = s.amount <= 0 || v < 0.05 || Math.abs(s.x - cam.x) > 5600;
      const a = hidden ? 0 : Math.min(1, v);
      for (let i = 0; i < row.length; i++) {
        const part = s.parts[i];
        const p = row[i];
        p.alpha = a;
        if (a === 0) continue;
        p.x = cam.sx(part.px);
        p.y = cam.sy(part.py);
      }
    }
  }
}
