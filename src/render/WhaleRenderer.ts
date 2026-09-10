/** Draws every whale (pod + player) and the whale-adjacent bubbles, delegating
 * body drawing to a swappable `WhaleView`. Every whale — player and pod — now
 * carries a real `body.spine`, so this is a pure consumer of movement state. */
import { C } from "../config/constants";
import { lightAt } from "../core/light";
import { clamp01 } from "../core/math";
import { podGirth } from "../state/Pod";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { ProceduralWhaleView } from "./whale/ProceduralWhaleView";
import type { WhaleView } from "./whale/WhaleView";

export class WhaleRenderer implements System {
  readonly name = "render:whales";

  constructor(private view: WhaleView = new ProceduralWhaleView()) {}

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, whale, pod } = ctx;
    const wg = L.whales;
    wg.clear();

    for (const w of pod.whales) {
      const b = w.body;
      // proportions come from this whale's own maturity/size — a calf is
      // genuinely shorter and stubbier, `drawScale` keeps the aspect constant
      const drawScale = b.len / 280;
      const juv = clamp01(1 - w.age);

      let alpha: number;
      if (w.state === "following") {
        alpha = 0.95;
      } else {
        const v = Math.max(
          lightAt(b.y) * 0.7,
          w.lit,
          w.state === "answered" ? 0.45 : 0,
        );
        if (v < 0.05 || Math.abs(b.x - cam.x) > 6000) continue;
        alpha = Math.min(0.92, v);
      }

      // skip whales whose whole body is off the side of the viewport
      const [vx0, vx1] = cam.visibleX(b.len);
      if (b.x < vx0 || b.x > vx1) continue;

      this.view.draw(
        wg,
        b.spine,
        {
          scale: drawScale,
          facing: b.facing >= 0 ? 1 : -1,
          skin: C.wildSkin,
          belly: C.wildBelly,
          alpha,
          width: podGirth(w),
          juv,
          roll: b.roll,
          rollK: b.rollBlend,
          seed: (w.ph * 131 + b.len) | 0,
        },
        cam,
      );
    }

    // --- the player ---
    const pb = whale.body;
    this.view.draw(
      wg,
      pb.spine,
      {
        scale: 1,
        facing: pb.facing >= 0 ? 1 : -1,
        skin: C.skin,
        belly: C.belly,
        alpha: 1,
        width: 38,
        roll: pb.roll,
        rollK: pb.rollBlend,
      },
      cam,
    );

    // --- bubbles ---
    for (const b of ctx.particles.bubbles) {
      wg.circle(cam.sx(b.x), cam.sy(b.y), b.r * cam.scale * 1.5);
      wg.fill({ color: C.foam, alpha: Math.min(0.7, b.life) });
    }
  }
}
