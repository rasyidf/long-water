/** Advances the player whale's wake trail and backbone after it has moved. */
import { applyUndulation, chaseChain, strokeAmpFor } from "../core/SpineChain";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class SpineSystem implements System {
  readonly name = "spine";

  update(_dt: number, ctx: GameContext): void {
    const { whale } = ctx;
    whale.trail.push(whale.x, whale.y);
    chaseChain(whale.spineBase, whale.x, whale.y, whale.len);
    applyUndulation(
      whale.spine,
      whale.spineBase,
      whale.wag * 2.0,
      strokeAmpFor(whale.speed),
    );
  }
}
