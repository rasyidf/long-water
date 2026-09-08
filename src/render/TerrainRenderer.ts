/** The seabed: a spline through the smoothed heightfield, plus a lit rim where
 * ambient light or a recent sonar sweep reaches it. */
import { COL, C, NCOL } from "../config/constants";
import { lightAt } from "../core/light";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class TerrainRenderer implements System {
  readonly name = "render:terrain";

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, world } = ctx;
    const VH = cam.vh;
    const sc = cam.scale;
    const [left, right] = cam.visibleX(300);
    const c0 = Math.max(0, Math.floor(left / COL));
    const c1 = Math.min(NCOL - 1, Math.ceil(right / COL));

    const tg = L.terrain;
    tg.clear();
    if (c1 <= c0 + 2) return;

    const f = world.floorY;
    tg.moveTo(cam.sx(c0 * COL), VH + 40);
    tg.lineTo(cam.sx(c0 * COL), cam.sy(f[c0]));
    for (let c = c0; c < c1 - 1; c++) {
      const mx = (c * COL + (c + 1) * COL) / 2;
      const my = (f[c] + f[c + 1]) / 2;
      tg.quadraticCurveTo(
        cam.sx(c * COL),
        cam.sy(f[c]),
        cam.sx(mx),
        cam.sy(my),
      );
    }
    tg.lineTo(cam.sx(c1 * COL), cam.sy(f[c1]));
    tg.lineTo(cam.sx(c1 * COL), VH + 40);
    tg.closePath();
    tg.fill({ color: C.rock });

    for (let c = c0; c < c1; c++) {
      const amb = lightAt(f[c]) * 0.9;
      if (amb < 0.05) continue;
      tg.rect(cam.sx(c * COL) - 1, cam.sy(f[c]) - 2, COL * sc + 2, 3);
      tg.fill({ color: C.rockLit, alpha: amb });
    }
  }
}
