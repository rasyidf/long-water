/**
 * Draws every deep-water squid into the `predators` layer, delegating the body
 * to a swappable `SquidView`. A pure consumer of `SquidSystem` state — culls to
 * the viewport, works out how visible each animal is at its depth, and hands it
 * to the view.
 */
import { lightAt } from "../core/light";
import { clamp01, type Vec2 } from "../core/math";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { ProceduralSquidView } from "./squid/ProceduralSquidView";
import { squidLook } from "./squid/params";
import type { SquidView } from "./squid/SquidView";

export class SquidRenderer implements System {
  readonly name = "render:squid";

  /** scratch grip target, rewritten for the latched squid each frame */
  private readonly grip: Vec2 = { x: 0, y: 0 };

  constructor(private view: SquidView = new ProceduralSquidView()) {}

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, whale } = ctx;
    const g = L.predators;
    g.clear();

    const look = squidLook();
    // the longest reach any part of the body has from the centre — the two
    // tentacles trailing straight back — so the cull margin scales with size
    const reach = look.mantleLen * (1 + look.tentLen * 1.3) + look.headR;

    for (const sq of ctx.squid.squids) {
      const margin = reach * sq.size;
      const [vx0, vx1] = cam.visibleX(margin);
      if (sq.x < vx0 || sq.x > vx1) continue;
      const sy = cam.sy(sq.y);
      const mpx = margin * cam.scale;
      if (sy < -mpx || sy > cam.vh + mpx) continue;

      // A squid lives in the dark and is mostly seen by its glow, so the body
      // fades with the ambient light at its depth — but never quite to nothing
      // while it's worked up, so the silhouette behind the photophores reads.
      const alpha = clamp01(
        Math.max(lightAt(sq.y) * 0.95, 0.18 + 0.3 * sq.arousal),
      );
      if (alpha <= 0.02) continue;

      // A latched squid sits at its grip point on the whale, arms toward the
      // body — so the thing its tentacles wrap onto is the whale itself.
      let gripAt: Vec2 | null = null;
      if (sq.state === "latched") {
        this.grip.x = whale.body.x;
        this.grip.y = whale.body.y;
        gripAt = this.grip;
      }

      this.view.draw(g, sq, { alpha, look, gripAt }, cam);
    }
  }
}
