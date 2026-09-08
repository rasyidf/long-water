/**
 * Breath, reserves, drowning, and the two run-ending conditions. Kept apart
 * from locomotion so the resource rules can change without touching physics.
 */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class VitalsSystem implements System {
  readonly name = "vitals";
  private lowAirWarned = false;

  init(ctx: GameContext): void {
    ctx.bus.on("game:restart", () => (this.lowAirWarned = false));
  }

  update(dt: number, ctx: GameContext): void {
    const { whale, input, pod, bus, world } = ctx;
    if (whale.done || !whale.alive) return;

    const surging = input.surging && whale.breath > 0;

    if (whale.y < 60) {
      whale.breath = Math.min(100, whale.breath + 52 * dt);
      whale.drowning = 0;
    } else {
      whale.breath -=
        (0.8 + Math.min(1, whale.y / 3000) * 1.3 + (surging ? 1.8 : 0)) * dt;
    }
    if (whale.breath <= 0) {
      whale.breath = 0;
      whale.drowning += dt;
      whale.energy -= 11 * dt;
    }

    // drafting: a pod costs each whale less to move
    const draft = 1 / (1 + 0.2 * pod.followers().length);
    whale.energy -= (0.36 + (surging ? 0.8 : 0)) * draft * dt;

    if (whale.energy <= 0) {
      whale.energy = 0;
      whale.alive = false;
      bus.emit("game:over", { won: false });
    }
    if (whale.x >= world.finishX) {
      whale.done = true;
      bus.emit("game:over", { won: true });
    }

    if (!this.lowAirWarned && whale.breath < 26 && whale.y > 500) {
      this.lowAirWarned = true;
      bus.emit("hint:show", { text: "Surface. Now.", secs: 4 });
    }
  }
}
