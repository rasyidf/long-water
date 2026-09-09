/** The seabed, drawn as two depth layers:
 *
 *  - a distant ridge (`terrainFar`) scrolled at a parallax fraction of the
 *    camera, flattened and hazed so it reads as background,
 *  - the near seabed you swim over, plus a lit rim where ambient light or a
 *    recent sonar sweep reaches it.
 *
 * Each layer is a spline through the smoothed heightfield, closed off *below
 * the deepest point of the visible span* rather than at a fixed screen line —
 * so when part of the floor drops off the bottom of the screen the fill stays
 * a simple polygon and never self-intersects into truncated / inside-out
 * shapes. Columns outside the generated range clamp to the first/last sample,
 * so the floor reads as a flat continuation off either end of the route. */
import type { Graphics } from "pixi.js";
import { COL, C, NCOL } from "../config/constants";
import type { Camera } from "../core/Camera";
import { lightAt } from "../core/light";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { mixColor } from "./color";

/** the far ridge scrolls at this fraction of the camera's x motion */
const FAR_PARALLAX = 0.55;
/** hazed toward the water so the ridge recedes (atmospheric perspective) */
const FAR_FILL = mixColor(C.rock, 0x16394d, 0.7);
const FAR_RIM = mixColor(C.rockLit, 0x1c4a60, 0.55);

export class TerrainRenderer implements System {
  readonly name = "render:terrain";

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, world } = ctx;
    const f = world.floorY;
    const at = (c: number): number =>
      f[c < 0 ? 0 : c > NCOL - 1 ? NCOL - 1 : c];

    const half = cam.vw / 2 / cam.scale;

    // ---------- far parallax ridge ----------
    {
      const g = L.terrainFar;
      g.clear();
      const camFarX = cam.x * FAR_PARALLAX;
      const first = Math.floor((camFarX - half - 300) / COL);
      const last = Math.ceil((camFarX + half + 300) / COL);
      const sx = (wx: number): number =>
        (wx - camFarX) * cam.scale + cam.vw / 2;
      // a ridgeline of its own: the heightfield sampled at a higher spatial
      // frequency, flattened and lifted so its crests rise above the near
      // seabed (a distant range seen across the water) rather than hiding
      // behind every shelf
      const shape = (c: number): number => {
        const s = 230 + (at(Math.round(c * 1.7) + 260) - 520) * 0.28;
        return s < 240 ? 240 : s;
      };

      this.trace(g, cam, first, last, sx, shape);
      g.fill({ color: FAR_FILL, alpha: 0.6 });

      // faint crest highlight so the silhouette reads
      g.moveTo(sx(first * COL), cam.sy(shape(first)));
      for (let c = first; c < last; c++)
        g.lineTo(sx((c + 0.5) * COL), cam.sy((shape(c) + shape(c + 1)) / 2));
      g.stroke({ width: 1.5, color: FAR_RIM, alpha: 0.35 });
    }

    // ---------- near seabed ----------
    {
      const g = L.terrain;
      g.clear();
      const [left, right] = cam.visibleX(300);
      const first = Math.floor(left / COL);
      const last = Math.ceil(right / COL);
      if (last <= first + 2) return;

      this.trace(g, cam, first, last, (wx) => cam.sx(wx), at);
      g.fill({ color: C.rock });

      const sc = cam.scale;
      for (let c = first; c < last; c++) {
        const amb = lightAt(at(c)) * 0.9;
        if (amb < 0.05) continue;
        g.rect(cam.sx(c * COL) - 1, cam.sy(at(c)) - 2, COL * sc + 2, 3);
        g.fill({ color: C.rockLit, alpha: amb });
      }
    }
  }

  /** Trace a smooth heightfield spline across `[first, last]` into a closed
   * polygon. `sx` maps world-x to screen-x (so a caller can apply parallax);
   * `y` returns the world-space floor height for column `c`. The bottom edge
   * sits below the deepest sampled point, guaranteeing a simple polygon. */
  private trace(
    g: Graphics,
    cam: Camera,
    first: number,
    last: number,
    sx: (wx: number) => number,
    y: (c: number) => number,
  ): void {
    let botY = cam.vh + 40;
    for (let c = first; c <= last; c++) {
      const s = cam.sy(y(c));
      if (s > botY) botY = s;
    }
    botY += 80;

    const px = (c: number): number => sx(c * COL);
    const py = (c: number): number => cam.sy(y(c));

    g.moveTo(px(first), botY);
    g.lineTo(px(first), py(first));
    for (let c = first; c < last; c++) {
      const mx = sx((c + 0.5) * COL);
      const my = cam.sy((y(c) + y(c + 1)) / 2);
      g.quadraticCurveTo(px(c), py(c), mx, my);
    }
    g.lineTo(px(last), py(last));
    g.lineTo(px(last), botY);
    g.closePath();
  }
}
