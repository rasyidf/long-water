/** Water column, sky, god-rays, marine snow, caustics and the depth vignette. */
import { Texture } from "pixi.js";
import { DARK_FULL, DARK_START } from "../config/constants";
import { ZONES, zoneAt } from "../config/zones";
import { lightAt } from "../core/light";
import { clamp01 } from "../core/math";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { gradientTexture, hex } from "./textures";

export class BackgroundRenderer implements System {
  readonly name = "render:background";
  private waterTex: Record<string, Texture> = {};

  init(ctx: GameContext): void {
    for (const z of ZONES) {
      this.waterTex[z.name] = gradientTexture(
        [
          [0, hex(z.shelf)],
          [0.28, hex(z.deep)],
          [0.56, "#050d16"],
          [1, "#02040a"],
        ],
        8,
        512,
      );
    }
    const L = ctx.layers;
    L.sky.texture = gradientTexture(
      [
        [0, "#141f2b"],
        [1, "#38646d"],
      ],
      8,
      128,
    );
    L.vignette.texture = gradientTexture(
      [
        [0, "rgba(4,8,14,0)"],
        [0.62, "rgba(4,8,14,0.30)"],
        [1, "rgba(4,8,14,0.86)"],
      ],
      512,
      512,
      true,
    );
    // surface → light-line darkness gradient, sampled in world space each frame
    L.darkGrad.texture = gradientTexture(
      [
        [0, "rgba(3,6,13,0)"],
        [0.5, "rgba(3,6,13,0.28)"],
        [1, "rgba(2,4,10,0.62)"],
      ],
      8,
      512,
    );
  }

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, clock, whale } = ctx;
    const VW = cam.vw;
    const VH = cam.vh;
    const sc = cam.scale;
    const y0 = cam.sy(0);
    const y1 = cam.sy(3200);

    const z = zoneAt(whale.x);
    L.waterSprite.texture = this.waterTex[z.name];
    L.waterSprite.x = 0;
    L.waterSprite.width = VW;
    L.waterSprite.y = y0;
    L.waterSprite.height = Math.max(1, y1 - y0);

    L.sky.visible = y0 > 0;
    if (L.sky.visible) {
      L.sky.x = 0;
      L.sky.width = VW;
      L.sky.y = 0;
      L.sky.height = y0;
    }

    // light shafts — fade out smoothly with depth rather than a hard cutoff
    const g = L.shafts;
    g.clear();
    const shaftK = clamp01(1 - whale.y / (DARK_START * 2.6));
    if (y0 < VH && shaftK > 0.02) {
      const step = 620;
      for (let k = -2; k < 9; k++) {
        const wx = Math.floor(cam.x / step) * step + k * step;
        const px = cam.sx(wx + Math.sin(clock.t * 0.25 + wx * 0.001) * 70);
        const h = 1600 * sc;
        const top = 26 * sc;
        const bot = 150 * sc;
        g.moveTo(px - top, y0);
        g.lineTo(px + top, y0);
        g.lineTo(px + bot + 90 * sc, y0 + h);
        g.lineTo(px - bot + 90 * sc, y0 + h);
        g.closePath();
        g.fill({ color: 0x78d6c8, alpha: 0.055 * shaftK });
      }
    }

    // marine snow (screen-wrapped parallax field)
    const sn = L.snow;
    sn.clear();
    for (const p of ctx.particles.snow) {
      const par = 0.55 + p.d * 0.45;
      const ax = (((p.x - cam.x * par) % 4000) + 4000) % 4000;
      const ay =
        (((p.y - cam.y * par + clock.t * 9 * p.d) % 4000) + 4000) % 4000;
      const px = (ax - 2000) * sc + VW / 2;
      const py = (ay - 2000) * sc + VH / 2;
      if (px < -5 || px > VW + 5 || py < -5 || py > VH + 5) continue;
      sn.rect(px, py, p.s * 1.7, p.s * 1.7);
      sn.fill({ color: 0xded6c6, alpha: 0.09 + p.d * 0.15 });
    }

    // caustics
    const cg = L.caustics;
    cg.clear();
    if (y0 < VH && y0 > -80) {
      for (let i = 0; i < 70; i++) {
        const wx = cam.x + (i / 70 - 0.5) * (VW / sc) * 1.1;
        const ph = wx * 0.004 + clock.t * 1.6;
        const a = Math.pow(Math.max(0, Math.sin(ph)), 6);
        if (a < 0.04) continue;
        const px = cam.sx(wx);
        const py = cam.sy(14 + Math.sin(ph * 1.7) * 10);
        cg.moveTo(px - 22 * sc, py);
        cg.lineTo(px + 22 * sc, py + 6 * sc);
        cg.stroke({ width: 1 + a * 2.4, color: 0x92e8dc, alpha: a * 0.5 });
      }
    }

    // depth darkness: gradient from the surface line down to the light line,
    // then a flat fill below it (dim, not opaque — silhouettes still read)
    const dTop = cam.sy(0);
    const dEnd = cam.sy(DARK_FULL);
    L.darkGrad.x = 0;
    L.darkGrad.width = VW;
    L.darkGrad.y = dTop;
    L.darkGrad.height = Math.max(1, dEnd - dTop);
    L.darkGrad.visible = dEnd > 0 && dTop < VH;

    const df = L.darkFill;
    df.clear();
    if (dEnd < VH) {
      const y = Math.max(0, dEnd);
      df.rect(0, y, VW, VH - y);
      df.fill({ color: 0x02040a, alpha: 0.62 });
    }

    L.vignette.x = 0;
    L.vignette.y = 0;
    L.vignette.width = VW;
    L.vignette.height = VH;
    L.vignette.alpha = 0.5 + (1 - lightAt(whale.y)) * 0.4;
  }
}
