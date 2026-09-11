/**
 * The dial set for how a deep-water squid is built, plus the module-level
 * override the dev tools drive — the same shape as `render/ocean/params.ts`.
 *
 * The game never calls `setSquidLook`; it renders `SQUID_DEFAULTS`. The procgen
 * viewer (`tools.html#squid`) pushes a live object in so every slider lands on
 * the next frame, and the scene tab picks the same look up through
 * `squidLook()` so the two modes never disagree.
 *
 * Every length is in world units at `Squid.size === 1`; the ratios (`finLen`,
 * `armLen`, …) are fractions of the mantle length so the animal keeps its
 * proportions when only the mantle dial moves.
 */

export interface SquidLook {
  /** mantle length, base of the head to the tip, world units */
  mantleLen: number;
  /** mantle half-width at its fullest, world units */
  mantleW: number;
  /** head radius — deliberately *not* tied to the mantle's jet pulse */
  headR: number;
  /** where along the mantle (0 base .. 1 tip) the paired fins root */
  finRoot: number;
  /** how much of the mantle the fin root runs along */
  finLen: number;
  /** fin reach out from the mantle edge, as a multiple of `mantleW` */
  finSpan: number;
  /** arm length as a fraction of `mantleLen` */
  armLen: number;
  /** feeding-tentacle length as a fraction of `mantleLen` */
  tentLen: number;
  /** arm root half-width, world units */
  armW: number;
  /** lateral sway amplitude of a cruising arm, as a multiple of `mantleW` */
  armWave: number;
  /** 0..0.3 how far the mantle girth swings on each jet stroke */
  pulseDepth: number;
  /** 0..2 chromatophore fleck density */
  mottle: number;
  /** 0..1 how far per-individual proportions may wander from these dials */
  variety: number;
}

/** tuned to the silhouette the game shipped with (mantle 96 × 24) */
export const SQUID_DEFAULTS: SquidLook = {
  mantleLen: 96,
  mantleW: 24,
  headR: 17,
  finRoot: 0.5,
  finLen: 0.47,
  finSpan: 1.35,
  armLen: 0.72,
  tentLen: 1.5,
  armW: 8,
  armWave: 0.5,
  pulseDepth: 0.16,
  mottle: 1,
  variety: 1,
};

let active: SquidLook = SQUID_DEFAULTS;

/** the look every squid renderer reads this frame */
export const squidLook = (): SquidLook => active;

/** Dev tools only: swap in a live look object (pass `null` to restore). */
export function setSquidLook(p: SquidLook | null): void {
  active = p ?? SQUID_DEFAULTS;
}

/** copy, for a tool that wants an editable starting point */
export const cloneSquidLook = (p: SquidLook = SQUID_DEFAULTS): SquidLook => ({
  ...p,
});
