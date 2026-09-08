/** Title card and end card. Dismisses on start; fills in and reappears on
 * game over. Restart is a plain page reload (see `Input`). */
import { UNIT_M } from "../config/constants";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class Cards implements System {
  readonly name = "hud:cards";
  private card = document.getElementById("card")!;

  init(ctx: GameContext): void {
    ctx.bus.on("game:start", () => this.card.classList.add("gone"));
    ctx.bus.on("game:over", ({ won }) => this.showEnd(ctx, won));
  }

  private showEnd(ctx: GameContext, won: boolean): void {
    const { stats, whale, pod } = ctx;
    const n = pod.followers().length;
    const h1 = this.card.querySelector("h1")!;
    const p = this.card.querySelector("p")!;
    h1.innerHTML = won
      ? "Warm water<br><em>you made the crossing</em>"
      : "Out of reserves<br><em>the leg ends here</em>";
    p.textContent =
      (won
        ? "Twelve kilometres. "
        : `You covered ${((whale.x * UNIT_M) / 1000).toFixed(1)} km. `) +
      `${stats.answered} whales answered, ${stats.joined} joined you, ${stats.lost} ` +
      `were driven off by ship noise. ${n} still behind you at the end. ` +
      `${stats.fed} swarms fed on, ${stats.chorus} calls sung together.`;
    (this.card.querySelector(".keys") as HTMLElement).style.display = "none";
    (this.card.querySelector(".start") as HTMLElement).textContent =
      "Press R to swim it again";
    this.card.classList.remove("gone");
  }
}
