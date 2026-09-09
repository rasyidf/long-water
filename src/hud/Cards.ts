/** The full-screen card. Renders any `CardContent` into `#card`; the title card
 * goes up on init, an end card on game over. Dismisses on start. Restart is a
 * plain page reload (see `Input`). */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { endCard, titleCard, type CardContent } from "./cardContent";

export class Cards implements System {
  readonly name = "hud:cards";
  private card = document.getElementById("card")!;

  init(ctx: GameContext): void {
    this.show(titleCard());
    ctx.bus.on("game:start", () => this.hide());
    ctx.bus.on("game:over", ({ won }) => this.show(endCard(ctx, won)));
  }

  /** Fill `#card` from `c` and reveal it. */
  show(c: CardContent): void {
    this.card.querySelector("h1")!.innerHTML = c.h1;
    this.card.querySelector("p")!.innerHTML = c.body;

    const keys = this.card.querySelector(".keys") as HTMLElement;
    if (c.keys) {
      keys.innerHTML = c.keys
        .map(([k, d]) => `<b>${k}</b><span>${d}</span>`)
        .join("");
      keys.style.display = "";
    } else {
      keys.style.display = "none";
    }

    if (c.start !== undefined) {
      (this.card.querySelector(".start") as HTMLElement).textContent = c.start;
    }
    this.card.classList.remove("gone");
  }

  hide(): void {
    this.card.classList.add("gone");
  }
}
