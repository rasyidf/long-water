/**
 * Deterministic gradient (Perlin) noise and the fbm stack the stylised ocean
 * surface and sky are built from. Pure math — no Pixi, no mutable state beyond
 * a memoised permutation table per seed — so every field is reproducible from
 * `(seed, x, y)` alone and unit-testable (see `noise.test.ts`).
 *
 * `core/rng.ts` keeps the cheap 1-D value noise the world generator uses; this
 * module is the 2-D / stylised-detail side. Prefer these when you want a field
 * that stays smooth as it scrolls and never reads as a repeating stamp.
 */
import { clamp01 } from "./math";

const SIZE = 256;
const MASK = SIZE - 1;

/** 8 evenly-spaced unit gradients. A small fixed set (rather than random
 * vectors) keeps the noise free of directional clumping at low octave counts. */
const GRAD: ReadonlyArray<readonly [number, number]> = (() => {
  const g: Array<[number, number]> = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.push([Math.cos(a), Math.sin(a)]);
  }
  return g;
})();

const permCache = new Map<number, Uint8Array>();

/** Fisher–Yates over 0..255 driven by an LCG, doubled so lookups never wrap. */
function permutation(seed: number): Uint8Array {
  const key = seed >>> 0;
  const hit = permCache.get(key);
  if (hit) return hit;
  const p = new Uint8Array(SIZE * 2);
  for (let i = 0; i < SIZE; i++) p[i] = i;
  let s = (key ^ 0x9e3779b9) >>> 0;
  for (let i = SIZE - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  p.copyWithin(SIZE, 0, SIZE);
  // one table per seed; dev tools can sweep a seed slider, so cap the cache
  if (permCache.size > 64) permCache.clear();
  permCache.set(key, p);
  return p;
}

/** Quintic fade — C² continuous, so fbm sums have no visible lattice creases. */
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 2-D gradient noise in roughly [-1, 1], zero at every lattice point. */
export function perlin2(seed: number, x: number, y: number): number {
  const p = permutation(seed);
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const X = xi & MASK;
  const Y = yi & MASK;
  const u = fade(xf);
  const v = fade(yf);

  const dot = (gx: number, gy: number, dx: number, dy: number): number => {
    const g = GRAD[p[p[gx] + gy] & 7];
    return g[0] * dx + g[1] * dy;
  };

  const n00 = dot(X, Y, xf, yf);
  const n10 = dot(X + 1, Y, xf - 1, yf);
  const n01 = dot(X, Y + 1, xf, yf - 1);
  const n11 = dot(X + 1, Y + 1, xf - 1, yf - 1);

  // √2 normalises the 2-D bound (0.5·√2) up to 1
  const n = lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * Math.SQRT2;
  return n < -1 ? -1 : n > 1 ? 1 : n;
}

/** 1-D slice of {@link perlin2}, offset off the lattice row so it isn't all zeroes. */
export const perlin1 = (seed: number, x: number): number =>
  perlin2(seed, x, 0.371);

export interface FbmOpts {
  /** how many octaves to sum (1 = plain perlin) */
  octaves?: number;
  /** frequency multiplier per octave */
  lacunarity?: number;
  /** amplitude multiplier per octave */
  gain?: number;
}

/**
 * Fractional Brownian motion: octaves of {@link perlin2} at doubling frequency
 * and halving amplitude, normalised back into [-1, 1]. This is the workhorse —
 * cloud density, swell grouping, foam break-up all come from it.
 */
export function fbm2(
  seed: number,
  x: number,
  y: number,
  { octaves = 4, lacunarity = 2, gain = 0.5 }: FbmOpts = {},
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    // each octave gets its own seed so they aren't correlated copies
    sum += perlin2(seed + i * 1013, fx, fy) * amp;
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}

/** {@link fbm2} on a 1-D slice. */
export const fbm1 = (seed: number, x: number, o?: FbmOpts): number =>
  fbm2(seed, x, 0.371, o);

/**
 * Ridged multifractal: folds each octave about zero and inverts it, so the
 * field grows sharp creases instead of smooth blobs. Output is [0, 1]; used for
 * the hard edge of a cloud bank and for caustic filaments.
 */
export function ridge2(
  seed: number,
  x: number,
  y: number,
  { octaves = 4, lacunarity = 2, gain = 0.5 }: FbmOpts = {},
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += (1 - Math.abs(perlin2(seed + i * 1013, fx, fy))) * amp;
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
  }
  return norm === 0 ? 0 : clamp01(sum / norm);
}

/**
 * Domain warp: displace the sample point by another noise field before
 * sampling. Turns the soft round lobes of plain fbm into the curled, wind-blown
 * shapes that make a cloud bank read as weather rather than as a blob.
 * `strength` is in the same units as `x`/`y`.
 */
export function warpedFbm2(
  seed: number,
  x: number,
  y: number,
  strength: number,
  opts?: FbmOpts,
): number {
  if (strength === 0) return fbm2(seed, x, y, opts);
  const wx = fbm2(seed + 7717, x, y, { octaves: 2 });
  const wy = fbm2(seed + 3313, x, y, { octaves: 2 });
  return fbm2(seed, x + wx * strength, y + wy * strength, opts);
}

/** fbm remapped to [0, 1] — the form most density/coverage dials want. */
export const fbm01 = (
  seed: number,
  x: number,
  y: number,
  opts?: FbmOpts,
): number => clamp01(fbm2(seed, x, y, opts) * 0.5 + 0.5);
