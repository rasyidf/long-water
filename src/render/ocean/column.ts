/**
 * Pure procgen for the water column behind everything — the part of the ocean
 * that used to be a baked gradient with square specks on it. Depth colour
 * absorption, drifting haze lenses, the thermocline shimmer, marine snow and
 * the bioluminescent sparks of the deep all come from here; `OceanView` only
 * turns the numbers into fills.
 *
 * Every function is deterministic in `(seed, index, t)` and writes into a
 * caller-owned struct, so the view can run a few hundred of them a frame with
 * no garbage, and every one is unit-testable (see `column.test.ts`).
 */
import { DARK_FULL } from "../../config/constants";
import { lightAt } from "../../core/light";
import { clamp01, hash01, smoothstep } from "../../core/math";
import { fbm01, fbm1, fbm2 } from "../../core/noise";
import type { Snow } from "../../state/Hazards";
import { mixColor } from "../color";

/** the screen-wrapped field tile every drifting mote / lens / spark lives in;
 * matches the snow spawner's default area so the store's motes tile cleanly */
export const WRAP = 4000;

/** the water column's own dials — see `OCEAN_DEFAULTS.water` for the tuning */
export interface WaterParams {
  /** 0..1 how many drifting haze lenses hang in the column */
  murk: number;
  /** world units across a typical lens */
  murkScale: number;
  /** world units per second the haze drifts sideways */
  murkDrift: number;
  /** 0..1 depth colour absorption — reds drop out first, the hue cools */
  absorption: number;
  /** world y of the thermocline shimmer band */
  thermoclineDepth: number;
  /** 0..1 how visible the shimmer band is */
  thermoclineStrength: number;
  /** 0..2 multiplier on the level's marine-snow count */
  snowDensity: number;
  /** multiplier on mote radius */
  snowSize: number;
  /** world units per second the snow sinks */
  snowDrift: number;
  /** world units per second of horizontal drift, fbm-modulated */
  current: number;
  /** 0..1 density of bioluminescent sparks below the light line */
  sparks: number;
  /** multiplier on spark radius */
  sparkSize: number;
  /** seconds for a full day in play; 0 freezes the sky at `sky.timeOfDay` */
  dayLength: number;
}

// ── depth colour ───────────────────────────────────────────────────────────

/** per-channel attenuation per `DARK_FULL` of depth at full absorption: red
 * is gone long before blue has noticeably dimmed, which is the one cue that
 * reads as "real water" more than anything else */
const ABSORB_R = 1.7;
const ABSORB_G = 0.75;
const ABSORB_B = 0.28;

/**
 * `base` seen through `y` world units of water. Identity at the surface and
 * at zero absorption; monotonically darker and bluer with depth otherwise.
 */
export function waterTint(base: number, y: number, absorption: number): number {
  if (y <= 0 || absorption <= 0) return base;
  const d = (y / DARK_FULL) * clamp01(absorption);
  const r = ((base >> 16) & 255) * Math.exp(-ABSORB_R * d);
  const g = ((base >> 8) & 255) * Math.exp(-ABSORB_G * d);
  const b = (base & 255) * Math.exp(-ABSORB_B * d);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** channel-wise product of two tints (a Pixi `tint` stack) */
export function mulColor(a: number, b: number): number {
  const r = Math.round((((a >> 16) & 255) * ((b >> 16) & 255)) / 255);
  const g = Math.round((((a >> 8) & 255) * ((b >> 8) & 255)) / 255);
  const bl = Math.round(((a & 255) * (b & 255)) / 255);
  return (r << 16) | (g << 8) | bl;
}

/**
 * A tint that carries the hue shift from `ref` to `cur` — white when the two
 * match, so the column keeps its shipped look at the hour it was tuned at and
 * only follows the sky when the sky itself has moved. Ratios above one are
 * clamped (a tint can't brighten), and `k` eases the whole shift back.
 */
export function paletteShift(cur: number, ref: number, k = 1): number {
  const ch = (shift: number): number => {
    const c = (cur >> shift) & 255;
    const r = (ref >> shift) & 255;
    const ratio = r === 0 ? 1 : Math.min(1, c / r);
    return Math.round(255 * (1 + (ratio - 1) * clamp01(k)));
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// ── haze lenses ────────────────────────────────────────────────────────────

export interface MurkLens {
  /** tile coords in [0, WRAP), already camera-parallaxed and wrapped */
  x: number;
  y: number;
  /** semi-axes in world units */
  w: number;
  h: number;
  /** 0..1 parallax depth (0 far, 1 near) */
  d: number;
  alpha: number;
}

const wrap = (v: number): number => ((v % WRAP) + WRAP) % WRAP;

/**
 * Lens `i` of the haze field: a flat ellipse of suspended silt that drifts
 * with the current and slowly breathes. Deterministic in `(i, seed)`; the
 * camera is folded in here so the view can treat the result as a tile coord.
 */
export function murkLens(
  i: number,
  seed: number,
  camX: number,
  camY: number,
  t: number,
  p: WaterParams,
  out: MurkLens,
): MurkLens {
  const h1 = hash01(i * 3 + seed);
  const h2 = hash01(i * 7 + 19 + seed);
  const h3 = hash01(i * 11 + 43 + seed);
  const h4 = hash01(i * 13 + 71 + seed);
  out.d = 0.25 + 0.6 * h3;
  const par = 0.45 + out.d * 0.45;
  // a slow wander on top of the steady drift, so no two lenses move in step
  const wob = fbm2(seed + 501, i * 0.37 + t * 0.03, h2 * 9, { octaves: 2 });
  const dx = p.murkDrift * t * (0.6 + 0.6 * out.d) + wob * p.murkScale * 0.4;
  const dy = Math.sin(t * (0.05 + h4 * 0.05) + i * 2.1) * p.murkScale * 0.1;
  out.x = wrap(h1 * WRAP + dx - camX * par);
  out.y = wrap(h2 * WRAP + dy - camY * par);
  const breathe = 0.85 + 0.15 * Math.sin(t * (0.07 + h1 * 0.08) + i);
  out.w = p.murkScale * (0.55 + 0.9 * h4) * breathe;
  out.h = out.w * (0.16 + 0.18 * h3);
  out.alpha = clamp01(p.murk) * (0.08 + 0.1 * h2) * (0.5 + 0.5 * out.d);
  return out;
}

// ── marine snow ────────────────────────────────────────────────────────────

export interface Mote {
  /** tile coords in [0, WRAP), already camera-parallaxed and wrapped */
  x: number;
  y: number;
  /** 0..1 parallax depth (0 far, 1 near) */
  d: number;
  /** screen radius multiplier (the view scales it by `snowSize`) */
  s: number;
  /** 0..1 brightness, twinkle folded in */
  a: number;
}

const scratchSnow: Snow = { x: 0, y: 0, s: 1, d: 0.5 };

/**
 * Where the level's mote `base` is right now: sinking at `snowDrift`, pushed
 * sideways by an fbm current, catching the light a little as it turns. The
 * parallax is folded in here (near motes track the camera more) so the view
 * only has to map the tile onto the screen.
 */
export function moteAt(
  base: Snow,
  i: number,
  camX: number,
  camY: number,
  t: number,
  p: WaterParams,
  out: Mote,
): Mote {
  const d = base.d;
  const par = 0.55 + d * 0.45;
  // the current is one field every mote reads at its own row, so neighbours
  // drift together and the column reads as water moving rather than confetti.
  // A single octave: this runs once per mote per frame, a few hundred times.
  const cur =
    p.current *
    (0.4 + 0.6 * d) *
    (0.6 + 0.8 * fbm1(977, base.y * 0.0012 + t * 0.02, { octaves: 1 }));
  const sway = Math.sin(t * (0.5 + hash01(i) * 0.4) + i) * 6 * d;
  out.x = wrap(base.x + cur * t + sway - camX * par);
  out.y = wrap(base.y + t * p.snowDrift * d - camY * par);
  out.d = d;
  out.s = base.s;
  out.a = clamp01(
    (0.09 + d * 0.15) *
      (0.75 + 0.25 * Math.sin(t * (1.1 + hash01(i * 5) * 1.6) + i * 1.7)),
  );
  return out;
}

/** a mote invented from a hash, for when the dial asks for more than the
 * level placed */
export function snowMote(
  i: number,
  seed: number,
  camX: number,
  camY: number,
  t: number,
  p: WaterParams,
  out: Mote,
): Mote {
  scratchSnow.x = hash01(i * 3 + seed) * WRAP;
  scratchSnow.y = hash01(i * 7 + 5 + seed) * WRAP;
  scratchSnow.s = 0.4 + hash01(i * 11 + 9 + seed) * 1.2;
  scratchSnow.d = 0.35 + hash01(i * 13 + 17 + seed) * 0.65;
  return moteAt(scratchSnow, i, camX, camY, t, p, out);
}

// ── bioluminescence ────────────────────────────────────────────────────────

export interface Spark {
  /** tile coords in [0, WRAP), already camera-parallaxed and wrapped */
  x: number;
  y: number;
  /** 0..1 parallax depth */
  d: number;
  /** radius in screen px before `sparkSize` */
  r: number;
  /** 0..1 bloom envelope right now */
  a: number;
  color: number;
}

/** 0..1 how deep into the dark `y` is: nothing above `DARK_START`, everything
 * from `DARK_FULL` down. Runs through `lightAt`, so the flat-lit dev tools
 * switch the sparks off along with the rest of the depth falloff. */
export const sparkGate = (y: number): number => 1 - clamp01(lightAt(y) / 0.45);

/** the on/off envelope of one spark: dark most of the cycle, a quick bloom,
 * then a slow fade — the rhythm of a plankton flash rather than a blink */
export function sparkEnvelope(u: number): number {
  const f = ((u % 1) + 1) % 1;
  return smoothstep(0, 0.08, f) * (1 - smoothstep(0.14, 0.42, f));
}

/**
 * Spark `i`: a plankton flash in the deep, drifting with the current, blooming
 * on its own slow clock. Gate the result on `sparkGate(worldY)` before drawing.
 */
export function sparkAt(
  i: number,
  seed: number,
  camX: number,
  camY: number,
  t: number,
  p: WaterParams,
  out: Spark,
): Spark {
  const h1 = hash01(i * 3 + 1 + seed);
  const h2 = hash01(i * 7 + 23 + seed);
  const h3 = hash01(i * 11 + 47 + seed);
  const h4 = hash01(i * 13 + 91 + seed);
  out.d = 0.5 + 0.5 * h3;
  const par = 0.6 + out.d * 0.4;
  const drift = p.current * 0.5 * t + Math.sin(t * 0.3 + i) * 4;
  out.x = wrap(h1 * WRAP + drift - camX * par);
  out.y = wrap(h2 * WRAP + Math.sin(t * 0.21 + i * 1.3) * 5 - camY * par);
  const period = 3.5 + h4 * 6;
  out.a = sparkEnvelope(t / period + h1 * 7);
  out.r = 0.9 + h3 * 1.6;
  out.color = mixColor(0x5fe6ff, 0x8f9dff, h2);
  return out;
}

// ── thermocline ────────────────────────────────────────────────────────────

/** peak ripple displacement in world units at full strength */
export const THERMO_AMP = 44;

/** vertical ripple of the thermocline edge at world `x`: a slow, long fbm
 * wave that reads as a layer of denser water being nudged by the current */
export function thermoclineOffset(
  x: number,
  t: number,
  p: WaterParams,
): number {
  if (p.thermoclineStrength <= 0) return 0;
  const n = fbm1(4242, x * 0.0016 + t * 0.045, { octaves: 3 });
  return n * THERMO_AMP * clamp01(p.thermoclineStrength);
}

/** 0..1 how much of the thermocline's bright thread shows at world `x` — an
 * fbm gate drifting the other way from the ripple, so the seam reads as
 * refraction flickering along a layer rather than as one ruled line */
export function thermoclineShimmer(x: number, t: number): number {
  return clamp01(
    0.15 +
      0.85 * fbm01(4343, x * 0.0035 - t * 0.09, 0.5, { octaves: 2 }) ** 1.6,
  );
}
