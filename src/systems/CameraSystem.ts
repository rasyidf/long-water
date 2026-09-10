/**
 * Cinematic camera director. Owns the world<->screen transform through a
 * `CameraRig`: speed-aware framing and zoom, an anticipatory velocity lead, a
 * subtle bank into turns, trauma-based screen shake, and event-driven "shots" —
 * the breach flip pulls wide and drops into brief slow motion, the splash-down
 * punches back in.
 */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { CameraRig } from "./camera/CameraRig";

export class CameraSystem implements System {
  readonly name = "camera";

  private readonly rig = new CameraRig();

  init(ctx: GameContext): void {
    this.rig.reset(ctx);
    const { bus, clock } = ctx;

    bus.on("fx:shake", (amt) => this.rig.addTrauma(amt));
    bus.on("game:start", () => this.rig.establish());
    bus.on("game:restart", () => {
      clock.timeScale = 1;
      this.rig.reset(ctx);
    });
    bus.on("game:over", () => (clock.timeScale = 1));

    bus.on("whale:breach", ({ flips, up }) =>
      this.rig.breach(flips, up, clock.t),
    );
    bus.on("whale:surfaced", ({ impactVy }) => this.rig.surface(-impactVy));
    bus.on("whale:submerged", () => this.rig.splashDown());
    bus.on("pod:joined", () => this.rig.podMoment());
    bus.on("pod:chorus", () => this.rig.podMoment());
  }

  update(dt: number, ctx: GameContext): void {
    this.rig.step(dt, ctx);
    ctx.camera.clampScale(0.05, 4);
  }
}
