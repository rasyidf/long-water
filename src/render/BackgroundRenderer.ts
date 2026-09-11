/** Water column, sky, god-rays, marine snow, caustics and the depth vignette. */
import { Texture } from "pixi.js";
import { DARK_FULL, DARK_START } from "../config/constants";
import { zoneAt, zones } from "../config/zones";
import { lightAt } from "../core/light";
import { clamp01, smoothstep } from "../core/math";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { gradientTexture, hex } from "./textures";
import { mixColor } from "./color";
import { OceanView } from "./ocean/OceanView";
import { oceanDrawOptions, oceanParams } from "./ocean/params";
import { skyLight } from "./ocean/sky";

export class BackgroundRenderer implements System {
  readonly name = "render:background";
  private waterTex: Record<string, Texture> = {};
  private ocean = new OceanView();

  init(ctx: GameContext): void {
    for (const z of zones()) {
      this.waterTex[z.id] = gradientTexture(
        [
          [0, hex(z.shelf)],
          [0.1, hex(z.shelf)],
          // eased shelf→deep so the flat-then-ramp join doesn't read as a
          // hard horizontal band (a Mach edge) partway down the column
          [0.26, hex(mixColor(z.shelf, z.deep, 0.35))],
          [0.46, hex(z.deep)],
          [0.62, "#050d16"],
          [0.82, "#03080f"],
          [1, "#02040a"],
        ],
        8,
        512,
      );
    }
    const L = ctx.layers;
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
    // surface → deep darkness, sampled in world space each frame. Stops are
    // eased so the slope approaches zero at the bottom: without that the
    // gradient-then-flat-fill join reads as a hard horizontal band (a Mach
    // edge) instead of a continuous fade from shallow to mid to deep water.
    L.darkGrad.texture = gradientTexture(
      [
        [0, "rgba(3,7,14,0)"],
        [0.14, "rgba(3,7,14,0.04)"],
        [0.34, "rgba(3,7,13,0.16)"],
        [0.56, "rgba(3,6,12,0.34)"],
        [0.76, "rgba(2,5,11,0.5)"],
        [0.9, "rgba(2,4,10,0.59)"],
        [1, "rgba(2,4,10,0.64)"],
      ],
      8,
      512,
    );
  }

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, clock, whale } = ctx;
    const VW = cam.vw;
    const VH = cam.vh;
    const y0 = cam.sy(0);
    const y1 = cam.sy(3200);
    const p = oceanParams();
    const draw = oceanDrawOptions();
    const day = skyLight(p.sky.timeOfDay).daylight;

    const z = zoneAt(whale.x);
    L.waterSprite.texture = this.waterTex[z.id];
    L.waterSprite.x = 0;
    L.waterSprite.width = VW;
    L.waterSprite.y = y0;
    L.waterSprite.height = Math.max(1, y1 - y0);
    // the column gradient is baked per zone, so the hour is applied as a tint —
    // white (a no-op) in full daylight, cooling and darkening after sunset
    L.waterSprite.tint = mixColor(0x39465c, 0xffffff, 0.3 + 0.7 * day);

    // the swell runs bigger when the whale is near the surface or has just
    // breached, which is also when the player is looking straight at it
    const gain =
      1 +
      0.35 * (1 - smoothstep(120, 420, whale.y)) +
      Math.min(0.6, cam.shake * 0.04);

    this.ocean.drawSky(L.sky, p, cam, clock.t, gain, draw);
    this.ocean.drawSurface(L.surface, p, cam, clock.t, z.shelf, gain, draw);

    const shaftK = clamp01(1 - whale.y / (DARK_START * 2.6));
    this.ocean.drawShafts(L.shafts, p, cam, clock.t, shaftK, draw);
    this.ocean.drawCaustics(L.caustics, p, cam, clock.t, draw);

    // marine snow (screen-wrapped parallax field)
    const sc = cam.scale;
    const sn = L.snow;
    sn.clear();
    for (const pt of ctx.particles.snow) {
      const par = 0.55 + pt.d * 0.45;
      const ax = (((pt.x - cam.x * par) % 4000) + 4000) % 4000;
      const ay =
        (((pt.y - cam.y * par + clock.t * 9 * pt.d) % 4000) + 4000) % 4000;
      const px = (ax - 2000) * sc + VW / 2;
      const py = (ay - 2000) * sc + VH / 2;
      if (px < -5 || px > VW + 5 || py < -5 || py > VH + 5) continue;
      sn.rect(px, py, pt.s * 1.7, pt.s * 1.7);
      sn.fill({ color: 0xded6c6, alpha: 0.09 + pt.d * 0.15 });
    }

    // depth darkness: one world-anchored gradient from the surface down well
    // past the light line, then a flat fill only far below — where the eased
    // gradient tail has already flattened onto the fill's colour, so the
    // shallow→mid→deep fade stays continuous instead of stepping at a line.
    const dTop = cam.sy(0);
    const dBot = cam.sy(DARK_FULL * 1.5);
    L.darkGrad.x = 0;
    L.darkGrad.width = VW;
    L.darkGrad.y = dTop;
    L.darkGrad.height = Math.max(1, dBot - dTop);
    L.darkGrad.visible = dBot > 0 && dTop < VH;

    const df = L.darkFill;
    df.clear();
    if (dBot < VH) {
      const y = Math.max(0, dBot);
      df.rect(0, y, VW, VH - y);
      df.fill({ color: 0x02040a, alpha: 0.64 });
    }

    L.vignette.x = 0;
    L.vignette.y = 0;
    L.vignette.width = VW;
    L.vignette.height = VH;
    L.vignette.alpha = 0.32 + (1 - lightAt(whale.y)) * 0.5;
  }
}
