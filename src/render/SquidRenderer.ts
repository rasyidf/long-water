/**
 * Draws every deep-water squid into the `predators` layer, delegating the body
 * to a swappable `SquidView`. A pure consumer of `SquidSystem` state — culls to
 * the viewport, then hands each animal to the view.
 */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { ProceduralSquidView } from "./squid/ProceduralSquidView";
import type { SquidView } from "./squid/SquidView";

export class SquidRenderer implements System {
  readonly name = "render:squid";

  constructor(private view: SquidView = new ProceduralSquidView()) {}

  render(ctx: GameContext): void {
    const { camera: cam, layers: L } = ctx;
    const g = L.predators;
    g.clear();

    for (const sq of ctx.squid.squids) {
      if (Math.abs(sq.x - cam.x) > cam.vw / 2 / cam.scale + 900) continue;
      this.view.draw(g, sq, {}, cam);
    }
  }
}
