/**
 * Terrain vocabulary for the 1D wave-function-collapse seabed.
 *
 * Add a biome by adding a tile here and listing its legal neighbours in `RULES`.
 * `Wfc` / `Heightfield` consume this without further changes.
 */
export interface Tile {
  name: string;
  /** [min, max] depth band this tile emits, world units. */
  depth: [number, number];
  /** 0..~1.3 roughness multiplier for the fbm detail on top of the band. */
  rough: number;
  /** relative selection weight during collapse. */
  weight: number;
}

export const TILES: Tile[] = [
  { name: "shelf", depth: [850, 1150], rough: 0.25, weight: 2.2 },
  { name: "slope", depth: [1500, 2700], rough: 0.55, weight: 1.7 },
  { name: "plain", depth: [2950, 3250], rough: 0.2, weight: 3.0 },
  { name: "ridge", depth: [2000, 2500], rough: 1.0, weight: 1.1 },
  { name: "seamount", depth: [950, 1500], rough: 1.3, weight: 0.8 },
  { name: "canyon", depth: [3350, 3900], rough: 0.85, weight: 0.9 },
  { name: "trench", depth: [4100, 4600], rough: 0.45, weight: 0.5 },
];

export const TI: Record<string, number> = {};
TILES.forEach((t, i) => (TI[t.name] = i));

export const RULES: Record<string, string[]> = {
  shelf: ["shelf", "slope"],
  slope: ["shelf", "slope", "plain", "canyon"],
  plain: ["slope", "plain", "ridge", "seamount", "canyon", "trench"],
  ridge: ["plain", "ridge", "seamount"],
  seamount: ["plain", "ridge", "seamount"],
  canyon: ["slope", "plain", "canyon", "trench"],
  trench: ["plain", "canyon", "trench"],
};
