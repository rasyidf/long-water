/**
 * Preview-only: holds the camera on the gallery frame and keeps the ambient
 * effects ticking — a frequent wide sonar ring (so the sonar-lit terrain, lit
 * fauna and glow pass show in almost any frame) and a light bubble stream.
 */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import type { PreviewFraming } from "../world/PreviewScene";

const PING_EVERY = 1.6;

export class PreviewDirector implements System {
  readonly name = "preview:director";
  private since = PING_EVERY;

  constructor(private framing: PreviewFraming) {}

  init(ctx: GameContext): void {
    this.pin(ctx);
  }

  update(dt: number, ctx: GameContext): void {
    this.pin(ctx);
    ctx.whale.breath = 100; // SongSystem drains it; nothing refills it here

    this.since += dt;
    if (this.since >= PING_EVERY) {
      this.since = 0;
      ctx.bus.emit("song:emitted", {
        x: this.framing.x,
        y: 360,
        strength: 2.2,
        friendly: true,
        chorus: 3,
      });
      ctx.bus.emit("fx:bubbles", {
        x: ctx.whale.x + 40,
        y: ctx.whale.y - 24,
        count: 6,
        splash: false,
        spread: 46,
      });
    }
  }

  private pin(ctx: GameContext): void {
    ctx.camera.x = this.framing.x;
    ctx.camera.y = this.framing.y;
    ctx.camera.scale = this.framing.scale;
  }
}
