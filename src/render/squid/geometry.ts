/**
 * Pure body geometry for the procedural deep-water squid — no Pixi, no camera,
 * no per-frame state. `ProceduralSquidView` and `GlowRenderer` both build from
 * these; the split keeps the shape math unit-testable (see `geometry.test.ts`)
 * and means the photophore positions are derived once, not re-rolled in two
 * files.
 *
 * Everything is in the squid's local frame: `along` runs +toward the mantle
 * tip, `across` is perpendicular to it, and the head / arms hang off the
 * negative `along` side. `localToWorld` is the one rotation into the world.
 */
import { clamp, clamp01, smoothstep, type Vec2 } from "../../core/math";
import { hash01 } from "../whale/geometry";
import type { SquidLook } from "./params";

export { hash01 };

/** eight arms, then the two feeding tentacles */
export const ARMS = 8;
export const LIMBS = ARMS + 2;
export const isTentacle = (i: number): boolean => i >= ARMS;

/** photophore pairs down the mantle — the additive dots `GlowRenderer` lights */
export const PHOTOPHORES = 6;

// ── per-individual proportions ─────────────────────────────────────────────

/**
 * How one squid differs from the dials: a handful of ratios hashed from its
 * `ph`, so two animals at the same `size` are still anatomically distinct. All
 * ratios sit near 1 and are scaled toward it by `variety` (0 → every squid is
 * the dial set exactly).
 */
export interface Individual {
  /** mantle length multiplier */
  mantleK: number;
  /** mantle girth multiplier — slender vs stocky */
  girthK: number;
  /** fin span multiplier */
  finK: number;
  /** arm length multiplier */
  armK: number;
  /** tentacle length multiplier */
  tentK: number;
  /** integer seed for the chromatophore flecks */
  seed: number;
}

export function individual(
  ph: number,
  variety: number,
  out: Individual,
): Individual {
  const v = clamp01(variety);
  const h = (n: number): number => (hash01(n, ph * 3.1) - 0.5) * v;
  out.mantleK = 1 + h(1) * 0.16;
  out.girthK = 1 + h(2) * 0.2;
  out.finK = 1 + h(3) * 0.3;
  out.armK = 1 + h(4) * 0.24;
  out.tentK = 1 + h(5) * 0.3;
  out.seed = Math.floor(hash01(6, ph * 3.1) * 1000);
  return out;
}

// ── jet pulse ──────────────────────────────────────────────────────────────

/**
 * The mantle's breathing cycle as a zero-mean wave in [-1, 1]: +1 is full of
 * water, -1 is squeezed flat at the end of the jet stroke. Real squid contract
 * fast and refill slowly, so the fall takes the first 30% of the cycle and the
 * rise the remaining 70%. Both halves are smoothsteps, which keeps the mean at
 * zero so the pulse never biases the resting girth.
 */
export function pulseWave(phase: number): number {
  const TAU = Math.PI * 2;
  let x = (phase % TAU) / TAU;
  if (x < 0) x += 1;
  return x < 0.3
    ? 1 - 2 * smoothstep(0, 0.3, x)
    : -1 + 2 * smoothstep(0.3, 1, x);
}

/** mantle girth factor for this point in the cycle */
export const jetGirth = (phase: number, depth: number): number =>
  1 + depth * pulseWave(phase);

/** the mantle lengthens a little as it squeezes — volume has to go somewhere */
export const jetLength = (phase: number, depth: number): number =>
  1 - 0.3 * depth * pulseWave(phase);

// ── mantle ─────────────────────────────────────────────────────────────────

/**
 * Mantle half-width at `u` (0 at the head end, 1 at the tip) as a fraction of
 * the full half-width: a rounded shoulder that fills to the girth a third of
 * the way back, then a long taper to a pointed tip.
 */
export function mantleProfile(u: number): number {
  const shoulder = 0.66 + 0.34 * smoothstep(0, 0.3, u);
  const taper = 1 - Math.pow(smoothstep(0.32, 1, u), 1.7);
  return shoulder * taper;
}

export const mantleHalf = (u: number, mw: number): number =>
  mw * mantleProfile(u);

/**
 * The mantle silhouette as one closed loop of local points: the top edge
 * (negative `across`) base → tip, the tip once, the bottom edge tip → base,
 * then three cap points closing round the head end. The cap comes last so the
 * loop never crosses itself, the same lesson as the whale hull's head cap.
 * Returns the point count written into `out` (needs `2 * steps + 4` slots).
 */
export function buildMantleOutline(
  ml: number,
  mw: number,
  steps: number,
  out: Vec2[],
): number {
  let n = 0;
  for (let s = 0; s < steps; s++) {
    const u = s / steps;
    out[n].x = u * ml;
    out[n].y = -mantleHalf(u, mw);
    n++;
  }
  out[n].x = ml;
  out[n].y = 0;
  n++;
  for (let s = steps - 1; s >= 0; s--) {
    const u = s / steps;
    out[n].x = u * ml;
    out[n].y = mantleHalf(u, mw);
    n++;
  }
  out[n].x = -0.42 * mw;
  out[n].y = 0.38 * mw;
  n++;
  out[n].x = -0.62 * mw;
  out[n].y = 0;
  n++;
  out[n].x = -0.42 * mw;
  out[n].y = -0.38 * mw;
  n++;
  return n;
}

// ── fins ───────────────────────────────────────────────────────────────────

/** outer samples along one fin lobe; the loop it builds is `FIN_SAMPLES + 3` */
export const FIN_SAMPLES = 6;

/**
 * One lateral fin lobe on `side` (±1), rooted along the mantle edge from
 * `look.finRoot` for `look.finLen` of the mantle and bulging out to the span.
 * A travelling wave runs root → tip along the outer edge, driven by the jet
 * phase, which is what makes a hovering squid look alive. The root points sit
 * a little inside the mantle so its fill hides the seam.
 */
export function buildFin(
  ml: number,
  mw: number,
  look: SquidLook,
  ind: Individual,
  side: number,
  jet: number,
  out: Vec2[],
): number {
  const u0 = look.finRoot;
  const u1 = Math.min(0.985, u0 + look.finLen);
  const span = look.finSpan * mw * ind.finK;
  let n = 0;
  out[n].x = u0 * ml;
  out[n].y = side * mantleHalf(u0, mw) * 0.8;
  n++;
  for (let j = 0; j <= FIN_SAMPLES; j++) {
    const f = j / FIN_SAMPLES;
    const u = u0 + (u1 - u0) * f;
    const bulge = Math.pow(Math.sin(f * Math.PI), 0.8);
    const wave = Math.sin(jet * 2.2 - f * 5 + side * 0.5) * span * 0.16 * bulge;
    out[n].x = u * ml + wave * 0.3;
    out[n].y = side * (mantleHalf(u, mw) * 0.8 + span * bulge + wave);
    n++;
  }
  out[n].x = u1 * ml;
  out[n].y = side * mantleHalf(u1, mw) * 0.8;
  n++;
  return n;
}

// ── head & eye ─────────────────────────────────────────────────────────────

/** the head sits just behind the mantle's base cap — and never pulses */
export function headLocal(look: SquidLook, out: Vec2): Vec2 {
  out.x = -look.headR * 0.15;
  out.y = 0;
  return out;
}

export const headRadius = (look: SquidLook): number => look.headR;

/**
 * A squid has an eye on each flank; in this side view we show the one on the
 * flank facing up-screen, sliding to the centre line as the animal turns to
 * point straight up or down. `ca` is `cos(heading)`.
 */
export function eyeLocal(look: SquidLook, ca: number, out: Vec2): Vec2 {
  out.x = -look.headR * 0.35;
  out.y = -clamp(ca * 3, -1, 1) * look.headR * 0.62;
  return out;
}

export const eyeRadius = (look: SquidLook): number => look.headR * 0.42;

// ── photophores ────────────────────────────────────────────────────────────

/**
 * Photophore `n` of `PHOTOPHORES`, alternating flanks down the mantle. Shared
 * by the base dots in the view and the additive bloom in `GlowRenderer`.
 */
export function photophoreLocal(
  n: number,
  ml: number,
  mw: number,
  out: Vec2,
): Vec2 {
  const u = 0.12 + (n / (PHOTOPHORES - 1)) * 0.72;
  out.x = u * ml;
  out.y = (n % 2 ? 1 : -1) * mantleHalf(u, mw) * 0.5;
  return out;
}

// ── limbs ──────────────────────────────────────────────────────────────────

/**
 * Each limb's slot in the fan, -0.5..0.5. The eight arms are spaced evenly;
 * the tentacles interleave between the third and fourth arm of each side,
 * where a real squid carries them, so no two limbs ever share an angle (the
 * old view put both tentacles exactly on the outermost arms).
 */
export function limbSlot(i: number): number {
  if (!isTentacle(i)) return i / (ARMS - 1) - 0.5;
  return (i === ARMS ? -1 : 1) * (1 / (ARMS - 1));
}

/** fan half-angle: tight when streamlined, wide open for a grab */
export const fanHalf = (flare: number): number => 0.22 + flare * 1.15;

/** local direction of limb `i` — π is straight back off the head */
export const limbAngle = (i: number, flare: number): number =>
  Math.PI + limbSlot(i) * 2 * fanHalf(flare);

export function limbLength(
  i: number,
  look: SquidLook,
  ind: Individual,
  flare: number,
  ml: number,
): number {
  return isTentacle(i)
    ? ml * look.tentLen * ind.tentK * (1 - 0.13 * flare)
    : ml * look.armLen * ind.armK * (1 - 0.12 * flare);
}

/**
 * Half-width of limb `i` at fraction `f` of its length. Arms taper straight to
 * a point; tentacles are slimmer stalks that widen into a club near the tip.
 */
export function limbHalfWidth(
  i: number,
  f: number,
  look: SquidLook,
  flare: number,
): number {
  const w0 = look.armW * (1 + flare * 0.3);
  if (!isTentacle(i)) return w0 * (1 - 0.85 * f);
  const stalk = w0 * 0.6 * (1 - 0.6 * f);
  const club =
    w0 * 0.55 * smoothstep(0.7, 0.86, f) * (1 - smoothstep(0.9, 1, f));
  return stalk + club;
}

/** where the limbs root: behind the head, spread a little across its back */
export function limbRoot(i: number, look: SquidLook, out: Vec2): Vec2 {
  out.x = -look.headR * 0.9;
  out.y = limbSlot(i) * look.headR * 0.9;
  return out;
}

/**
 * The closed outline of limb `i` as `2 * (S + 1)` local points — one edge out
 * to the tip and the other back. The centre-line is a travelling wave when
 * cruising (per-limb phase from `ph`, so the arms never move in lockstep) and
 * curls toward the centre line as `flare` rises for a grab. A tentacle given a
 * `grip` target (local frame) bends its tip onto it.
 */
export function limbPoints(
  i: number,
  look: SquidLook,
  ind: Individual,
  flare: number,
  jet: number,
  ph: number,
  ml: number,
  mw: number,
  grip: Vec2 | null,
  S: number,
  out: Vec2[],
  root: Vec2,
): number {
  limbRoot(i, look, root);
  const idx = limbSlot(i);
  const dir = limbAngle(i, flare);
  const len = limbLength(i, look, ind, flare, ml);
  const dca = Math.cos(dir);
  const dsa = Math.sin(dir);
  const nx = -dsa;
  const ny = dca;
  const wave = (1 - flare * 0.7) * look.armWave * mw;
  const phase = ph * 1.3 + i * 0.8 + hash01(i, ph) * 1.2;
  const tent = isTentacle(i);
  // straight-line tip, for the grip bend
  const tipX = root.x + dca * len;
  const tipY = root.y + dsa * len;
  const bend = tent && grip ? 0.9 : 0;
  for (let s = 0; s <= S; s++) {
    const f = s / S;
    let cx = root.x + dca * len * f;
    let cy = root.y + dsa * len * f;
    const sway =
      Math.sin(jet * 1.6 + phase - f * 3) * wave * f -
      idx * flare * mw * 1.4 * f * f;
    cx += nx * sway;
    cy += ny * sway;
    if (bend > 0 && grip) {
      cx += (grip.x - tipX) * f * f * bend;
      cy += (grip.y - tipY) * f * f * bend;
    }
    const hw = limbHalfWidth(i, f, look, flare);
    out[s].x = cx + nx * hw;
    out[s].y = cy + ny * hw;
    out[2 * S + 1 - s].x = cx - nx * hw;
    out[2 * S + 1 - s].y = cy - ny * hw;
  }
  return 2 * (S + 1);
}

// ── frame ──────────────────────────────────────────────────────────────────

/** the one rotation: local (along, across) → world, about the squid's centre */
export function localToWorld(
  x: number,
  y: number,
  heading: number,
  size: number,
  al: number,
  pe: number,
  out: Vec2,
): Vec2 {
  const ca = Math.cos(heading);
  const sa = Math.sin(heading);
  out.x = x + (al * ca - pe * sa) * size;
  out.y = y + (al * sa + pe * ca) * size;
  return out;
}

/** world → local, the inverse of `localToWorld` (for the grip target) */
export function worldToLocal(
  x: number,
  y: number,
  heading: number,
  size: number,
  wx: number,
  wy: number,
  out: Vec2,
): Vec2 {
  const ca = Math.cos(heading);
  const sa = Math.sin(heading);
  const dx = (wx - x) / size;
  const dy = (wy - y) / size;
  out.x = dx * ca + dy * sa;
  out.y = -dx * sa + dy * ca;
  return out;
}
