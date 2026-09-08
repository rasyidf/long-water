/** Ship hulls at the surface, with a faint red noise footprint. */
import { C } from "../config/constants";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class ShipRenderer implements System {
  readonly name = "render:ships";

  render(ctx: GameContext): void {
    const { camera: cam, layers: L } = ctx;
    const sc = cam.scale;
    const shg = L.ships;
    shg.clear();
    for (const s of ctx.ships.ships) {
      if (Math.abs(s.x - cam.x) > 8000) continue;
      const px = cam.sx(s.x);
      const py = cam.sy(0);
      const Ln = s.len * sc;
      const H = 90 * sc;
      shg.moveTo(px - Ln / 2, py - H);
      shg.lineTo(px + Ln / 2, py - H);
      shg.lineTo(px + Ln / 2 - 40 * sc, py + H * 0.5);
      shg.lineTo(px - Ln / 2 + 20 * sc, py + H * 0.5);
      shg.closePath();
      shg.fill({ color: C.hull });
      shg.rect(px - Ln * 0.28, py - H * 2.4, Ln * 0.16, H * 1.4);
      shg.fill({ color: C.hull });
      shg.circle(px, py, 2200 * sc);
      shg.fill({ color: C.alarm, alpha: 0.05 });
    }
  }
}
