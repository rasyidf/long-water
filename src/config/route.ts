/**
 * The leg the player crosses in one run: its start, finish and length. Now owned
 * by the active level file (`src/world/levels/<id>.json`, resolved in `Game`);
 * this module is the read-through the HUD, the win condition
 * (`Heightfield.finishX`) and the end card use so none of them import the level
 * layer directly.
 *
 * Per-leg copy still lives under `leg.<id>.*` in the i18n tables, keyed by the
 * level id.
 */
import { getLevel } from "../world/level/active";
import type { LevelLeg } from "../world/level/schema";
import { UNIT_M } from "./constants";

export type Leg = LevelLeg;

/** the active leg's start/finish (world x) */
export const activeLeg = (): LevelLeg => getLevel().leg;

/** the active level id — the key for `leg.<id>.*` / `zone.*` lookups */
export const legId = (): string => getLevel().id;

/** full leg length in km (the number the HUD counts up to) */
export const legLengthKm = (): number =>
  (getLevel().leg.finishX * UNIT_M) / 1000;

/** distance travelled toward the finish, in km, never negative */
export const kmCovered = (x: number): number =>
  (Math.max(0, x) * UNIT_M) / 1000;
