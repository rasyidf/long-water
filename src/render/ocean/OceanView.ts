/**
 * Draws everything the sea surface owns: the sky dome and its weather, the
 * stylised waterline, and the near-surface light in the column beneath it
 * (sunlit slabs, god-rays, caustics).
 *
 * All the shape math lives in the Pixi-free `sky.ts` / `surface.ts` next door —
 * this file is only the translation from that data into fills and strokes, plus
 * the world→screen mapping. `BackgroundRenderer` owns one of these for the
 * game; the procgen viewer owns another, which is why every entry point takes
 * its params explicitly instead of reaching for globals.
 *
 * Call order matters once per frame: `drawSurface` traces the wave field and
 * caches it, and `drawShafts` / `drawCaustics` reuse that trace.
 *
 * The deep column — haze lenses, the thermocline, marine snow and the sparks
 * of the dark — is the `drawColumn` / `drawSnow` / `drawSparks` trio at the
 * bottom; their math is in `column.ts`.
 */
import type { Graphics } from "pixi.js";

import { lightAt } from "../../core/light";
import { clamp01, hash01, lerp } from "../../core/math";
import type { Camera } from "../../core/Camera";
import type { Snow } from "../../state/Hazards";
import { mixColor } from "../color";
import {
  moteAt,
  murkLens,
  snowMote,
  sparkAt,
  sparkGate,
  thermoclineOffset,
  thermoclineShimmer,
  WRAP,
  type Mote,
  type MurkLens,
  type Spark,
} from "./column";
import type { OceanParams } from "./params";
import {
  birds,
  cloudBanks,
  cloudOutline,
  shaftProfile,
  shaftWisp,
  skyLight,
  skyPalette,
  stars,
  type SkyLight,
  type SkyPalette,
} from "./sky";
import {
  causticCells,
  glints,
  foamRuns,
  surfaceHeightAt,
  traceSurface,
  waveEnvelope,
  type SurfaceSample,
  type WaveParams,
} from "./surface";

/** the named draw blocks, in z order — a designer tool can toggle each one */
export const OCEAN_SECTIONS = [
  "skyDome",
  "stars",
  "disc",
  "clouds",
  "birds",
  "haze",
  "apron",
  "slabs",
  "glitter",
  "foam",
  "spray",
  "shafts",
  "caustics",
  "murk",
  "thermocline",
  "snow",
  "sparks",
] as const;

export type OceanSection = (typeof OCEAN_SECTIONS)[number];

export interface OceanDrawOptions {
  /** designer hook: return false to skip a named block (default: draw it all) */
  show?: (section: OceanSection) => boolean;
}

const ALL = (): boolean => true;

/** brightness buckets the marine snow is filled in (alpha spans 0..1/3) */
const SNOW_BUCKETS = 4;

export class OceanView {
  /** this frame's traced waterline, in world units relative to the waterline */
  private samples: SurfaceSample[] = [];
  /** `p.wave` with the frame's near-surface gain folded into `wind` */
  private scaled: WaveParams | null = null;
  /** the wave field the last `drawSurface` traced, so the god-rays can be
   * rooted on the same surface it drew rather than on a flat sea level */
  private traced: WaveParams | null = null;
  // scratch for the column passes — each is rewritten per item, never grown
  private readonly lens: MurkLens = { x: 0, y: 0, w: 0, h: 0, d: 0, alpha: 0 };
  private readonly mote: Mote = { x: 0, y: 0, d: 0, s: 0, a: 0 };
  /** placed motes for this frame's snow, grown to the level's count once */
  private readonly motes: { x: number; y: number; r: number; b: number }[] = [];
  private readonly spark: Spark = {
    x: 0,
    y: 0,
    d: 0,
    r: 0,
    a: 0,
    color: 0,
  };
  /** reused flat-coordinate buffers for the two cloud silhouette passes */
  private body: number[] = [];
  private lit: number[] = [];

  /** the trace the last `drawSurface` produced, empty when the waterline was
   * off screen — designer overlays read it to plot the field they are tuning */
  get trace(): readonly SurfaceSample[] {
    return this.samples;
  }

  // ── sky ──────────────────────────────────────────────────────────────────

  /**
   * Sky dome, stars, the sun or moon, cloud decks, gulls and the horizon haze,
   * all into one Graphics. Everything is anchored to the waterline so the whole
   * sky slides correctly as the camera rises and falls.
   */
  drawSky(
    g: Graphics,
    p: OceanParams,
    cam: Camera,
    t: number,
    gain = 1,
    opts: OceanDrawOptions = {},
  ): void {
    const show = opts.show ?? ALL;
    g.clear();
    const { vw: VW, vh: VH, scale: sc } = cam;
    const y0 = cam.sy(0);
    const env = waveEnvelope(this.wave(p, gain)) * sc;
    // the drawn sky runs past the deepest trough, so the water sprite's flat
    // top edge never shows through between crests
    const horizon = y0 + env + 30 * sc;
    if (horizon <= 0) return;

    const pal = skyPalette(p.sky.timeOfDay);
    const light = skyLight(p.sky.timeOfDay);

    if (show("skyDome")) {
      // flat bands rather than a baked texture: the palette moves with the
      // time-of-day dial, and at this band count the steps are sub-perceptual
      const BANDS = 44;
      const h = horizon / BANDS;
      for (let i = 0; i < BANDS; i++) {
        const f = i / (BANDS - 1);
        const col =
          f < 0.55
            ? mixColor(pal.top, pal.mid, f / 0.55)
            : mixColor(pal.mid, pal.horizon, (f - 0.55) / 0.45);
        g.rect(0, i * h, VW, h + 1);
        g.fill({ color: col });
      }
    }

    // the visible sky: waterline down to the top of the screen. Floored so a
    // camera sitting just under the surface still gets a sky worth drawing.
    const band = Math.max(140, horizon);

    if (show("stars")) this.drawStars(g, p, cam, t, horizon, band);
    if (show("disc")) this.drawDisc(g, cam, pal, light, horizon, band);
    if (show("clouds"))
      this.drawClouds(g, p, cam, t, pal, light, horizon, band);
    if (show("birds")) this.drawBirds(g, p, cam, t, pal, horizon, band);

    if (show("haze") && p.sky.haze > 0) {
      // warm air stacked on the waterline — the single cheapest cue that the
      // sky has depth rather than being a flat backdrop
      const hh = Math.min(horizon, VH * 0.55) * 0.5;
      const STEPS = 12;
      for (let i = 0; i < STEPS; i++) {
        const f = i / STEPS;
        const yA = horizon - hh * (1 - f);
        g.rect(0, yA, VW, hh / STEPS + 1);
        g.fill({ color: pal.glow, alpha: p.sky.haze * 0.3 * f * f });
      }
    }
  }

  private drawStars(
    g: Graphics,
    p: OceanParams,
    cam: Camera,
    t: number,
    horizon: number,
    band: number,
  ): void {
    // near-fixed: the stars are the furthest thing there is
    const pan = (cam.x * 0.012 * cam.scale) / cam.vw;
    for (const s of stars(p.sky, t, pan, 0.6)) {
      g.circle(cam.vw / 2 + s.u * cam.vw, horizon - s.alt * band, s.r);
      g.fill({ color: 0xe8f0ff, alpha: clamp01(s.k) });
    }
  }

  private drawDisc(
    g: Graphics,
    cam: Camera,
    pal: SkyPalette,
    light: SkyLight,
    horizon: number,
    band: number,
  ): void {
    if (light.altitude < -0.04) return;
    const VW = cam.vw;
    // infinitely distant: pinned to the screen, riding the arc from one side to
    // the other as `timeOfDay` advances
    const px = VW / 2 + light.ax * VW * 0.42;
    const py = horizon - clamp01(light.altitude) * band * 0.88;
    const r = Math.min(VW, cam.vh) * (light.moon ? 0.022 : 0.03);
    // a low sun glows much wider — that flare is the whole read of dawn/dusk
    const flare = 1 + (1 - clamp01(light.altitude)) * 2.6;
    for (let i = 4; i >= 1; i--) {
      g.circle(px, py, r * (1 + i * 1.5 * flare));
      g.fill({ color: pal.glow, alpha: 0.07 / i });
    }
    g.circle(px, py, r);
    g.fill({ color: pal.disc, alpha: 0.95 });
    if (light.moon) {
      // bite a crescent out of it with the sky behind
      g.circle(px + r * 0.5, py - r * 0.28, r * 0.92);
      g.fill({ color: pal.mid, alpha: 0.9 });
    }
  }

  private drawClouds(
    g: Graphics,
    p: OceanParams,
    cam: Camera,
    t: number,
    pal: SkyPalette,
    light: SkyLight,
    horizon: number,
    band: number,
  ): void {
    const VW = cam.vw;
    const decks = Math.max(1, Math.round(p.sky.cloudDecks));
    for (let d = decks - 1; d >= 0; d--) {
      const far = d / Math.max(1, decks - 1);
      // parallax in screen pixels, so the decks separate as the camera tracks
      // but the clouds themselves never resize with zoom
      const pan = (cam.x * lerp(0.055, 0.012, far) * cam.scale) / VW;
      for (const bank of cloudBanks(
        { ...p.sky, cloudDecks: decks },
        d,
        t,
        pan,
        0.75,
      )) {
        const bx = VW / 2 + bank.u * VW;
        const by = horizon - bank.alt * band;
        const a = bank.alpha;
        // shaded body first, then a lit cap shrunk and shifted toward the sun —
        // two flat tones is all a stylised cumulus needs to read as volume
        this.poly(g, cloudOutline(bank.puffs, {}, this.body), bx, by, VW);
        g.fill({ color: pal.cloudBody, alpha: a });
        const cap = cloudOutline(
          bank.puffs,
          { shrink: 0.84, shiftX: -light.ax * 0.012, shiftY: -0.008 },
          this.lit,
        );
        this.poly(g, cap, bx, by, VW);
        g.fill({
          color: pal.cloudLit,
          // an overcast deck shows no sunlit tops — the higher the cover, the
          // flatter the cloud reads, which is most of what "overcast" is
          alpha:
            a * (0.45 + light.daylight * 0.5) * (1 - p.sky.cloudCover * 0.5),
        });
      }
    }
  }

  private drawBirds(
    g: Graphics,
    p: OceanParams,
    cam: Camera,
    t: number,
    pal: SkyPalette,
    horizon: number,
    band: number,
  ): void {
    const VW = cam.vw;
    const pan = (cam.x * 0.14 * cam.scale) / VW;
    for (const b of birds(p.sky, t, pan, 0.6)) {
      const px = VW / 2 + b.u * VW;
      const py = horizon - b.alt * band;
      const s = b.span * VW;
      if (s < 1.2) continue;
      const rise = b.flap * s * 0.55;
      g.moveTo(px - s, py - rise);
      g.lineTo(px, py);
      g.lineTo(px + s * b.dir * 0.9, py - rise * 0.9);
      g.stroke({
        width: Math.max(1, s * 0.12),
        color: pal.cloudBody,
        alpha: 0.55,
        cap: "round",
        join: "round",
      });
    }
  }

  // ── surface ──────────────────────────────────────────────────────────────

  /**
   * The waterline: an opaque apron sealing the water sprite's straight top
   * edge, stacked sunlit slabs under it, sun glitter, and broken whitecaps on
   * the crests the wave field says are breaking.
   *
   * `water` is the zone's own surface colour; it is nudged toward the sky's
   * time-of-day tint so a night sea doesn't sit under a night sky still lit
   * like noon.
   */
  drawSurface(
    g: Graphics,
    p: OceanParams,
    cam: Camera,
    t: number,
    water: number,
    gain = 1,
    opts: OceanDrawOptions = {},
  ): void {
    const show = opts.show ?? ALL;
    g.clear();
    const { vw: VW, scale: sc } = cam;
    const y0 = cam.sy(0);
    const wave = this.wave(p, gain);
    const pal = skyPalette(p.sky.timeOfDay);
    const light = skyLight(p.sky.timeOfDay);
    const surf = mixColor(water, pal.water, 0.35);
    const env = waveEnvelope(wave);
    const ampPx = env * sc;

    this.traced = wave;
    if (y0 < -160 - ampPx || y0 > cam.vh + 80) {
      this.samples.length = 0;
      return;
    }

    // trace across the viewport plus a margin, at roughly one sample per 14
    // world units so the shortest octave and the chop both survive
    const margin = 60 / sc + env;
    const [vx0, vx1] = cam.visibleX(margin);
    const n = Math.round(Math.min(460, Math.max(96, (vx1 - vx0) / 14)));
    const s = traceSurface(wave, vx0, vx1, n, t, this.samples);

    const px = (i: number): number => cam.sx(s[i].x);
    const py = (i: number): number => y0 + s[i].y * sc;
    const traceTop = (dy = 0): void => {
      g.moveTo(px(0), py(0) + dy);
      for (let i = 1; i < s.length; i++) g.lineTo(px(i), py(i) + dy);
    };
    const traceBand = (depth: number): void => {
      traceTop();
      for (let i = s.length - 1; i >= 0; i--) g.lineTo(px(i), py(i) + depth);
      g.closePath();
    };

    if (show("apron")) {
      traceBand(ampPx + 90 * sc);
      g.fill({ color: surf });
    }

    if (show("slabs")) {
      // sunlit near-surface layers, each dimmer and deeper, so the lit band
      // dissolves into the column instead of ending on a hard line
      const lit = mixColor(surf, pal.glow, 0.3 + light.daylight * 0.22);
      const n2 = Math.max(0, Math.round(p.column.slabs));
      // One tier per dial step. Every slab is a full-width translucent fill
      // over the whole sunlit band, so subdividing the stack to hide the
      // steps (roadmap #4) tripled the overdraw and cost real frame time on
      // integrated GPUs — a gradient fill is the right fix, not more tiers.
      for (let k = 0; k < n2; k++) {
        const f = (k + 1) / n2;
        // purely world-scaled, so `slabDepth` means the depth it says it does
        traceBand((p.column.slabDepth * f * f + 30) * sc);
        g.fill({
          color: lit,
          // the sunlit band is sunlight: it has to go out with the sun
          alpha:
            p.column.slabAlpha *
            Math.pow(1 - k / (n2 + 0.6), 2.1) *
            (0.2 + light.daylight * 0.8),
        });
      }
    }

    if (show("glitter") && p.sky.glitter > 0 && light.daylight > 0.05) {
      // the specular path back to the sun: short flat dashes on the facets
      // whose tilt happens to mirror it
      const sunX = cam.x + light.ax * (VW / 2 / sc) * 0.9;
      const spread = (VW / sc) * 0.55;
      for (const gl of glints(
        s,
        sunX,
        light.lean,
        spread,
        p.sky.glitter * light.daylight,
        t,
      )) {
        const i = gl.at;
        const w = (1.5 + gl.k * 3) * sc + 0.5;
        g.moveTo(px(i) - w, py(i));
        g.lineTo(px(i) + w, py(i));
        g.stroke({
          width: 1 + gl.k * 1.6 * sc,
          color: pal.disc,
          alpha: clamp01(gl.k) * 0.85,
          cap: "round",
        });
      }
    }

    // Two threads along the whole crest so the waterline reads even on a flat
    // calm: a dark one just under the film, then a pale one on it. The shadow
    // is what separates sea from sky when the two palettes sit close together,
    // which they do at most hours.
    traceTop(2.5 * sc + 1);
    g.stroke({
      width: 1.5 + 1.2 * sc,
      color: mixColor(surf, 0x04121a, 0.45),
      alpha: 0.4,
      cap: "round",
      join: "round",
    });
    traceTop();
    g.stroke({
      width: 1 + 0.8 * sc,
      color: mixColor(0xcfe6e2, pal.glow, 0.3),
      alpha: 0.34,
      cap: "round",
      join: "round",
    });

    const runs = show("foam") || show("spray") ? foamRuns(s) : [];

    if (show("foam")) {
      for (const run of runs) {
        // a breaking lip: the crest line lifted slightly, with a body hanging
        // below it, so a whitecap has thickness rather than being a stroke
        const capPx = 4 * sc + 3;
        g.moveTo(px(run.from), py(run.from));
        for (let i = run.from; i <= run.to; i++)
          g.lineTo(px(i), py(i) - s[i].foam * capPx * 0.6);
        for (let i = run.to; i >= run.from; i--)
          g.lineTo(px(i), py(i) + s[i].foam * capPx * 1.6);
        g.closePath();
        g.fill({ color: 0xe8f5f1, alpha: 0.22 + run.peak * 0.5 });

        g.moveTo(px(run.from), py(run.from));
        for (let i = run.from + 1; i <= run.to; i++) g.lineTo(px(i), py(i));
        g.stroke({
          width: (1 + run.peak * 2.4) * sc + 1,
          color: 0xffffff,
          alpha: 0.3 + run.peak * 0.45,
          cap: "round",
          join: "round",
        });
      }
    }

    if (show("spray")) {
      for (const run of runs) {
        if (run.peak < 0.42) continue;
        const mid = (run.from + run.to) >> 1;
        const drops = 2 + Math.round(run.peak * 5);
        for (let k = 0; k < drops; k++) {
          // keyed off the crest's world x, so the spray travels with the wave
          const h = hash01(Math.round(s[mid].x * 0.25) * 31 + k * 7);
          const h2 = hash01(Math.round(s[mid].x * 0.25) * 17 + k * 13);
          const spread = (run.to - run.from) * 0.5;
          const i = Math.max(
            0,
            Math.min(s.length - 1, mid + Math.round((h - 0.5) * spread)),
          );
          const rise = (4 + h2 * 16) * run.peak * sc + 2;
          g.circle(
            px(i) + (h2 - 0.5) * 6 * sc,
            py(i) - rise,
            Math.max(0.6, (0.8 + h * 1.4) * sc),
          );
          g.fill({ color: 0xffffff, alpha: (0.2 + h2 * 0.3) * run.peak });
        }
      }
    }
  }

  // ── column ───────────────────────────────────────────────────────────────

  /**
   * God-rays. Each shaft draws its width, drift, length and intensity from a
   * hash of its world index, so the field never reads as one stamp repeated
   * across the screen, and every shaft is split into segments whose alpha
   * follows `shaftProfile` times an fbm wisp — fading in under the surface,
   * breaking up along the way, and tapering to nothing with depth.
   */
  drawShafts(
    g: Graphics,
    p: OceanParams,
    cam: Camera,
    t: number,
    depthK: number,
    opts: OceanDrawOptions = {},
  ): void {
    g.clear();
    const show = opts.show ?? ALL;
    const light = skyLight(p.sky.timeOfDay);
    const k = depthK * p.column.shaftStrength * light.daylight;
    const y0 = cam.sy(0);
    if (!show("shafts") || k <= 0.02 || y0 > cam.vh) return;

    const sc = cam.scale;
    const step = Math.max(80, p.column.shaftSpacing);
    const halfW = cam.vw / 2 / sc;
    const i0 = Math.floor((cam.x - halfW) / step) - 1;
    const i1 = Math.ceil((cam.x + halfW) / step) + 1;
    const pal = skyPalette(p.sky.timeOfDay);
    const col = mixColor(0x78d6c8, pal.glow, 0.35);
    // root each ray on the wave the waterline was drawn from, so its top rides
    // the crests and troughs instead of sitting on a flat sea level
    const wave = this.traced ?? p.wave;
    for (let i = i0; i <= i1; i++) {
      const r = hash01(i);
      const r2 = hash01(i * 2 + 101);
      const r3 = hash01(i * 3 + 977);
      const wx = i * step + (r - 0.5) * step * 0.8;
      const drift = Math.sin(t * (0.14 + r2 * 0.22) + i * 1.7) * (30 + r3 * 55);
      const x0 = cam.sx(wx) + drift * sc;
      const y0 = cam.sy(surfaceHeightAt(wave, wx + drift, t));
      const topW = (22 + r * 46) * sc;
      const len = (1200 + r3 * 1100) * sc;
      const lean = light.lean * len * (0.7 + r2 * 0.6);
      const peak = (0.03 + r * 0.055) * k;
      const SEG = 8;
      for (let sIdx = 0; sIdx < SEG; sIdx++) {
        const ta = sIdx / SEG;
        const tb = (sIdx + 1) / SEG;
        const xa = x0 + lean * ta;
        const xb = x0 + lean * tb;
        const wa = topW * (1 + ta * 1.8);
        const wb = topW * (1 + tb * 1.8);
        const wisp = lerp(
          1,
          shaftWisp(p.sky.seed, i, ta, t),
          p.column.shaftWisp,
        );
        g.moveTo(xa - wa, y0 + len * ta);
        g.lineTo(xa + wa, y0 + len * ta);
        g.lineTo(xb + wb, y0 + len * tb);
        g.lineTo(xb - wb, y0 + len * tb);
        g.closePath();
        g.fill({
          color: col,
          alpha: peak * (shaftProfile(ta) + shaftProfile(tb)) * 0.5 * wisp,
        });
      }
    }
  }

  /**
   * Caustics, taken from the *same* trace the waterline was drawn from: light
   * focuses under the concave stretches of the surface, so the bright filaments
   * stay locked to the troughs overhead instead of sliding on their own clock.
   * Must be called after `drawSurface` in the same frame.
   */
  drawCaustics(
    g: Graphics,
    p: OceanParams,
    cam: Camera,
    t: number,
    opts: OceanDrawOptions = {},
  ): void {
    g.clear();
    const show = opts.show ?? ALL;
    const light = skyLight(p.sky.timeOfDay);
    const k = p.column.causticStrength * light.daylight;
    const y0 = cam.sy(0);
    if (!show("caustics") || k <= 0.02 || this.samples.length < 3) return;
    if (y0 > cam.vh || y0 < -400) return;

    const sc = cam.scale;
    const cells = causticCells(p.wave, this.samples, t, k);
    const pal = skyPalette(p.sky.timeOfDay);
    const col = mixColor(0x92e8dc, pal.disc, 0.2);
    // each focus is drawn twice, a soft wide pass under a bright core, raked
    // along the light direction by its own depth
    for (const c of cells) {
      const cx = cam.sx(c.x + light.lean * c.depth);
      const cy = cam.sy(c.depth + Math.sin(c.x * 0.01 + t * 1.3) * 5);
      const half = c.half * sc + 1;
      for (const [w, a] of [
        [3.5, 0.3],
        [1.2, 0.85],
      ] as const) {
        g.moveTo(cx - half, cy);
        g.lineTo(cx + half, cy + 2 * sc);
        g.stroke({
          width: w * sc + 0.4,
          color: col,
          alpha: c.k * 0.55 * a,
          cap: "round",
        });
      }
    }
  }
  // ── deep column ──────────────────────────────────────────────────────────

  /**
   * The body of the water: drifting lenses of suspended silt, and the
   * thermocline — a faint shimmering seam where the warm surface layer sits on
   * the cold water under it. Both are palette-aware so a night column doesn't
   * carry midday haze.
   */
  drawColumn(
    g: Graphics,
    p: OceanParams,
    cam: Camera,
    t: number,
    opts: OceanDrawOptions = {},
  ): void {
    g.clear();
    const show = opts.show ?? ALL;
    const { vw: VW, vh: VH, scale: sc } = cam;
    const w = p.water;
    const pal = skyPalette(p.sky.timeOfDay);
    const light = skyLight(p.sky.timeOfDay);
    const worldY = (py: number): number => cam.y + (py - VH / 2) / sc;

    if (show("murk") && w.murk > 0.01) {
      // silt catches the light: a pale lens near the surface, hardly there in
      // the dark. One ellipse per lens — each is a screen-sized translucent
      // fill, so lens count is the fill-rate budget here; the soft edge comes
      // from the low alpha and the lenses overlapping, not from nesting.
      const col = mixColor(pal.water, pal.glow, 0.25 + light.daylight * 0.2);
      const n = Math.round(w.murk * 14);
      for (let i = 0; i < n; i++) {
        const L = murkLens(i, p.wave.seed, cam.x, cam.y, t, w, this.lens);
        const px = (L.x - WRAP / 2) * sc + VW / 2;
        const py = (L.y - WRAP / 2) * sc + VH / 2;
        const rw = L.w * sc;
        const rh = L.h * sc;
        if (px + rw < 0 || px - rw > VW || py + rh < 0 || py - rh > VH)
          continue;
        // silt lives in the water: fade a lens out as it nears the waterline
        // so the column layer never paints haze over the sky
        const wy = worldY(py);
        const a =
          L.alpha * (0.25 + 0.75 * lightAt(wy)) * clamp01((wy - L.h) / 220);
        if (a < 0.004) continue;
        g.ellipse(px, py, rw, rh);
        g.fill({ color: col, alpha: a });
      }
    }

    if (show("thermocline") && w.thermoclineStrength > 0.01) {
      const yc = cam.sy(w.thermoclineDepth);
      const band = 34 * sc;
      if (yc + band * 3 > 0 && yc - band * 3 < VH) {
        // the seam is a lens too: denser water below reads a shade darker,
        // with a bright thread along the rippled top where light refracts
        const [vx0, vx1] = cam.visibleX(60 / sc);
        // 24 segments: each costs three fbm samples and its own capped stroke
        const N = 24;
        const k = clamp01(w.thermoclineStrength);
        const dark = mixColor(pal.water, 0x03111c, 0.5);
        const bright = mixColor(pal.water, pal.glow, 0.5);
        const xAt = (i: number): number => vx0 + ((vx1 - vx0) * i) / N;
        const top = (i: number): number =>
          cam.sy(w.thermoclineDepth + thermoclineOffset(xAt(i), t, w));
        const bot = (i: number): number =>
          cam.sy(
            w.thermoclineDepth +
              thermoclineOffset(xAt(i) + 700, t * 0.8, w) * 0.7,
          ) + band;
        g.moveTo(cam.sx(xAt(0)), top(0));
        for (let i = 1; i <= N; i++) g.lineTo(cam.sx(xAt(i)), top(i));
        for (let i = N; i >= 0; i--) g.lineTo(cam.sx(xAt(i)), bot(i));
        g.closePath();
        g.fill({ color: dark, alpha: 0.06 * k });
        // the thread is stroked a segment at a time, each at its own shimmer,
        // so the light along the seam flickers instead of ruling a line
        const threadA = 0.16 * k * (0.35 + 0.65 * light.daylight);
        for (let i = 0; i < N; i++) {
          const sh = thermoclineShimmer(xAt(i), t);
          if (sh < 0.05) continue;
          g.moveTo(cam.sx(xAt(i)), top(i));
          g.lineTo(cam.sx(xAt(i + 1)), top(i + 1));
          g.stroke({
            width: 1 + 1.2 * sc,
            color: bright,
            alpha: threadA * sh,
            cap: "round",
          });
        }
      }
    }
  }

  /**
   * Marine snow: the level's motes, sinking and drifting on the current, drawn
   * as soft round specks whose size and brightness follow their parallax depth.
   * `snowDensity` above one invents extra motes from a hash; below one it
   * simply draws fewer of the store's.
   */
  drawSnow(
    g: Graphics,
    p: OceanParams,
    cam: Camera,
    t: number,
    snow: readonly Snow[],
    opts: OceanDrawOptions = {},
  ): void {
    g.clear();
    const show = opts.show ?? ALL;
    const w = p.water;
    if (!show("snow") || w.snowDensity <= 0) return;
    const { vw: VW, vh: VH, scale: sc } = cam;
    const n = Math.round(snow.length * Math.min(2, w.snowDensity));
    const pal = skyPalette(p.sky.timeOfDay);
    const col = mixColor(0xded6c6, pal.water, 0.2);
    const surfY = cam.sy(0);
    // Place every visible mote first, then fill them in a few brightness
    // buckets: one `fill()` per bucket instead of one per mote keeps the
    // Graphics instruction list (and its per-frame batching) short.
    const pool = this.motes;
    while (pool.length < n) pool.push({ x: 0, y: 0, r: 0, b: 0 });
    let m = 0;
    for (let i = 0; i < n; i++) {
      const mt =
        i < snow.length
          ? moteAt(snow[i], i, cam.x, cam.y, t, w, this.mote)
          : snowMote(i, p.wave.seed, cam.x, cam.y, t, w, this.mote);
      const px = (mt.x - WRAP / 2) * sc + VW / 2;
      const py = (mt.y - WRAP / 2) * sc + VH / 2;
      if (px < -5 || px > VW + 5 || py < -5 || py > VH + 5) continue;
      // snow is in the water, not the air — nothing above the waterline
      if (py < surfY) continue;
      const o = pool[m++];
      o.x = px;
      o.y = py;
      // screen-sized, like dust on the lens: the near motes are the big ones
      o.r = mt.s * (0.7 + 0.7 * mt.d) * w.snowSize;
      o.b = Math.min(SNOW_BUCKETS - 1, Math.floor(mt.a * SNOW_BUCKETS * 3));
    }
    for (let b = 0; b < SNOW_BUCKETS; b++) {
      let any = false;
      for (let i = 0; i < m; i++) {
        const o = pool[i];
        if (o.b !== b) continue;
        g.circle(o.x, o.y, o.r);
        any = true;
      }
      if (any) g.fill({ color: col, alpha: (b + 0.5) / (SNOW_BUCKETS * 3) });
    }
  }

  /**
   * Bioluminescence: sparse plankton flashes that only live below the light
   * line. Drawn into an additive layer as a wide faint halo under a small
   * bright core, gated per spark on the ambient light at its world depth.
   */
  drawSparks(
    g: Graphics,
    p: OceanParams,
    cam: Camera,
    t: number,
    opts: OceanDrawOptions = {},
  ): void {
    g.clear();
    const show = opts.show ?? ALL;
    const w = p.water;
    if (!show("sparks") || w.sparks <= 0.01) return;
    const { vw: VW, vh: VH, scale: sc } = cam;
    // nothing to do if the whole screen is in the light
    if (sparkGate(cam.y + VH / 2 / sc) <= 0.001) return;
    const n = Math.round(w.sparks * 70);
    for (let i = 0; i < n; i++) {
      const s = sparkAt(i, p.wave.seed, cam.x, cam.y, t, w, this.spark);
      if (s.a < 0.02) continue;
      const px = (s.x - WRAP / 2) * sc + VW / 2;
      const py = (s.y - WRAP / 2) * sc + VH / 2;
      if (px < -8 || px > VW + 8 || py < -8 || py > VH + 8) continue;
      const gate = sparkGate(cam.y + (py - VH / 2) / sc);
      const a = s.a * gate;
      if (a < 0.02) continue;
      const r = s.r * w.sparkSize * (0.7 + 0.3 * s.d);
      g.circle(px, py, r * 3.2);
      g.fill({ color: s.color, alpha: a * 0.14 });
      g.circle(px, py, r);
      g.fill({ color: s.color, alpha: a * 0.85 });
    }
  }

  // ── internals ────────────────────────────────────────────────────────────

  /** trace a flat `[x, y, …]` outline in sky space as one closed path */
  private poly(
    g: Graphics,
    pts: readonly number[],
    ox: number,
    oy: number,
    scale: number,
  ): void {
    if (pts.length < 6) return;
    g.moveTo(ox + pts[0] * scale, oy + pts[1] * scale);
    for (let i = 2; i < pts.length; i += 2)
      g.lineTo(ox + pts[i] * scale, oy + pts[i + 1] * scale);
    g.closePath();
  }

  /** `p.wave` with the frame's amplitude gain folded in, reusing one object */
  private wave(p: OceanParams, gain: number): WaveParams {
    if (gain === 1) return p.wave;
    const w = (this.scaled ??= { ...p.wave });
    Object.assign(w, p.wave);
    w.wind = p.wave.wind * gain;
    return w;
  }
}
