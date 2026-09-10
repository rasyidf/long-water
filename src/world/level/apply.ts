/**
 * Interprets a `LevelDef`'s `spawns` into the dynamic stores. Replaces the old
 * `world/WorldSpawner.ts`. Directives run in file order — that order is the rng
 * draw order, so it must not be shuffled for a level that cares about its seed.
 */
import type { Rng } from "../../core/rng";
import type { Heightfield } from "../Heightfield";
import {
  emitCoral,
  emitKrill,
  emitSchools,
  emitShips,
  emitSnow,
  emitWhales,
  type Stores,
} from "./emitters";
import type { LevelDef } from "./schema";

export function applyLevel(
  def: LevelDef,
  rng: Rng,
  world: Heightfield,
  stores: Stores,
): void {
  for (const d of def.spawns) {
    switch (d.kind) {
      case "krill":
        emitKrill(rng, world, stores, d);
        break;
      case "school":
        emitSchools(rng, world, stores, d);
        break;
      case "whale":
        emitWhales(rng, world, stores, d);
        break;
      case "ship":
        emitShips(rng, world, stores, d);
        break;
      case "coral":
        emitCoral(rng, world, stores, d);
        break;
      case "snow":
        emitSnow(rng, world, stores, d);
        break;
    }
  }
}
