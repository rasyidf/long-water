/** Advances the player whale's wake trail and backbone after it has moved. */
import { applyUndulation, chaseChain, strokeAmpFor } from "../core/SpineChain";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class SpineSystem implements System {
  readonly name = "spine";

  update(dt: number, ctx: GameContext): void {
    const { whale } = ctx;
    whale.trail.push(whale.x, whale.y);
    chaseChain(whale.spineBase, whale.x, whale.y, whale.len);
    
    // INTERPOLATE THE AMPLITUDE:
    // Initialize this on the whale state if it doesn't exist
    if (whale.strokeAmp === undefined) whale.strokeAmp = 3; 
    
    const targetAmp = strokeAmpFor(whale.speed);
    // 6.0 is the catch-up speed. Higher = faster transition.
    whale.strokeAmp += (targetAmp - whale.strokeAmp) * Math.min(1, dt * 6.0);

    applyUndulation(
      whale.spine,
      whale.spineBase,
      whale.wag * 2.0,
      whale.strokeAmp
    );
  }
}
