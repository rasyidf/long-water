/**
 * The route the player crosses in one run: its start, finish, length, and the
 * zones it passes through. The single source of truth for "how far is the leg" —
 * the HUD readout, the win condition (`Heightfield.finishX`) and the end card
 * all derive distance from here.
 *
 * Today there is one leg. A difficulty/variant pass turns `LEG` into `LEGS[]`
 * plus a `resolveLeg()` that reads `?leg=` or a setting; nothing downstream
 * changes because everything already goes through `LEG` / these helpers.
 */
import { UNIT_M, WORLD_W } from "./constants";
import { ZONES, type Zone } from "./zones";

export interface Leg {
  /** stable key; per-leg copy lives under `leg.<id>.*` in the i18n tables */
  id: string;
  /** world x the whale spawns at */
  startX: number;
  /** world x that ends the leg (the win line) */
  finishX: number;
  zones: Zone[];
}

export const LEG: Leg = {
  id: "crossing",
  startX: 700, // matches PlayerWhale start x
  finishX: WORLD_W - 400,
  zones: ZONES,
};

/** full leg length in km (the number the HUD counts up to) */
export const legLengthKm = (leg: Leg = LEG): number =>
  (leg.finishX * UNIT_M) / 1000;

/** distance travelled toward the finish, in km, never negative */
export const kmCovered = (x: number): number =>
  (Math.max(0, x) * UNIT_M) / 1000;
