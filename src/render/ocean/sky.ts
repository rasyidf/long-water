/**
 * Pure procgen for everything above the waterline — palette, sun/moon arc,
 * cloud banks, stars and birds. No Pixi: each function returns plain shape data
 * that `OceanView` fills, so the fields are unit-testable and the procgen
 * viewer drives exactly what the game draws.
 *
 * The sky is keyed off one dial, `timeOfDay` (0 = midnight, 0.25 = sunrise,
 * 0.5 = noon, 0.75 = sunset). Palette, star visibility, haze warmth and the
 * direction the god-rays lean all fall out of it, so the whole above-water
 * scene stays internally consistent at any hour.
 *
 * ## Sky space
 *
 * Clouds, stars and gulls are a backdrop, not world objects: they sit far
 * enough away that camera zoom should not resize them and the sky should stay
 * framed however close the camera is to the water. So they live in **sky
 * space** rather than world units —
 *
 * - `u` is horizontal, in viewport widths, 0 at the centre of the screen. The
 *   caller pans it (`pan`) by the camera's own motion times a small parallax
 *   factor, which is what gives the decks their depth.
 * - `alt` is vertical, 0 on the waterline and 1 at the top of the visible sky.
 * - every radius and offset is also in viewport widths, so a bank keeps its
 *   proportions on any canvas.
 *
 * Trying to place these in world units puts them metres above a sea the camera
 * is only ever a few metres from — they end up off the top of the screen.
 */
import { clamp01, lerp, smoothstep } from "../../core/math";
import { fbm01, fbm2, perlin1 } from "../../core/noise";
import { mixColor } from "../color";

export interface SkyParams {
  seed: number;
  /** 0..1 through a full day; 0.25 sunrise, 0.5 noon, 0.75 sunset */
  timeOfDay: number;
  /** 0..1 how much of the sky carries cloud */
  cloudCover: number;
  /** width of one cloud bank, in viewport widths */
  cloudScale: number;
  /** 0..1: 1 = tall round cumulus, 0 = flat drawn-out streaks */
  cloudPuff: number;
  /** drift of the nearest deck, in viewport widths per minute (further decks
   * drift slower); negative blows the other way */
  cloudDrift: number;
  /** how many parallax cloud decks to stack */
  cloudDecks: number;
  /** where the base of the nearest deck sits, 0 = waterline, 1 = top of sky */
  cloudBase: number;
  /** 0..1 star density */
  stars: number;
  /** 0..1 strength of the warm haze band sitting on the horizon */
  haze: number;
  /** 0..1 how much sun glitter dances on the crests */
  glitter: number;
  /** gulls per viewport width */
  birds: number;
}

export interface SkyPalette {
  /** top of the sky dome */
  top: number;
  /** mid-sky */
  mid: number;
  /** the band meeting the water */
  horizon: number;
  /** the disc itself */
  disc: number;
  /** glow ringing the disc, and the haze on the horizon */
  glow: number;
  /** sunlit faces of a cloud */
  cloudLit: number;
  /** shaded body of a cloud */
  cloudBody: number;
  /** tint mixed into foam and the sunlit water slabs */
  water: number;
}

interface Key extends SkyPalette {
  at: number;
}

/**
 * Palette keyframes around the day. `0.54` (the default hour) is tuned to the
 * blue→teal sky the game shipped with, so the dial adds range without moving
 * the look everything else was art-directed against.
 */
const KEYS: readonly Key[] = [
  {
    at: 0,
    top: 0x050a18,
    mid: 0x091529,
    horizon: 0x15283c,
    disc: 0xdfe8f2,
    glow: 0x4a6c8c,
    cloudLit: 0x2c3e56,
    cloudBody: 0x141f31,
    water: 0x18323f,
  },
  {
    at: 0.24,
    top: 0x27335c,
    mid: 0x6c5474,
    horizon: 0xdc8e63,
    disc: 0xffd9a0,
    glow: 0xe8a165,
    cloudLit: 0xf0b98c,
    cloudBody: 0x5a4a5e,
    water: 0x3a5560,
  },
  {
    at: 0.38,
    top: 0x1e3f68,
    mid: 0x3f6f8c,
    horizon: 0x93bcbd,
    disc: 0xfff3d2,
    glow: 0xc8dcd4,
    cloudLit: 0xeef4ef,
    cloudBody: 0x7d93a0,
    water: 0x2f6076,
  },
  {
    at: 0.54,
    top: 0x21344a,
    mid: 0x35637a,
    horizon: 0x4b8088,
    disc: 0xfff8e4,
    glow: 0xbfe0d8,
    cloudLit: 0xe9f2ec,
    cloudBody: 0x6d8a95,
    water: 0x17546f,
  },
  {
    at: 0.72,
    top: 0x22335a,
    mid: 0x70546f,
    horizon: 0xd88a5c,
    disc: 0xffc98c,
    glow: 0xe0915c,
    cloudLit: 0xf3ab7c,
    cloudBody: 0x4e4258,
    water: 0x33505f,
  },
  {
    at: 0.86,
    top: 0x0a1024,
    mid: 0x152039,
    horizon: 0x32334c,
    disc: 0xe6ecf5,
    glow: 0x6a6f92,
    cloudLit: 0x3b4460,
    cloudBody: 0x1a2134,
    water: 0x1c3648,
  },
];

const PAL_FIELDS = [
  "top",
  "mid",
  "horizon",
  "disc",
  "glow",
  "cloudLit",
  "cloudBody",
  "water",
] as const;

/** The palette at `timeOfDay`, blending between keyframes and wrapping at midnight. */
export function skyPalette(timeOfDay: number): SkyPalette {
  const tod = ((timeOfDay % 1) + 1) % 1;
  let i = KEYS.length - 1;
  for (let k = 0; k < KEYS.length; k++) if (tod >= KEYS[k].at) i = k;
  const a = KEYS[i];
  const b = KEYS[(i + 1) % KEYS.length];
  const span = (b.at - a.at + 1) % 1 || 1;
  const f = clamp01(((tod - a.at + 1) % 1) / span);
  const out = {} as SkyPalette;
  for (const key of PAL_FIELDS) out[key] = mixColor(a[key], b[key], f);
  return out;
}

export interface SkyLight {
  /** where the disc sits across the sky: -1 due left, 0 overhead, +1 due right */
  ax: number;
  /** height above the horizon, -1..1; negative means it has set */
  altitude: number;
  /** 0..1 how much daylight there is (already softened through twilight) */
  daylight: number;
  /** true once the sun is down and the moon has the sky */
  moon: boolean;
  /** horizontal run per unit of drop for light from the disc — god-rays and
   * the shadows surface objects cast both read this so they agree */
  lean: number;
}

/**
 * Where the light is coming from at `timeOfDay`. The disc tracks a simple arc;
 * once the sun sets the moon takes the mirrored position so the sky is never
 * unlit. `lean` is what the god-rays and ship shadows follow.
 */
export function skyLight(timeOfDay: number): SkyLight {
  const th = ((((timeOfDay % 1) + 1) % 1) - 0.25) * Math.PI * 2;
  const sunAx = -Math.cos(th);
  const sunAlt = Math.sin(th);
  const moon = sunAlt < 0;
  const ax = moon ? -sunAx : sunAx;
  const altitude = moon ? -sunAlt : sunAlt;
  // twilight: light lingers for a while after the disc drops below the horizon
  const daylight = clamp01(smoothstep(-0.18, 0.16, sunAlt));
  return { ax, altitude, daylight, moon, lean: ax * 0.45 };
}

export interface CloudPuff {
  /** offset from the bank centre, in viewport widths */
  dx: number;
  /** offset from the bank's flat base; negative is up */
  dy: number;
  /** horizontal radius, in viewport widths */
  rx: number;
  /** vertical radius, in viewport widths */
  ry: number;
}

export interface CloudBank {
  /** the cell this bank grew from — stable identity as the field drifts */
  index: number;
  /** bank centre in viewport widths, 0 = screen centre (already drifted) */
  u: number;
  /** height of the flat base, 0 = waterline, 1 = top of the visible sky */
  alt: number;
  /** 0..1 opacity — thin banks fade rather than popping in */
  alpha: number;
  /** which deck this came from, 0 = nearest */
  deck: number;
  puffs: CloudPuff[];
}

/** deterministic 0..1 from two small integers */
const cellRand = (seed: number, a: number, b: number): number =>
  fbm01(seed, a * 0.6131 + 0.17, b * 0.4271 + 0.29, { octaves: 1 }) * 0.5 +
  fbm01(seed + 61, a * 1.9137 + 0.51, b * 1.1093 + 0.73, { octaves: 1 }) * 0.5;

/** how far back deck `deck` of `decks` sits, 0 = nearest, 1 = furthest */
const deckDepth = (deck: number, decks: number): number =>
  deck / Math.max(1, decks - 1);

/**
 * One cumulus built as a row of ellipses tangent to a common flat base — the
 * shape a child draws and the shape that reads instantly at a glance. Radii
 * come from fbm along the bank, so each one is a different cloud while the
 * family stays recognisable; `cloudPuff` squashes the whole thing toward
 * streaky cirrus as it drops toward 0.
 */
export function cloudPuffs(
  p: SkyParams,
  index: number,
  deck: number,
): CloudPuff[] {
  const r = cellRand(p.seed + deck * 977, index, 3);
  // further decks are the same weather seen from further away: smaller, and
  // (via `cloudBanks`) packed tighter, higher and fainter
  const far = deckDepth(deck, Math.max(1, Math.round(p.cloudDecks)));
  const span = p.cloudScale * (0.65 + r * 0.7) * lerp(1, 0.5, far);
  const n = 4 + Math.floor(cellRand(p.seed + 313, index, deck) * 5);
  const puffs: CloudPuff[] = [];
  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0.5 : i / (n - 1);
    // fat in the middle, tapering to the shoulders
    const bulge = Math.sin(Math.PI * (0.18 + f * 0.64));
    const wobble =
      0.6 +
      0.7 *
        fbm01(p.seed + index * 71 + deck * 17, f * 3.1, index * 0.21, {
          octaves: 2,
        });
    const rx = span * 0.2 * bulge * wobble;
    const ry = rx * lerp(0.22, 0.62, p.cloudPuff) * (0.8 + bulge * 0.4);
    puffs.push({ dx: (f - 0.5) * span, dy: -ry, rx, ry });
  }
  return puffs;
}

/**
 * The cloud banks on one deck whose centres fall within `halfSpan` viewport
 * widths of the screen centre, at time `t`. `pan` is the deck's accumulated
 * parallax offset in viewport widths — the caller derives it from the camera.
 *
 * Coverage gates which cells hold a bank at all *and* how opaque it is, so
 * turning the dial down thins the sky out instead of deleting rows of clouds.
 */
export function cloudBanks(
  p: SkyParams,
  deck: number,
  t: number,
  pan = 0,
  halfSpan = 0.75,
): CloudBank[] {
  if (p.cloudCover <= 0.001 || p.cloudScale <= 0) return [];
  const far = deckDepth(deck, Math.max(1, Math.round(p.cloudDecks)));
  const spacing = p.cloudScale * lerp(1.9, 1.15, far);
  // drift is authored per minute so the dial reads in something human
  const shift = pan + (p.cloudDrift / 60) * lerp(1, 0.35, far) * t;
  const i0 = Math.floor((shift - halfSpan) / spacing) - 1;
  const i1 = Math.ceil((shift + halfSpan) / spacing) + 1;
  const out: CloudBank[] = [];
  for (let i = i0; i <= i1; i++) {
    // a slowly-evolving coverage field, so weather rolls through rather than
    // every cell independently flickering on the cover slider
    const density = fbm01(p.seed + deck * 4099, i * 0.31, t * 0.006, {
      octaves: 2,
    });
    const gate = (density + 0.35) * p.cloudCover;
    if (gate < 0.3) continue;
    const jitter = (cellRand(p.seed + deck * 53, i, 11) - 0.5) * spacing * 0.55;
    const lift = cellRand(p.seed + deck * 29, i, 5);
    out.push({
      index: i,
      u: i * spacing + jitter - shift,
      alt: clamp01(
        (p.cloudBase + lift * 0.16) * lerp(1, 1.9, far) + far * 0.12,
      ),
      alpha: clamp01((gate - 0.3) * 2.2) * lerp(1, 0.5, far),
      deck,
      puffs: cloudPuffs(p, i, deck),
    });
  }
  return out;
}

export interface OutlineOpts {
  /** how many points to trace across the bank (more = rounder shoulders) */
  steps?: number;
  /** shrink every puff about its own centre, for the lit inner shape */
  shrink?: number;
  /** shift the whole shape, in viewport widths */
  shiftX?: number;
  shiftY?: number;
}

/**
 * The union silhouette of a bank, as one closed polygon: the upper envelope of
 * the puffs, then straight back along their common base.
 *
 * Drawing the puffs as separate ellipses would be simpler, but a renderer fills
 * each one on its own, so every overlap doubles up the alpha and the cloud
 * reads as a heap of discs. One path fills once, at one opacity — which is what
 * makes it look like a cloud instead of a Venn diagram.
 *
 * Returns flat `[x0, y0, x1, y1, …]` in viewport widths; pass `out` to reuse a
 * buffer across frames.
 */
export function cloudOutline(
  puffs: readonly CloudPuff[],
  { steps = 44, shrink = 1, shiftX = 0, shiftY = 0 }: OutlineOpts = {},
  out: number[] = [],
): number[] {
  out.length = 0;
  if (!puffs.length) return out;
  let lo = Infinity;
  let hi = -Infinity;
  let base = -Infinity;
  for (const q of puffs) {
    lo = Math.min(lo, q.dx - q.rx * shrink);
    hi = Math.max(hi, q.dx + q.rx * shrink);
    base = Math.max(base, q.dy + q.ry * shrink);
  }
  const n = Math.max(4, Math.floor(steps));
  for (let i = 0; i <= n; i++) {
    const x = lo + ((hi - lo) * i) / n;
    let top = base;
    for (const q of puffs) {
      const rx = q.rx * shrink;
      const ry = q.ry * shrink;
      const f = (x - q.dx) / (rx || 1);
      if (f <= -1 || f >= 1) continue;
      top = Math.min(top, q.dy - ry * Math.sqrt(1 - f * f));
    }
    out.push(x + shiftX, top + shiftY);
  }
  out.push(hi + shiftX, base + shiftY, lo + shiftX, base + shiftY);
  return out;
}

export interface Star {
  /** horizontal position in viewport widths, 0 = screen centre */
  u: number;
  /** height, 0 = waterline, 1 = top of the visible sky */
  alt: number;
  /** radius in pixels — stars are points, they do not scale with anything */
  r: number;
  /** 0..1, already twinkling */
  k: number;
}

/**
 * Stars on a jittered lattice so they never line up, each twinkling on its own
 * phase and fading out toward the horizon where haze would swallow them.
 * Returns nothing while the sun is up — callers don't need to check.
 */
export function stars(
  p: SkyParams,
  t: number,
  pan = 0,
  halfSpan = 0.6,
): Star[] {
  const night = 1 - skyLight(p.timeOfDay).daylight;
  if (night < 0.05 || p.stars <= 0) return [];
  const cell = 0.055 / Math.max(0.05, p.stars);
  const rows = Math.max(2, Math.round(0.55 / cell));
  const out: Star[] = [];
  const i0 = Math.floor((pan - halfSpan) / cell);
  const i1 = Math.ceil((pan + halfSpan) / cell);
  for (let i = i0; i <= i1; i++) {
    for (let j = 0; j < rows; j++) {
      const a = cellRand(p.seed + 8101, i, j);
      if (a < 0.42) continue;
      const b = cellRand(p.seed + 4441, i, j);
      const alt = (j + b) / rows;
      const twinkle = 0.55 + 0.45 * Math.sin(t * (0.7 + b * 2.1) + a * 31.7);
      out.push({
        u: i * cell + a * cell - pan,
        alt,
        r: 1.1 + b * 2.4,
        k: night * twinkle * (0.35 + a * 0.65) * clamp01(alt * 6),
      });
    }
  }
  return out;
}

export interface Bird {
  /** horizontal position in viewport widths, 0 = screen centre */
  u: number;
  /** height, 0 = waterline, 1 = top of the visible sky */
  alt: number;
  /** wing half-span, in viewport widths */
  span: number;
  /** -1..1 wingbeat: 1 = wings up, -1 = wings down */
  flap: number;
  /** which way it is heading */
  dir: 1 | -1;
}

/**
 * A thin scatter of gulls, drifting and flapping. Pure silhouette — two short
 * strokes each — but they are most of what tells you the sky has scale.
 */
export function birds(
  p: SkyParams,
  t: number,
  pan = 0,
  halfSpan = 0.6,
): Bird[] {
  if (p.birds <= 0) return [];
  const cell = 1 / p.birds;
  const out: Bird[] = [];
  const i0 = Math.floor((pan - halfSpan) / cell) - 1;
  const i1 = Math.ceil((pan + halfSpan) / cell) + 1;
  for (let i = i0; i <= i1; i++) {
    const a = cellRand(p.seed + 6151, i, 2);
    const b = cellRand(p.seed + 2237, i, 9);
    const dir: 1 | -1 = a < 0.5 ? -1 : 1;
    const u = i * cell + a * cell + dir * t * 0.004 - pan;
    if (u < -halfSpan - cell || u > halfSpan + cell) continue;
    out.push({
      u,
      alt: clamp01(
        p.cloudBase * (0.4 + b * 0.8) + perlin1(p.seed + i, t * 0.2) * 0.05,
      ),
      span: 0.006 + b * 0.008,
      flap: Math.sin(t * (4.4 + a * 2.6) + i),
      dir,
    });
  }
  return out;
}

/**
 * 0..1 brightness of a light shaft along its length: ramps in just under the
 * surface, then eases to zero at the bottom rather than ending on a flat edge.
 */
export function shaftProfile(tt: number): number {
  const up = clamp01(tt / 0.16);
  const down = 1 - clamp01((tt - 0.16) / 0.84);
  return up * down * down;
}

/** 0..1 wisp density used to break a shaft up along its length so it reads as
 * light through moving water instead of a hard-edged wedge. */
export const shaftWisp = (
  seed: number,
  i: number,
  tt: number,
  t: number,
): number =>
  0.65 + 0.35 * fbm2(seed + 1777, i * 2.3, tt * 3.1 - t * 0.5, { octaves: 2 });
