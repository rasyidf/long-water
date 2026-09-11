/**
 * Water column, sky, god-rays, the deep column's haze / thermocline / snow /
 * sparks, caustics and the depth vignette.
 *
 * The game renders a private live copy of `OCEAN_DEFAULTS` so the hour can be
 * advanced from the clock (`water.dayLength`) without exposing the dev-tools
 * override; when the procgen viewer has pushed an override in, that object is
 * rendered untouched so every slider lands as-is.
 */
import { Texture } from "pixi.js";
import { DARK_FULL, DARK_START } from "../config/constants";
import { zoneAt, zones, type Zone } from "../config/zones";
import { lightAt } from "../core/light";
import { clamp01, smoothstep } from "../core/math";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { gradientTexture, hex } from "./textures";
import { mixColor } from "./color";
import { mulColor, paletteShift, waterTint } from "./ocean/column";
import { OceanView } from "./ocean/OceanView";
import {
  cloneOceanParams,
  OCEAN_DEFAULTS,
  oceanDrawOptions,
  oceanParams,
  type OceanParams,
} from "./ocean/params";
import { skyLight, skyPalette } from "./ocean/sky";
import type { OceanDrawOptions, OceanSection } from "./ocean/OceanView";
import { quality } from "../state/Quality";

/** the deep column gradient spans this many world units of depth */
const COLUMN_DEPTH = 3200;
/** the column's stops, as (depth fraction, colour) before absorption */
const COLUMN_STOPS: ReadonlyArray<readonly [number, number | null]> = [
  [0, null], // zone shelf
  [0.1, null],
  // eased shelf→deep so the flat-then-ramp join doesn't read as a hard
  // horizontal band (a Mach edge) partway down the column
  [0.26, -1], // shelf/deep mix
  [0.46, -2], // zone deep
  [0.62, 0x050d16],
  [0.82, 0x03080f],
  [1, 0x02040a],
];

/** the shipped hour's palette — the reference the column tint is measured
 * against, so the default look is exactly what it was */
const REF_PAL = skyPalette(OCEAN_DEFAULTS.sky.timeOfDay);

export class BackgroundRenderer implements System {
  readonly name = "render:background";
  private waterTex: Record<string, Texture> = {};
  private ocean = new OceanView();
  /** the game's own params: defaults plus whatever the clock has advanced */
  private live: OceanParams = cloneOceanParams();
  /** the absorption the column textures were last baked at */
  private bakedAbsorption = NaN;
  /** `live` (or the tools override) with the graphics-quality dials folded
   * in, rewritten in place each frame so nothing is allocated */
  private readonly eff: OceanParams = cloneOceanParams();
  /** this frame's dev-tools section filter, composed with the quality gate */
  private base: OceanDrawOptions = {};
  private readonly gated: OceanDrawOptions = {
    show: (s) => this.visible(s),
  };
  /** every canvas-backed texture this instance created, so a rebuild's fresh
   *  instance doesn't leak the old one's GPU upload (see `Game`'s run rebuild) */
  private owned: Texture[] = [];

  init(ctx: GameContext): void {
    this.bakeColumn(this.params().water.absorption);
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
    this.owned.push(L.vignette.texture);
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
    this.owned.push(L.darkGrad.texture);
  }

  /** a run rebuild tore this instance's layers down — release its own canvas
   *  textures (never the engine's shared ones, which this renderer never
   *  touches) */
  dispose(): void {
    for (const tex of this.owned) tex.destroy(true);
    this.owned.length = 0;
    this.waterTex = {};
    this.bakedAbsorption = NaN;
  }

  /** the params this frame renders: the dev-tools override if one is live,
   * otherwise the game's own copy */
  private params(): OceanParams {
    const p = oceanParams();
    return p === OCEAN_DEFAULTS ? this.live : p;
  }

  /**
   * Bake the per-zone column gradient, each stop seen through its own depth of
   * water (`waterTint`) so the shelf colour cools and reddens out on the way
   * down. Re-baked only when the absorption dial moves; the old textures are
   * released first so a slider sweep can't pile GPU uploads up.
   */
  private bakeColumn(absorption: number): void {
    if (absorption === this.bakedAbsorption) return;
    this.bakedAbsorption = absorption;
    for (const z of zones()) {
      const old = this.waterTex[z.id];
      if (old) {
        old.destroy(true);
        this.owned.splice(this.owned.indexOf(old), 1);
      }
      this.waterTex[z.id] = gradientTexture(
        COLUMN_STOPS.map(([f, c]) => [
          f,
          hex(waterTint(this.stopColor(z, c), f * COLUMN_DEPTH, absorption)),
        ]),
        8,
        512,
      );
      this.owned.push(this.waterTex[z.id]);
    }
  }

  /**
   * `src` seen through the graphics-quality dials: strengths scaled, counts
   * reduced, whole blocks zeroed. Copied into one reused object so the
   * renderers never see a half-scaled param set and nothing is allocated.
   */
  private effective(src: OceanParams): OceanParams {
    const q = quality();
    const e = this.eff;
    Object.assign(e.wave, src.wave);
    Object.assign(e.sky, src.sky);
    Object.assign(e.column, src.column);
    Object.assign(e.water, src.water);
    e.wave.foamAmount *= q.surfaceDetail;
    e.sky.glitter *= q.surfaceDetail;
    e.sky.cloudDecks = Math.max(1, Math.round(src.sky.cloudDecks * q.clouds));
    e.column.shaftStrength *= q.godRays;
    e.column.causticStrength *= q.caustics;
    e.column.slabs =
      q.slabs <= 0 ? 0 : Math.max(1, Math.round(src.column.slabs * q.slabs));
    e.water.murk *= q.murk;
    if (!q.thermocline) e.water.thermoclineStrength = 0;
    e.water.snowDensity *= q.snow;
    e.water.sparks *= q.sparks;
    return e;
  }

  /** the draw-section gate: the dev-tools filter first, then the blocks the
   * quality dials have switched off outright */
  private visible(s: OceanSection): boolean {
    if (this.base.show && !this.base.show(s)) return false;
    const q = quality();
    switch (s) {
      case "clouds":
        return q.clouds > 0;
      case "stars":
      case "birds":
        return q.skyLife;
      case "spray":
        return q.surfaceDetail >= 0.5;
      case "shafts":
        return q.godRays > 0;
      case "caustics":
        return q.caustics > 0;
      case "slabs":
        return q.slabs > 0;
      default:
        return true;
    }
  }

  private stopColor(z: Zone, c: number | null): number {
    if (c === null) return z.shelf;
    if (c === -1) return mixColor(z.shelf, z.deep, 0.35);
    if (c === -2) return z.deep;
    return c;
  }

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, clock, whale } = ctx;
    const VW = cam.vw;
    const VH = cam.vh;
    const y0 = cam.sy(0);
    const y1 = cam.sy(COLUMN_DEPTH);
    const src = this.params();
    // the day turns only on the game's own copy — the tools run their own loop
    if (src === this.live && src.water.dayLength > 0) {
      src.sky.timeOfDay =
        (src.sky.timeOfDay + clock.dt / src.water.dayLength) % 1;
    }
    const p = this.effective(src);
    this.base = oceanDrawOptions();
    const draw = this.gated;
    const pal = skyPalette(p.sky.timeOfDay);
    const day = skyLight(p.sky.timeOfDay).daylight;

    this.bakeColumn(p.water.absorption);

    const z = zoneAt(whale.x);
    L.waterSprite.texture = this.waterTex[z.id];
    L.waterSprite.x = 0;
    L.waterSprite.width = VW;
    L.waterSprite.y = y0;
    L.waterSprite.height = Math.max(1, y1 - y0);
    // the column gradient is baked per zone, so the hour is applied as a tint:
    // a brightness that dims after sunset, times the hue the sky has moved to
    // since the hour the column was tuned at (white — a no-op — at that hour)
    const hue = paletteShift(pal.water, REF_PAL.water, 0.7);
    L.waterSprite.tint = mulColor(
      mixColor(0x39465c, 0xffffff, 0.3 + 0.7 * day),
      hue,
    );

    // the swell runs bigger when the whale is near the surface or has just
    // breached, which is also when the player is looking straight at it
    const gain =
      1 +
      0.35 * (1 - smoothstep(120, 420, whale.y)) +
      Math.min(0.6, cam.shake * 0.04);

    this.ocean.drawSky(L.sky, p, cam, clock.t, gain, draw);
    this.ocean.drawColumn(L.column, p, cam, clock.t, draw);
    this.ocean.drawSurface(L.surface, p, cam, clock.t, z.shelf, gain, draw);

    const shaftK = clamp01(1 - whale.y / (DARK_START * 2.6));
    this.ocean.drawShafts(L.shafts, p, cam, clock.t, shaftK, draw);
    this.ocean.drawCaustics(L.caustics, p, cam, clock.t, draw);
    this.ocean.drawSnow(L.snow, p, cam, clock.t, ctx.particles.snow, draw);

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
    L.darkGrad.tint = paletteShift(pal.horizon, REF_PAL.horizon, 0.5);

    const df = L.darkFill;
    df.clear();
    if (dBot < VH) {
      const y = Math.max(0, dBot);
      df.rect(0, y, VW, VH - y);
      df.fill({ color: 0x02040a, alpha: 0.64 });
    }

    this.ocean.drawSparks(L.sparks, p, cam, clock.t, draw);

    L.vignette.x = 0;
    L.vignette.y = 0;
    L.vignette.width = VW;
    L.vignette.height = VH;
    L.vignette.alpha = 0.32 + (1 - lightAt(whale.y)) * 0.5;
  }
}
