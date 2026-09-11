/** Ship hulls at the surface: a cast shadow raking down into the water column
 * (light from above, slightly off vertical), the hull itself, and a faint red
 * noise footprint read by PodSystem. */
import { C } from "../config/constants";
import { clamp01 } from "../core/math";
import { sunLean } from "./ocean/params";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

/** darkness of a cast shadow along its length (0..1 of its own length):
 * strongest just under the hull, gone by the far end. */
function shadowProfile(t: number): number {
  return (1 - t) * (1 - t * 0.4) * clamp01(t / 0.04 + 0.35);
}

export class ShipRenderer implements System {
  readonly name = "render:ships";

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, clock } = ctx;
    const sc = cam.scale;
    const shg = L.ships;
    shg.clear();
    for (const s of ctx.ships.ships) {
      if (Math.abs(s.x - cam.x) > 8000) continue;
      const px = cam.sx(s.x);
      const py = cam.sy(0);
      const Ln = s.len * sc;
      const H = 90 * sc;

      // cast shadow — a soft column descending from the hull. It rakes toward
      // +x with depth to match the god-rays' light direction, drags a little
      // opposite the ship's travel, and shimmers so it never sits static.
      const drag = clamp01(Math.abs(s.v) / 70);
      const len = (900 + 520 * drag) * sc;
      const lean = sunLean() * len - Math.sign(s.v) * drag * 26 * sc;
      const halfTop = Ln * 0.44;
      const shimmer = 1 + Math.sin(clock.t * 1.3 + s.x * 0.002) * 0.12;
      const SEG = 7;
      for (let i = 0; i < SEG; i++) {
        const ta = i / SEG;
        const tb = (i + 1) / SEG;
        const xa = px + lean * ta;
        const xb = px + lean * tb;
        const wa = halfTop * (1 + ta * 0.9);
        const wb = halfTop * (1 + tb * 0.9);
        const ya = py + len * ta;
        const yb = py + len * tb;
        shg.moveTo(xa - wa, ya);
        shg.lineTo(xa + wa, ya);
        shg.lineTo(xb + wb, yb);
        shg.lineTo(xb - wb, yb);
        shg.closePath();
        shg.fill({
          color: 0x02040a,
          alpha: 0.26 * shimmer * (shadowProfile(ta) + shadowProfile(tb)) * 0.5,
        });
      }

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
