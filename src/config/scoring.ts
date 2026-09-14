/**
 * Tuning for the trick / milestone scoring layer. Point values, the flow-combo
 * curve, and milestone thresholds live here so `ScoreSystem` stays logic and
 * this file stays numbers — the same split every other mechanic uses. Nothing
 * here touches the stage, so it lives beside the system, not in `constants.ts`.
 */

/** seconds a flow chain survives without a fresh trick before it lapses */
export const COMBO_WINDOW = 5.2;

/**
 * Multiplier at flow step 0..8+. Step 0 is a lone trick (1x); each trick
 * landed while the chain is still alive advances one step. Index is clamped to
 * the last entry.
 */
export const COMBO_LADDER = [1, 1.5, 2, 3, 4, 6, 8, 10, 15] as const;

/** base points, before the flow multiplier is applied */
export const POINTS = {
  /** clearing the surface at all, scaled 0.4..1 by airtime */
  breachBase: 150,
  /** added per completed aerial rotation */
  perFlip: 300,
  /** clean, nose-first re-entry (cleanArc >= CLEAN_ARC) on a rotating trick */
  cleanEntry: 220,
  /** speed bled to near zero exactly at the top of the arc */
  perfectApex: 350,
  /** flat / backwards splashdown — the trick's points are scaled by this */
  bellyFlopMul: 0.1,
  /** flat, hard, non-rotating splashdown */
  tailSlap: 90,
  /** came down inside a live krill swarm */
  splashFeast: 180,
  /** a lunge-feeding pass stripped a swarm (`krill:fed`) */
  krillFeast: 90,
  /** dragged along the seabed at speed */
  barnacleScrape: 140,
  /** each whale that falls in behind the pod */
  podJoin: 250,
  /** the pod sang a chorus */
  chorus: 150,
  /** held station inside a crowd of followers for one drafting tick */
  formationDrafting: 80,
  /** passed close to a ship hull at speed without spooking the pod */
  closePass: 200,
  /** dodged a squid strike — scaled 0.3..1 by how close it came */
  squidDodge: 280,
  /** shook a latched squid off yourself */
  squidShaken: 300,
  /** the pod tore a latched squid off for you */
  squidPodDefense: 400,
  /** shook a latched squid off with a hard enough breach */
  breachEvasion: 500,
} as const;

/**
 * cleanArc is 0..1: how square the re-entry was to a whole number of turns
 * (1 = landed pointing exactly the way it launched, 0 = half a turn off).
 * At/above CLEAN_ARC a rotating trick earns the clean-entry bonus; at/below
 * BELLY_FLOP it is a flop.
 */
export const CLEAN_ARC = 0.88;
export const BELLY_FLOP = 0.4;

/** distance milestone: one every this many km covered along the leg */
export const KM_MILESTONE_STEP = 2.5;
export const KM_MILESTONE_POINTS = 350;

/** depth milestones: `[id, minY in world units, points]`, 1u = 0.1 m */
export const DEPTH_MILESTONES: readonly [string, number, number][] = [
  ["twilight", 800, 150], // mesopelagic — the light starts to fade
  ["dark", 1800, 250], // past the light line, full dark
  ["deep", 4000, 500],
  ["abyssal", 7000, 1000],
  ["trench", 11000, 2500], // the ocean floor
];

/** pod-size milestones: `[followers, points]` */
export const POD_MILESTONES: readonly [number, number][] = [
  [1, 150],
  [3, 400],
  [6, 900],
  [12, 2000],
  [25, 5000],
];

/** horizontal distance (u) to a hull centre that counts as a close pass */
export const CLOSE_PASS_RANGE = 300;
/** speed (u/s) the whale must carry through the pass for it to score */
export const CLOSE_PASS_SPEED = 380;
