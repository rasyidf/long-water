/** Ships just track along the lane. Their noise footprint is read by PodSystem. */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class ShipSystem implements System {
  readonly name = "ship";

  update(dt: number, ctx: GameContext): void {
    for (const s of ctx.ships.ships) s.x += s.v * dt;
  }
}
