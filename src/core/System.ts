/**
 * A system is one slice of behaviour. It gets the context once at construction
 * (or via `init`) and runs every frame while the game is running. Renderers use
 * the same shape but implement `render` instead of `update`.
 *
 * The order systems are registered in `Game` is the order they run.
 */
import type { GameContext } from "./GameContext";

export interface System {
  readonly name: string;
  /** called once after the context is fully assembled */
  init?(ctx: GameContext): void;
  /** simulation step; skipped when the game is not running */
  update?(dt: number, ctx: GameContext): void;
  /** draw step; runs every frame regardless of running state */
  render?(ctx: GameContext): void;
  /** release listeners / display objects */
  dispose?(): void;
}
