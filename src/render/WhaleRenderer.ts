/** Draws every whale (pod + player) and the whale-adjacent bubbles, delegating
 * body drawing to a swappable `WhaleView`. */
import { C } from "../config/constants";
import { lightAt } from "../core/light";
import type { Vec2 } from "../core/math";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { ProceduralWhaleView } from "./whale/ProceduralWhaleView";
import type { WhaleView } from "./whale/WhaleView";

export class WhaleRenderer implements System {
  readonly name = "render:whales";

  constructor(private view: WhaleView = new ProceduralWhaleView()) {}

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, clock, whale, pod } = ctx;
    const wg = L.whales;
    wg.clear();

    for (const w of pod.whales) {
      if (w.state === "following") {
        if (w.spine)
          this.view.draw(
            wg,
            w.spine,
            {
              scale: w.size * 0.9,
              facing: 1,
              skin: C.wildSkin,
              belly: C.wildBelly,
              alpha: 0.95,
            },
            cam,
          );
        continue;
      }
      const v = Math.max(
        lightAt(w.y) * 0.7,
        w.lit,
        w.state === "answered" ? 0.45 : 0,
      );
      if (v < 0.05 || Math.abs(w.x - cam.x) > 6000) continue;
      const sp: Vec2[] = [];
      for (let i = 0; i < 16; i++)
        sp.push({
          x: w.x - i * 16 * w.size,
          y:
            w.y +
            Math.sin(clock.t * 1.1 + w.ph - i * 0.5) * (2 + (i / 15) * 12),
        });
      this.view.draw(
        wg,
        sp,
        {
          scale: w.size * 0.85,
          facing: 1,
          skin: C.wildSkin,
          belly: C.wildBelly,
          alpha: Math.min(0.92, v),
        },
        cam,
      );
    }

    this.view.draw(
      wg,
      whale.spine,
      {
        scale: 1,
        facing: whale.facing >= 0 ? 1 : -1,
        skin: C.skin,
        belly: C.belly,
        alpha: 1,
      },
      cam,
    );

    for (const b of ctx.particles.bubbles) {
      wg.circle(cam.sx(b.x), cam.sy(b.y), b.r * cam.scale * 1.5);
      wg.fill({ color: C.foam, alpha: Math.min(0.7, b.life) });
    }
  }
}
