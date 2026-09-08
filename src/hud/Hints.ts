/** The single transient coaching line, bottom-left. Listens for `hint:show`. */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class Hints implements System {
  readonly name = "hud:hints";
  private el = document.getElementById("hint")!;
  private until = 0;

  init(ctx: GameContext): void {
    ctx.bus.on("hint:show", ({ text, secs }) => {
      this.el.textContent = text;
      this.el.classList.add("show");
      this.until = ctx.clock.t + secs;
    });
  }

  render(ctx: GameContext): void {
    if (this.until > 0 && ctx.clock.t >= this.until) {
      this.until = 0;
      this.el.classList.remove("show");
    }
  }
}
