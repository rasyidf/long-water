/**
 * Tuning for the trick / milestone scoring layer. Point values, the flow-combo
 * curve, and milestone thresholds live here so `ScoreSystem` stays logic and
 * this file stays numbers — the same split every other mechanic uses. Nothing
 * here touches the stage, so it lives beside the system, not in `constants.ts`.
 */

/** seconds a flow chain survives without a fresh trick before it lapses */
export const COMBO_WINDOW = 4.5;

/**
 * Multiplier at flow step 0,1,2,3,4,5+. Step 0 is a lone trick (1x); each trick
 * landed while the chain is still alive advances one step. Index is clamped to
 * the last entry.
 */
export const COMBO_LADDER = [1, 1.5, 2, 3, 4, 6] as const;

/** base points, before the flow multiplier is applied */
export const POINTS = {
  /** clearing the surface at all, scaled 0.4..1 by airtime */
  breachBase: 120,
  /** added per completed aerial rotation */
  perFlip: 260,
  /** clean, nose-first re-entry (cleanArc >= CLEAN_ARC) on a rotating trick */
  cleanEntry: 180,
  /** flat / backwards splashdown — the trick's points are scaled by this */
  bellyFlopMul: 0.25,
  /** came down inside a live krill swarm */
  splashFeast: 150,
  /** a lunge-feeding pass stripped a swarm (`krill:fed`) */
  krillFeast: 90,
  /** each whale that falls in behind the pod */
  podJoin: 200,
  /** the pod sang a chorus */
  chorus: 120,
  /** passed close to a ship hull at speed without spooking the pod */
  closePass: 160,
} as const;

/**
 * cleanArc is 0..1: how square the re-entry was to a whole number of turns
 * (1 = landed pointing exactly the way it launched, 0 = half a turn off).
 * At/above CLEAN_ARC a rotating trick earns the clean-entry bonus; at/below
 * BELLY_FLOP it is a flop.
 */
export const CLEAN_ARC = 0.82;
export const BELLY_FLOP = 0.35;

/** distance milestone: one every this many km covered along the leg */
export const KM_MILESTONE_STEP = 2;
export const KM_MILESTONE_POINTS = 250;

/** depth milestones: `[id, minY in world units, points]`, 1u = 0.1 m */
export const DEPTH_MILESTONES: readonly [string, number, number][] = [
  ["dark", 1800, 200], // past the light line, full dark
  ["deep", 4000, 450],
  ["abyssal", 7000, 900],
];

/** pod-size milestones: `[followers, points]` */
export const POD_MILESTONES: readonly [number, number][] = [
  [1, 150],
  [3, 400],
  [6, 900],
];

/** horizontal distance (u) to a hull centre that counts as a close pass */
export const CLOSE_PASS_RANGE = 340;
/** speed (u/s) the whale must carry through the pass for it to score */
export const CLOSE_PASS_SPEED = 340;
