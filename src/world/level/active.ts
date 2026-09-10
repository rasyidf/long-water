/**
 * Holds the resolved level for the current run. `Game.boot` calls
 * `setActiveLevel` once, before the world is built; everything downstream
 * (`config/route.ts`, `config/zones.ts`, `Heightfield`, renderers) reads it
 * through `getLevel()`. Kept dependency-free so any module can import it.
 */
import type { LevelDef } from "./schema";

let active: LevelDef | null = null;

export function setActiveLevel(def: LevelDef): void {
  active = def;
}

export function getLevel(): LevelDef {
  if (!active) throw new Error("getLevel() before setActiveLevel()");
  return active;
}
