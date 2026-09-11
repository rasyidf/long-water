/**
 * The dial set for the sea surface and the sky above it, plus the module-level
 * override the dev tools drive.
 *
 * The game never calls `setOceanParams` — it renders `OCEAN_DEFAULTS`. The
 * procgen viewer (`tools.html#ocean`) pushes a live object in so every slider
 * lands on the next frame without rebuilding the scene, the same way
 * `core/light.ts` lets the tools flatten the depth falloff.
 */
import { SUN_LEAN } from "../../config/constants";
import type { OceanDrawOptions, OceanSection } from "./OceanView";
import { skyLight, type SkyParams } from "./sky";
import type { WaveParams } from "./surface";

/** the near-surface water column: sunlit banding, god-rays and caustics */
export interface ColumnParams {
  /** how many stacked sunlit slabs hang under the waterline */
  slabs: number;
  /** world units the deepest slab reaches */
  slabDepth: number;
  /** 0..1 opacity of the topmost slab */
  slabAlpha: number;
  /** world units between god-rays */
  shaftSpacing: number;
  /** 0..1 master shaft brightness */
  shaftStrength: number;
  /** 0..1 how much fbm breaks each shaft up along its length */
  shaftWisp: number;
  /** 0..1 master caustic brightness */
  causticStrength: number;
}

export interface OceanParams {
  wave: WaveParams;
  sky: SkyParams;
  column: ColumnParams;
}

/**
 * Tuned to land on the look the game shipped with: a moderate swell under an
 * early-afternoon sky. `sky.timeOfDay` 0.543 is the hour whose derived light
 * lean works out to `SUN_LEAN`, so god-rays and ship shadows keep the angle
 * they were art-directed at.
 */
export const OCEAN_DEFAULTS: OceanParams = {
  wave: {
    seed: 1337,
    wind: 1,
    octaves: [
      { length: 1040, height: 11, speed: 1 },
      { length: 480, height: 7, speed: 1 },
      { length: 210, height: 4, speed: -1 },
      { length: 96, height: 1.8, speed: 1 },
    ],
    steep: 0.55,
    groupiness: 0.45,
    groupLength: 2600,
    chopHeight: 2.2,
    chopLength: 150,
    chopDrift: 26,
    foamStart: 0.24,
    foamAmount: 0.85,
    foamPatchiness: 0.6,
  },
  sky: {
    seed: 1337,
    timeOfDay: 0.543,
    cloudCover: 0.5,
    cloudScale: 0.42,
    cloudPuff: 0.72,
    cloudDrift: 1.2,
    cloudDecks: 3,
    cloudBase: 0.3,
    stars: 0.6,
    haze: 0.55,
    glitter: 0.8,
    birds: 1.4,
  },
  column: {
    slabs: 3,
    slabDepth: 340,
    slabAlpha: 0.5,
    shaftSpacing: 540,
    shaftStrength: 1,
    shaftWisp: 0.55,
    causticStrength: 1,
  },
};

let active: OceanParams = OCEAN_DEFAULTS;

/** the params every ocean renderer reads this frame */
export const oceanParams = (): OceanParams => active;

/** Dev tools only: swap in a live params object (pass `null` to restore). */
export function setOceanParams(p: OceanParams | null): void {
  active = p ?? OCEAN_DEFAULTS;
}

/** deep copy, for a tool that wants an editable starting point */
export const cloneOceanParams = (
  p: OceanParams = OCEAN_DEFAULTS,
): OceanParams => ({
  wave: { ...p.wave, octaves: p.wave.octaves.map((o) => ({ ...o })) },
  sky: { ...p.sky },
  column: { ...p.column },
});

/**
 * Horizontal run per unit of drop for sunlight, from the current sky. God-rays
 * and the shadows surface objects cast both read this so they agree on where
 * "up toward the sun" is; `SUN_LEAN` is the fallback when the sun is down and
 * the arc no longer means anything.
 */
export function sunLean(): number {
  const l = skyLight(active.sky.timeOfDay);
  return l.moon ? SUN_LEAN : l.lean;
}

// ── dev-tools draw-section hook ────────────────────────────────────────────

const DRAW_ALL: OceanDrawOptions = {};
let sections: ((s: OceanSection) => boolean) | null = null;

/** Dev tools only: hide named draw blocks so each one can be judged on its
 * own. Pass `null` to draw everything again. The game never calls this. */
export function setOceanSections(
  show: ((s: OceanSection) => boolean) | null,
): void {
  sections = show;
}

/** the draw options every ocean renderer passes through this frame */
export const oceanDrawOptions = (): OceanDrawOptions =>
  sections ? { show: sections } : DRAW_ALL;
