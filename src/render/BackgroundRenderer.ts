/** Water column, sky, god-rays, marine snow, caustics and the depth vignette. */
import { Texture } from "pixi.js";
import { C, DARK_FULL, DARK_START, SUN_LEAN } from "../config/constants";
import { ZONES, zoneAt } from "../config/zones";
import { lightAt } from "../core/light";
import { clamp01, hash01 } from "../core/math";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { gradientTexture, hex } from "./textures";

/** brightness of a light shaft along its length (0..1 of its own length):
 * ramps in just under the surface, then eases to zero at the bottom. */
function shaftProfile(t: number): number {
  const up = clamp01(t / 0.16);
  const down = 1 - clamp01((t - 0.16) / 0.84);
  return up * down * down;
}

export class BackgroundRenderer implements System {
  readonly name = "render:background";
  private waterTex: Record<string, Texture> = {};

  init(ctx: GameContext): void {
    for (const z of ZONES) {
      this.waterTex[z.id] = gradientTexture(
        [
          [0, hex(z.shelf)],
          [0.16, hex(z.shelf)],
          [0.4, hex(z.deep)],
          [0.62, "#050d16"],
          [0.82, "#03080f"],
          [1, "#02040a"],
        ],
        8,
        512,
      );
    }
    const L = ctx.layers;
    L.sky.texture = gradientTexture(
      [
        [0, "#21344a"],
        [1, "#4b8088"],
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

  /** vertical displacement of the water surface at world-x `wx` (world units) */
  private waveAt(wx: number, t: number): number {
    return (
      Math.sin(wx * 0.006 + t * 1.0) * 7 +
      Math.sin(wx * 0.013 - t * 1.6) * 4 +
      Math.sin(wx * 0.0021 + t * 0.5) * 11
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
    L.waterSprite.texture = this.waterTex[z.id];
    L.waterSprite.x = 0;
    L.waterSprite.width = VW;
    L.waterSprite.y = y0;
    L.waterSprite.height = Math.max(1, y1 - y0);

    // amplitude grows when the whale is near the surface / just breached
    const ampWorld =
      22 * (whale.y < 240 ? 1.45 : 1) + Math.min(30, cam.shake * 1.4);
    const ampPx = ampWorld * sc;

    const surfaceVisible = y0 > -160 - ampPx && y0 < VH + 80;
    L.sky.visible = y0 > -ampPx;
    if (L.sky.visible) {
      L.sky.x = 0;
      L.sky.width = VW;
      L.sky.y = 0;
      L.sky.height = Math.max(1, y0 + ampPx + 30 * sc); // cover the deepest trough
    }

    // animated wavy waterline
    const sf = L.surface;
    sf.clear();
    if (surfaceVisible) {
      const N = 40;
      const wy = (screenX: number): number => {
        const wx = cam.x + (screenX - VW / 2) / sc;
        return y0 + this.waveAt(wx, clock.t) * sc * (ampWorld / 22);
      };
      // sunlit near-surface layer — stacked slabs so its lower edge dissolves
      // into the water column instead of ending on a hard line
      const slabs: ReadonlyArray<readonly [number, number]> = [
        [40 * sc, 0.5],
        [130 * sc + 90, 0.26],
        [260 * sc + 220, 0.12],
      ];
      for (const [band, a] of slabs) {
        sf.moveTo(-40, wy(-40));
        for (let i = 0; i <= N; i++)
          sf.lineTo((i / N) * (VW + 80) - 40, wy((i / N) * (VW + 80) - 40));
        sf.lineTo(VW + 40, wy(VW + 40) + band);
        sf.lineTo(-40, wy(-40) + band);
        sf.closePath();
        sf.fill({ color: z.shelf, alpha: a });
      }

      // foam crest
      sf.moveTo(-40, wy(-40));
      for (let i = 0; i <= N; i++)
        sf.lineTo((i / N) * (VW + 80) - 40, wy((i / N) * (VW + 80) - 40));
      sf.stroke({ width: 1 + 1.6 * sc, color: C.foam, alpha: 0.45 });
    }

    // light shafts — sunlight from above, angled slightly off vertical. Each
    // shaft draws its width, drift, length and intensity from a hash of its
    // world index, so the field never reads as one stamp repeated across the
    // screen; and every shaft is split into segments whose alpha follows
    // `shaftProfile`, fading in under the surface and tapering to nothing with
    // depth rather than ending on a flat edge.
    const g = L.shafts;
    g.clear();
    const shaftK = clamp01(1 - whale.y / (DARK_START * 2.6));
    if (y0 < VH && shaftK > 0.02) {
      const step = 540;
      const halfW = VW / 2 / sc;
      const i0 = Math.floor((cam.x - halfW) / step) - 1;
      const i1 = Math.ceil((cam.x + halfW) / step) + 1;
      for (let i = i0; i <= i1; i++) {
        const r = hash01(i);
        const r2 = hash01(i * 2 + 101);
        const r3 = hash01(i * 3 + 977);
        const wx = i * step + (r - 0.5) * step * 0.8;
        const drift =
          Math.sin(clock.t * (0.14 + r2 * 0.22) + i * 1.7) * (30 + r3 * 55);
        const x0 = cam.sx(wx) + drift * sc;
        const topW = (10 + r * 30) * sc;
        const len = (1100 + r3 * 1000) * sc;
        const lean = SUN_LEAN * len * (0.7 + r2 * 0.6);
        const peak = (0.028 + r * 0.05) * shaftK;
        const SEG = 6;
        for (let s = 0; s < SEG; s++) {
          const ta = s / SEG;
          const tb = (s + 1) / SEG;
          const xa = x0 + lean * ta;
          const xb = x0 + lean * tb;
          const wa = topW * (1 + ta * 2.6);
          const wb = topW * (1 + tb * 2.6);
          const ya = y0 + len * ta;
          const yb = y0 + len * tb;
          g.moveTo(xa - wa, ya);
          g.lineTo(xa + wa, ya);
          g.lineTo(xb + wb, yb);
          g.lineTo(xb - wb, yb);
          g.closePath();
          g.fill({
            color: 0x78d6c8,
            alpha: peak * (shaftProfile(ta) + shaftProfile(tb)) * 0.5,
          });
        }
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
