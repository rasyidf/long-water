/** Follows the whale with lead, and decays screen shake (stored on the camera). */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class CameraSystem implements System {
  readonly name = "camera";

  init(ctx: GameContext): void {
    ctx.bus.on("fx:shake", (amt) => {
      ctx.camera.shake = Math.max(ctx.camera.shake, amt);
    });
    ctx.bus.on("game:restart", () => (ctx.camera.shake = 0));
  }

  update(dt: number, ctx: GameContext): void {
    const { whale, camera } = ctx;
    camera.follow(
      whale.x,
      whale.y,
      whale.vx * 0.42,
      whale.vy * 0.28,
      whale.speed,
      dt,
    );
    camera.clampScale(0.05, 4);
    camera.shake *= Math.exp(-dt / 0.18);
  }
}
