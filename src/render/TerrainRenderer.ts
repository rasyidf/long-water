/** The seabed: a spline through the smoothed heightfield, plus a lit rim where
 * ambient light or a recent sonar sweep reaches it.
 *
 * Columns outside the generated range are clamped to the first/last sample, so
 * the floor reads as a flat continuation off either end of the route rather
 * than dropping to a hard vertical edge. */
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
    const first = Math.floor(left / COL);
    const last = Math.ceil(right / COL);

    const tg = L.terrain;
    tg.clear();
    if (last <= first + 2) return;

    const f = world.floorY;
    const at = (c: number): number =>
      f[c < 0 ? 0 : c > NCOL - 1 ? NCOL - 1 : c];

    tg.moveTo(cam.sx(first * COL), VH + 40);
    tg.lineTo(cam.sx(first * COL), cam.sy(at(first)));
    for (let c = first; c < last - 1; c++) {
      const mx = (c * COL + (c + 1) * COL) / 2;
      const my = (at(c) + at(c + 1)) / 2;
      tg.quadraticCurveTo(
        cam.sx(c * COL),
        cam.sy(at(c)),
        cam.sx(mx),
        cam.sy(my),
      );
    }
    tg.lineTo(cam.sx(last * COL), cam.sy(at(last)));
    tg.lineTo(cam.sx(last * COL), VH + 40);
    tg.closePath();
    tg.fill({ color: C.rock });

    for (let c = first; c < last; c++) {
      const amb = lightAt(at(c)) * 0.9;
      if (amb < 0.05) continue;
      tg.rect(cam.sx(c * COL) - 1, cam.sy(at(c)) - 2, COL * sc + 2, 3);
      tg.fill({ color: C.rockLit, alpha: amb });
    }
  }
}
