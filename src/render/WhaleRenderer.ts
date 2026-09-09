/** Draws every whale (pod + player) and the whale-adjacent bubbles, delegating
 * body drawing to a swappable `WhaleView`. */
import { C } from "../config/constants";
import { lightAt } from "../core/light";
import { clamp01, type Vec2 } from "../core/math";
import { podBodyLen, podGirth } from "../state/Pod";
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
      // Body length and proportions come from the whale's own maturity/size, not
      // the leader's — a calf is genuinely shorter and stubbier, never the same
      // length drawn thin. `drawScale` scales girth and fins to match the body
      // so the aspect stays constant across sizes.
      const bodyLen = podBodyLen(w);
      const drawScale = bodyLen / 280;
      const girth = podGirth(w);
      const juv = clamp01(1 - w.age);

      if (w.state === "following") {
        if (w.spine)
          this.view.draw(
            wg,
            w.spine,
            {
              scale: drawScale,
              facing: 1,
              skin: C.wildSkin,
              belly: C.wildBelly,
              alpha: 0.95,
              width: girth,
              juv,
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
      const step = bodyLen / 15;
      const sp: Vec2[] = [];
      for (let i = 0; i < 16; i++)
        sp.push({
          x: w.x - i * step,
          y:
            w.y +
            Math.sin(clock.t * 1.1 + w.ph - i * 0.5) * (2 + (i / 15) * 12),
        });

      this.view.draw(
        wg,
        sp,
        {
          scale: drawScale,
          facing: 1,
          skin: C.wildSkin,
          belly: C.wildBelly,
          alpha: Math.min(0.92, v),
          width: girth,
          juv,
        },
        cam,
      );
    }

    // --- Draw the Main Player Whale ---
    this.view.draw(
      wg,
      whale.spine,
      {
        scale: 1,
        facing: whale.facing >= 0 ? 1 : -1,
        skin: C.skin,
        belly: C.belly,
        alpha: 1,
        width: 38,
      },
      cam,
    );

    // --- Draw Bubbles ---
    for (const b of ctx.particles.bubbles) {
      wg.circle(cam.sx(b.x), cam.sy(b.y), b.r * cam.scale * 1.5);
      wg.fill({ color: C.foam, alpha: Math.min(0.7, b.life) });
    }
  }
}
