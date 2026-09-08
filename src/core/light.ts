import { DARK_FULL, DARK_START } from "../config/constants";

/** Ambient light 0..1 at a given depth (world units). 1 at/above the surface. */
export function lightAt(y: number): number {
  if (y < 0) return 1;
  if (y < DARK_START) return 1 - 0.55 * (y / DARK_START);
  return Math.max(0, 0.45 * (1 - (y - DARK_START) / (DARK_FULL - DARK_START)));
}
