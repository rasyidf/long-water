/** Feeding: passing through a krill swarm converts krill into reserves.
 *  Automatic — no longer tied to Surge, which is purely a speed/stamina
 *  mechanic (see PlayerBrain / VitalsSystem). */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

// cosmetic jitter only — no gameplay determinism rides on this
function range(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

export class FeedingSystem implements System {
  readonly name = "feeding";

  update(dt: number, ctx: GameContext): void {
    const { whale, krill, bus, stats } = ctx;
    if (whale.done || !whale.alive) return;

    let fedThisFrame = 0;
    for (const s of krill.swarms) {
      if (s.amount <= 0) continue;
      if (Math.hypot(s.x - whale.x, (s.y - whale.y) * 1.5) >= s.r0 + 200)
        continue;

      const take = Math.min(s.amount, 46 * dt);
      if (s.amount === 100) {
        stats.fed++;
        fedThisFrame++;
      }
      s.amount -= take;
      whale.energy = Math.min(100, whale.energy + take * 0.78);
      s.lit = 1;
      s.panic = 1;
      if (s.parts.length > 12 && Math.random() < 0.5) s.parts.pop();
      if (Math.random() < 0.5)
        bus.emit("fx:bubbles", {
          x: whale.x + range(-90, 90),
          y: whale.y + range(-40, 40),
          count: 1,
          splash: false,
        });
    }
    if (fedThisFrame) bus.emit("krill:fed", { swarmsFed: fedThisFrame });
  }
}
