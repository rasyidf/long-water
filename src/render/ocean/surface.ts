/**
 * Pure geometry for the stylised sea surface — no Pixi, no camera, no
 * per-frame state. `OceanView` turns what these return into fills and strokes;
 * the split keeps the wave math unit-testable (`surface.test.ts`) and lets the
 * procgen viewer drive the exact same field the game draws.
 *
 * The surface is a **Gerstner** wave sum traced parametrically. Each octave
 * moves points horizontally toward its own crest as well as vertically, which
 * cusps the crests and flattens the troughs — the shape that reads as "sea"
 * rather than "sine wave". Because x is displaced, the curve has no closed form
 * `y(x)`; everything walks a parameter `u` instead (see {@link traceSurface}).
 *
 * Perlin fbm rides on top in two places: it modulates each octave's amplitude
 * into travelling swell *groups*, and it adds a fine drifting chop. Together
 * they are what stop a long stretch of water from reading as one stamp
 * repeated across the screen.
 */
import { clamp01, hash01, smoothstep } from "../../core/math";
import { fbm01, fbm2 } from "../../core/noise";

/** Gravity in world units/s² (1 unit = 0.1 m), for the deep-water dispersion
 * relation ω = √(g·k). Using real dispersion means the long swell outruns the
 * chop for free, instead of every octave sliding at the same speed. */
export const G_WORLD = 98.1;

export interface WaveOctave {
  /** crest-to-crest distance, world units */
  length: number;
  /** mean-to-crest height, world units */
  height: number;
  /** multiplier on the dispersion phase speed (negative reverses travel) */
  speed: number;
}

export interface WaveParams {
  /** noise seed — changes the swell grouping and foam break-up, not the octaves */
  seed: number;
  /** master scale on every octave height and on foam; 1 = as authored */
  wind: number;
  octaves: WaveOctave[];
  /** 0..1 Gerstner crest sharpening, normalised so the dial means the same
   * thing whatever the octaves are: 0 = pure sine, 1 = the cusp limit where the
   * crest closes to a point. Past 1 the curve folds back on itself. */
  steep: number;
  /** 0..1 depth of the fbm swell-group modulation (waves arriving in sets) */
  groupiness: number;
  /** world units spanned by one swell group */
  groupLength: number;
  /** amplitude of the fine perlin ripple riding on the swell, world units */
  chopHeight: number;
  /** world units per fbm period of that ripple */
  chopLength: number;
  /** how fast the ripple field scrolls, world units/s */
  chopDrift: number;
  /** steepness 0..1 at which a crest starts to break into foam */
  foamStart: number;
  /** 0..1 master foam opacity */
  foamAmount: number;
  /** 0..1 how patchy foam is along a crest (0 = every crest foams evenly) */
  foamPatchiness: number;
}

/** angular frequency of one octave, from deep-water dispersion */
export const waveOmega = (o: WaveOctave): number =>
  Math.sqrt(G_WORLD * ((Math.PI * 2) / Math.max(1e-3, o.length))) * o.speed;

/** wavenumber k = 2π/λ */
export const waveK = (o: WaveOctave): number =>
  (Math.PI * 2) / Math.max(1e-3, o.length);

/**
 * Amplitude of one octave at position `u`, after the fbm swell-group envelope.
 * Never negative: a group can cancel a train out entirely but not invert it.
 */
export function octaveAmp(
  p: WaveParams,
  o: WaveOctave,
  index: number,
  u: number,
  t: number,
): number {
  const base = o.height * p.wind;
  if (p.groupiness <= 0) return base;
  // groups drift a little slower than the crests themselves, so sets visibly
  // travel through the field instead of sitting pinned to world x
  const n = fbm2(
    p.seed + index * 131,
    (u - t * 40) / Math.max(1, p.groupLength),
    index * 3.7,
    { octaves: 2 },
  );
  return Math.max(0, base * (1 + p.groupiness * n));
}

/** the largest displacement the surface can reach, up or down (world units) */
export function waveEnvelope(p: WaveParams): number {
  let sum = 0;
  for (const o of p.octaves) sum += Math.abs(o.height) * p.wind;
  return sum * (1 + p.groupiness) + Math.abs(p.chopHeight);
}

/** per-octave amplitudes for the current {@link surfacePoint} call. One
 * module-level buffer is enough: the function is synchronous and reads it back
 * before returning, so it stays a pure function of its arguments. */
const amps: number[] = [];

/** the fine perlin ripple, sampled in world x */
function chopAt(p: WaveParams, u: number, t: number): number {
  if (p.chopHeight === 0) return 0;
  return (
    p.chopHeight *
    fbm2(
      p.seed + 5501,
      (u - t * p.chopDrift) / Math.max(1, p.chopLength),
      t * 0.11,
      { octaves: 3, gain: 0.55 },
    )
  );
}

export interface SurfacePoint {
  /** world x after the Gerstner horizontal displacement */
  x: number;
  /** world y relative to the mean waterline; negative is up (out of the water) */
  y: number;
}

/**
 * One point of the surface at curve parameter `u` (≈ the undisplaced world x).
 * Walk `u` to draw the curve; see {@link surfaceHeightAt} to go the other way.
 */
export function surfacePoint(
  p: WaveParams,
  u: number,
  t: number,
): SurfacePoint {
  const n = p.octaves.length;
  let total = 0;
  for (let i = 0; i < n; i++) {
    amps[i] = octaveAmp(p, p.octaves[i], i, u, t);
    total += amps[i];
  }
  // Share `steep` out across the octaves by amplitude and divide by each
  // wavenumber, so d(x)/du bottoms out at exactly `1 - steep`: the dial means
  // "fraction of the way to a cusp" no matter how the octaves are tuned, and a
  // silenced octave stops displacing as well as stops lifting.
  const q = total > 1e-6 ? p.steep / total : 0;
  let y = 0;
  let dx = 0;
  for (let i = 0; i < n; i++) {
    const o = p.octaves[i];
    const k = waveK(o);
    const ph = k * u - waveOmega(o) * t;
    y -= amps[i] * Math.cos(ph);
    // pull points toward the crest — this is what cusps the peaks
    dx -= q * (amps[i] / k) * Math.sin(ph);
  }
  return { x: u + dx, y: y + chopAt(p, u, t) };
}

/**
 * Surface height at a real world x, by inverting the Gerstner displacement with
 * a few fixed-point steps. Converges while `steep` stays under 1; at or above
 * it the curve folds over itself and there is no single height to find.
 */
export function surfaceHeightAt(p: WaveParams, wx: number, t: number): number {
  let u = wx;
  for (let i = 0; i < 5; i++) u = wx - (surfacePoint(p, u, t).x - u);
  return surfacePoint(p, u, t).y;
}

export interface SurfaceSample extends SurfacePoint {
  /** curve parameter this point was traced at */
  u: number;
  /** dy/dx — how tilted the water face is here */
  slope: number;
  /** 0 where the trace is evenly spaced, →1 where it bunches into a cusp */
  steepness: number;
  /** 0..1 whitecap strength: steep, high, and patchy along the crest */
  foam: number;
}

/**
 * Trace `count + 1` points of the surface across `[u0, u1]`, with slope,
 * cusp-compression and foam derived by central differences on the traced curve
 * itself — so the foam always sits exactly where the drawn crest bunches up,
 * whatever the octaves are doing. Pass `out` to reuse a buffer across frames.
 */
export function traceSurface(
  p: WaveParams,
  u0: number,
  u1: number,
  count: number,
  t: number,
  out: SurfaceSample[] = [],
): SurfaceSample[] {
  const n = Math.max(2, Math.floor(count));
  const du = (u1 - u0) / n;
  // reuse the caller's buffer: this runs every frame, and the samples are
  // consumed immediately by the draw pass
  while (out.length < n + 1)
    out.push({ x: 0, y: 0, u: 0, slope: 0, steepness: 0, foam: 0 });
  out.length = n + 1;

  for (let i = 0; i <= n; i++) {
    const u = u0 + i * du;
    const pt = surfacePoint(p, u, t);
    const s = out[i];
    s.u = u;
    s.x = pt.x;
    s.y = pt.y;
  }

  const env = Math.max(1e-3, waveEnvelope(p));
  const ramp = 0.22;
  for (let i = 0; i <= n; i++) {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(n, i + 1);
    const a = out[lo];
    const b = out[hi];
    const span = (hi - lo) * du;
    const ddx = b.x - a.x;
    const ddy = b.y - a.y;
    const s = out[i];
    s.slope = Math.abs(ddx) < 1e-6 ? 0 : ddy / ddx;
    // <1 means the trace is compressed here: a Gerstner cusp
    const compress = span === 0 ? 1 : ddx / span;
    s.steepness = clamp01(1 - compress);
    const up = clamp01(-s.y / (env * 0.5));
    // patchiness: only some crests in a set break, and the breaking band
    // travels along the crest rather than sitting still
    const patch =
      1 -
      p.foamPatchiness *
        (1 -
          fbm01(p.seed + 9187, (s.x - t * 18) / 160, t * 0.25, { octaves: 2 }));
    s.foam = clamp01(
      smoothstep(p.foamStart, p.foamStart + ramp, s.steepness) *
        up *
        patch *
        p.foamAmount,
    );
  }
  return out;
}

export interface FoamRun {
  /** indices into the traced sample array, inclusive */
  from: number;
  to: number;
  /** peak foam value over the run */
  peak: number;
}

/**
 * Contiguous stretches of a trace whose foam clears `min`. Drawing these as
 * separate capped strokes (rather than one long line with varying alpha) is
 * what makes whitecaps read as discrete breaking crests.
 */
export function foamRuns(
  samples: readonly SurfaceSample[],
  min = 0.06,
): FoamRun[] {
  const runs: FoamRun[] = [];
  let from = -1;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const on = samples[i].foam >= min;
    if (on) {
      if (from < 0) {
        from = i;
        peak = 0;
      }
      peak = Math.max(peak, samples[i].foam);
    } else if (from >= 0) {
      if (i - from >= 2) runs.push({ from, to: i - 1, peak });
      from = -1;
    }
  }
  if (from >= 0 && samples.length - from >= 2)
    runs.push({ from, to: samples.length - 1, peak });
  return runs;
}

export interface Glint {
  /** index into the traced sample array */
  at: number;
  /** 0..1 brightness */
  k: number;
}

/**
 * Sun glitter: the specular path that runs from the viewer to the sun. A facet
 * flashes when its slope points light at the camera, so we key off how close
 * the local slope is to the sun's lean and fade the whole path out with
 * horizontal distance from the sun's world x. `t` churns which facets are lit,
 * which is what makes the path sparkle rather than sit there.
 */
export function glints(
  samples: readonly SurfaceSample[],
  sunX: number,
  sunLean: number,
  spread: number,
  strength: number,
  t = 0,
): Glint[] {
  if (strength <= 0) return [];
  const out: Glint[] = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    // the facet mirrors the sun only when its slope is close to the half-angle;
    // a wide window here turns the whole waterline into one continuous ribbon
    const aim = 1 - clamp01(Math.abs(s.slope - sunLean) / 0.16);
    if (aim <= 0.05) continue;
    const near = 1 - clamp01(Math.abs(s.x - sunX) / Math.max(1, spread));
    // and only some facets are aimed *exactly* right at any instant: gate on a
    // hash that churns with time, so the path sparkles instead of glowing
    const flick = hash01(Math.round(s.x * 0.7) * 131 + Math.round(t * 9) * 17);
    if (flick < 0.62) continue;
    const k = aim * aim * near * near * strength * (0.4 + flick * 0.6);
    if (k > 0.03) out.push({ at: i, k });
  }
  return out;
}

export interface CausticCell {
  /** world x of the bright filament */
  x: number;
  /** half-length, world units */
  half: number;
  /** how far under the surface it focuses, world units */
  depth: number;
  /** 0..1 brightness */
  k: number;
}

/**
 * Caustics are the surface acting as a lens: light focuses under the *troughs*,
 * where the water face is concave. Deriving them from the same trace (rather
 * than an unrelated sine) keeps the bright filaments locked to the waves
 * overhead.
 *
 * One cell per focus, not one per sample: emitting at every concave point
 * produces a solid band that reads as a horizontal stripe across the screen,
 * so this keeps only the local maxima of concavity — the actual foci — and
 * scatters their depth so they never line up into rows.
 */
export function causticCells(
  p: WaveParams,
  samples: readonly SurfaceSample[],
  t: number,
  strength: number,
): CausticCell[] {
  if (strength <= 0 || samples.length < 5) return [];
  const curv = (i: number): number =>
    samples[i - 1].y - 2 * samples[i].y + samples[i + 1].y;
  const out: CausticCell[] = [];
  for (let i = 2; i < samples.length - 2; i++) {
    const c = curv(i);
    // concave up (a trough) and more so than either neighbour: a focus
    if (c >= 0 || c > curv(i - 1) || c >= curv(i + 1)) continue;
    const x = samples[i].x;
    const k =
      clamp01(-c * 9) *
      fbm01(p.seed + 271, x / 90 + t * 0.7, t * 0.4, { octaves: 2 }) *
      strength;
    if (k < 0.05) continue;
    out.push({
      x,
      half: 5 + k * 9,
      // spread the foci through the sunlit band instead of banding them
      depth: 16 + hash01(Math.round(x * 0.1)) * 90,
      k,
    });
  }
  return out;
}
