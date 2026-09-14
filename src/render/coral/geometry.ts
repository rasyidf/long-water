/**
 * Pure shape math for the reef coral — no Pixi, no camera, no per-frame state.
 * `ProceduralCoralView` builds every growth from these; keeping them here
 * makes the reef unit-testable (see `geometry.test.ts`) and lets the designer
 * and the game share one definition of what a "staghorn" is.
 *
 * Two ideas carry the whole module:
 *  - a **genome** per item, hashed off its seabed x, so two corals of the
 *    same kind at the same scale still differ in height, spread, lean, hue and
 *    limb count without any state being stored on `Coral`;
 *  - a **current field** the whole patch reads, so neighbouring growths lean
 *    together with a phase lag along x — water moving through the reef —
 *    rather than each one swaying on its own metronome.
 */
import { clamp, clamp01, hash01 } from "../../core/math";
import { fbm1 } from "../../core/noise";

/** how many coral kinds the renderer knows; `Coral.kind % KIND_COUNT` picks */
export const KIND_COUNT = 7;
export const KIND_NAMES = [
  "sea fan",
  "staghorn",
  "brain",
  "tube sponge",
  "sea whip",
  "anemone",
  "table",
] as const;

/**
 * How far each kind lets the current bend it, as a fraction of its height at
 * the tip when the current is at full strength. A boulder does not move; a
 * whip is all give.
 */
export const STIFFNESS: readonly number[] = [
  0.1, // sea fan — a membrane on a stalk, flexes as one sheet
  0.045, // staghorn — rigid skeleton, only the fine tips give
  0, // brain — rock
  0.065, // tube sponge — soft but squat
  0.16, // sea whip — long and thin, bends to the water
  0.09, // anemone — a soft column
  0.03, // table — a stem under a heavy plate
];

/** blend target that sinks coral colours back toward the water */
export const WATER = 0x14384a;

/** reef palette — one hue per kind so a patch reads as a mixed community, not
 * a monoculture. Order matches `KIND_NAMES`. */
export const HUE: readonly number[] = [
  0xff6f6b, // sea fan — coral red
  0xdd6f9e, // staghorn — magenta
  0xe0b45c, // brain — ochre
  0xc27bd6, // tube sponge — violet
  0x8f83d8, // sea whip — periwinkle
  0xf09a6a, // anemone — apricot
  0x7fc9a6, // table — sea green
];

// ── genome ─────────────────────────────────────────────────────────────────

/** per-item variation, derived (never stored) from the item's seabed x */
export interface Genome {
  /** 0.82..1.18 height multiplier */
  height: number;
  /** 0.82..1.18 width / spread multiplier */
  spread: number;
  /** 0..1 hue jitter tone (also drives which neighbour hue it drifts toward) */
  tone: number;
  /** −0.12..0.12 rad base lean of the whole growth, as a slope per unit rise */
  lean: number;
  /** 0..1 branch-angle / groove jitter */
  jitter: number;
  /** 0..1 limb-count basis (tubes, tentacles, fingers, veins) */
  count: number;
  /** the item's own animation phase */
  phase: number;
}

export function genome(x: number, ph: number, out: Genome): Genome {
  const n = Math.round(x);
  out.height = 0.82 + 0.36 * hash01(n);
  out.spread = 0.82 + 0.36 * hash01(n * 3 + 11);
  out.tone = hash01(n * 7 + 23);
  out.lean = (hash01(n * 5 + 41) - 0.5) * 0.24;
  out.jitter = hash01(n * 11 + 59);
  out.count = hash01(n * 13 + 73);
  out.phase = ph;
  return out;
}

// ── current & sway ─────────────────────────────────────────────────────────

export interface CurrentParams {
  /** world units over which the surge changes — a patch shares one phase */
  currentScale: number;
  /** how fast the surge travels (1 = the shipped pace) */
  currentSpeed: number;
  /** 0..1 how much fast, small-scale gusting rides on the slow surge */
  gust: number;
}

/**
 * The water moving through the reef at seabed `x`, time `t`: a slow surge
 * that travels along the shelf plus a smaller, quicker gust term. Both are
 * fbm over `x`, so neighbours lean together with a lag rather than in
 * lockstep, and the field never repeats as a stamp. Output is in [−1, 1].
 */
export function currentAt(
  seed: number,
  x: number,
  t: number,
  p: CurrentParams,
): number {
  const sc = Math.max(1, p.currentScale);
  const surge = fbm1(seed, x / sc - t * 0.055 * p.currentSpeed, {
    octaves: 3,
  });
  const gust =
    fbm1(seed + 919, x / (sc * 0.31) - t * 0.21 * p.currentSpeed, {
      octaves: 2,
    }) * p.gust;
  return clamp(surge * 0.85 + gust * 0.5, -1, 1);
}

/**
 * Lateral displacement at height fraction `fy` (0 root, 1 tip) as a fraction
 * of the growth's height. Quadratic in height: the holdfast is pinned to the
 * rock, the tip carries all the movement. Bounded by `|current| · stiffness`.
 */
export const swayAt = (
  fy: number,
  current: number,
  stiffness: number,
): number => current * stiffness * fy * fy;

/**
 * A slow open/close for tube mouths and anemone discs — never fully shut, so
 * a tube always reads as a tube. Returns (0, 1].
 */
export const breathe = (t: number, ph: number, rate = 1): number =>
  0.62 + 0.38 * (0.5 + 0.5 * Math.sin(t * 0.9 * rate + ph));

/** polyp size pulse, (0, 1] — a touch quicker than the breathing */
export const polypPulse = (t: number, ph: number, rate = 1): number =>
  0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 1.7 * rate + ph));

// ── colour ─────────────────────────────────────────────────────────────────

/**
 * Sink a coral hue toward the water by `k`, losing warm channels first — the
 * cheap version of red dropping out with depth. Kept local to the reef so the
 * global `mixColor` stays a plain blend.
 */
export function sinkColor(hue: number, water: number, k: number): number {
  const kk = clamp01(k);
  const kr = clamp01(kk * 1.35);
  const kb = kk * 0.8;
  const r =
    ((hue >> 16) & 255) + (((water >> 16) & 255) - ((hue >> 16) & 255)) * kr;
  const g =
    ((hue >> 8) & 255) + (((water >> 8) & 255) - ((hue >> 8) & 255)) * kk;
  const b = (hue & 255) + ((water & 255) - (hue & 255)) * kb;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

// ── staghorn ───────────────────────────────────────────────────────────────

export interface Segment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** half-widths at the root and the tip */
  w0: number;
  w1: number;
  /** 0 at the trunks, growing toward the tips */
  level: number;
  /** true for a segment that ends a branch (grows a bud) */
  tip: boolean;
}

/** the most segments `buildStaghorn` can ever write at `depth` ≤ 4 */
export const MAX_SEGMENTS = 128;

export const makeSegments = (): Segment[] =>
  Array.from({ length: MAX_SEGMENTS }, () => ({
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
    w0: 0,
    w1: 0,
    level: 0,
    tip: false,
  }));

/**
 * The branching thicket: two trunks, each forking recursively `depth` times.
 * Local units — `x` sideways, `y` up from the root — so the caller can bend
 * the whole tree with the current afterwards. Deterministic for a genome, so
 * it can be rebuilt each frame with no state; returns the segment count.
 */
export function buildStaghorn(
  g: Genome,
  h: number,
  depth: number,
  branchSpread: number,
  out: Segment[],
): number {
  const d = clamp(Math.round(depth), 1, 4);
  let n = 0;
  const grow = (
    x: number,
    y: number,
    ang: number,
    len: number,
    wid: number,
    left: number,
    level: number,
  ): void => {
    if (n >= out.length) return;
    const dx = Math.sin(ang);
    const dy = Math.cos(ang);
    const s = out[n++];
    s.x0 = x;
    s.y0 = y;
    s.x1 = x + dx * len;
    s.y1 = y + dy * len;
    s.w0 = wid;
    s.w1 = wid * 0.62;
    s.level = level;
    s.tip = left <= 0;
    if (left <= 0) return;
    const spread = (0.4 + g.jitter * 0.24) * branchSpread;
    grow(s.x1, s.y1, ang - spread, len * 0.72, s.w1, left - 1, level + 1);
    grow(
      s.x1,
      s.y1,
      ang + spread * 0.82,
      len * 0.68,
      s.w1,
      left - 1,
      level + 1,
    );
    if (left === d)
      grow(s.x1, s.y1, ang + 0.05, len * 0.58, s.w1 * 0.9, left - 1, level + 1);
  };
  grow(-h * 0.18 * g.spread, 0, -0.25 + g.lean, h * 0.4, h * 0.09, d, 0);
  grow(h * 0.16 * g.spread, 0, 0.28 + g.lean, h * 0.38, h * 0.085, d, 0);
  return n;
}

// ── tube sponge ────────────────────────────────────────────────────────────

export interface Tube {
  /** root x, mouth x */
  bx: number;
  tx: number;
  /** mouth height */
  th: number;
  /** radii at the root and the lip */
  r0: number;
  r1: number;
  /** this tube's own breathing phase */
  ph: number;
}

export const tubeCount = (g: Genome): number => 3 + Math.round(g.count * 2);

/** the `i`th of `n` tubes in a clump: leaning outward, heights jittered */
export function tubeAt(
  g: Genome,
  i: number,
  n: number,
  h: number,
  out: Tube,
): Tube {
  const s = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
  out.bx = s * h * 0.42 * g.spread;
  const j = hash01(i * 7 + Math.round(g.tone * 1000));
  out.th = h * (0.6 + 0.4 * j);
  out.tx = out.bx + s * h * 0.18;
  out.r0 = h * 0.09;
  out.r1 = h * 0.07;
  out.ph = g.phase + i * 1.9;
  return out;
}

// ── sea fan ────────────────────────────────────────────────────────────────

export const veinCount = (g: Genome, detail: number): number =>
  5 + Math.round((2 + g.count * 2) * detail) * 2;

/**
 * Radius of the fan membrane at angle `a` (rad, 0 straight up, ± across the
 * fan) as a fraction of height, with the travelling ripple that flutters the
 * edge. The base shape is a rounded lobe, fuller at the shoulders.
 */
export function fanRadius(
  a: number,
  g: Genome,
  t: number,
  flutter: number,
): number {
  const lobe = 1 - 0.18 * Math.pow(Math.abs(a) / 1.35, 2.4);
  const ripple = Math.sin(a * 5.2 - t * 2.6 + g.phase) * 0.035 * flutter;
  return Math.max(0.2, (0.86 + 0.14 * Math.cos(a)) * lobe + ripple);
}

// ── anemone ────────────────────────────────────────────────────────────────

export const tentacleCount = (g: Genome): number =>
  10 + Math.round(g.count * 6);

export interface Tentacle {
  /** root on the disc rim (local) */
  x: number;
  y: number;
  /** direction (rad, 0 up) and length */
  ang: number;
  len: number;
  /** base half-width */
  w: number;
}

/**
 * The `i`th of `n` tentacles around the oral disc, each wobbling on its own
 * phase. `wobble` scales the animation (0 freezes it).
 */
export function tentacleAt(
  g: Genome,
  i: number,
  n: number,
  h: number,
  t: number,
  wobble: number,
  out: Tentacle,
): Tentacle {
  const f = n === 1 ? 0.5 : i / (n - 1);
  const s = (f - 0.5) * 2; // −1..1 across the disc
  const discW = h * 0.34 * g.spread;
  out.x = s * discW;
  out.y = h * 0.44;
  const base = s * 0.95; // fan out from the disc, outer ones lie flatter
  const w1 = Math.sin(t * 1.3 + i * 1.7 + g.phase) * 0.22;
  const w2 = Math.sin(t * 2.1 + i * 0.9 + g.phase * 1.3) * 0.08;
  out.ang = base + (w1 + w2) * wobble;
  out.len = h * (0.36 + 0.14 * hash01(i * 3 + Math.round(g.tone * 500)));
  out.w = h * 0.048;
  return out;
}

// ── table coral ────────────────────────────────────────────────────────────

export const fingerCount = (g: Genome, detail: number): number =>
  3 + Math.round((2 + g.count * 4) * detail);

/**
 * Half-width of the plate at angle `a` (rad around the ellipse) as a fraction
 * of the nominal half-width, scalloped so the rim reads as a grown edge.
 */
export const plateRadius = (a: number, g: Genome): number =>
  1 +
  0.05 * Math.sin(a * 9 + g.tone * 6.28) +
  0.025 * Math.sin(a * 4 + g.jitter * 6.28);

// ── brain coral ────────────────────────────────────────────────────────────

/** dome radius at angle `a` (0 straight up, ±π/2 at the rock) as a fraction */
export const domeRadius = (a: number, g: Genome): number =>
  1 +
  0.035 * Math.sin(a * 7 + g.tone * 6.28) +
  0.02 * Math.sin(a * 3 + g.jitter * 6.28);

export const grooveCount = (g: Genome, detail: number): number =>
  2 + Math.round((1 + g.count * 2) * detail);
