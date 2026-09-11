/**
 * The dial set for the reef coral, plus the module-level override the dev
 * tools drive — the same shape as `render/ocean/params.ts`.
 *
 * The game never calls `setCoralParams`; it renders `CORAL_DEFAULTS`. The
 * procgen viewer (`tools.html#coral`) pushes a live object in so every slider
 * lands on the next frame without rebuilding the scene.
 */
import type { CurrentParams } from "./geometry";

export interface CoralParams extends CurrentParams {
  /** overall height multiplier on top of the item's own `scale` */
  heightScale: number;
  /** overall width / spread multiplier */
  spread: number;
  /** staghorn fork depth, 1..4 */
  branchDepth: number;
  /** staghorn fork angle multiplier */
  branchSpread: number;
  /** 0..2 how far the current bends everything (0 freezes the reef) */
  sway: number;
  /** 0..2 fan-membrane ripple amplitude */
  flutter: number;
  /** 0..2 how many polyps / buds / tentacles are drawn */
  polypDensity: number;
  /** 0..2 how strongly polyps and tube mouths breathe */
  polypPulse: number;
  /** 0..1 how far each item's hue drifts toward a neighbouring kind's */
  hueJitter: number;
  /** 0..1 base fraction the body colour sinks toward the water */
  sink: number;
  /** 0..2 strength of the sunlit rim highlight */
  rim: number;
  /** current-field seed */
  seed: number;
}

/** tuned to the look the reef pass shipped with (`docs/reef-and-wfc-notes.md` §2) */
export const CORAL_DEFAULTS: CoralParams = {
  heightScale: 1,
  spread: 1,
  branchDepth: 3,
  branchSpread: 1,
  sway: 1,
  currentSpeed: 1,
  currentScale: 900,
  gust: 0.45,
  flutter: 1,
  polypDensity: 1,
  polypPulse: 1,
  hueJitter: 1,
  sink: 0.36,
  rim: 1,
  seed: 7,
};

let active: CoralParams = CORAL_DEFAULTS;

/** the params every coral renderer reads this frame */
export const coralParams = (): CoralParams => active;

/** Dev tools only: swap in a live params object (pass `null` to restore). */
export function setCoralParams(p: CoralParams | null): void {
  active = p ?? CORAL_DEFAULTS;
}

/** copy, for a tool that wants an editable starting point */
export const cloneCoralParams = (
  p: CoralParams = CORAL_DEFAULTS,
): CoralParams => ({ ...p });
