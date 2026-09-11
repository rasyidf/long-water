/**
 * Escape → pause. Owns the pause overlay and its actions (resume, restart,
 * save, load, options, exit). Pause is expressed as `game:pause` / `game:resume`
 * on the bus; `Game` halts the simulation while paused, renderers keep drawing
 * the frozen frame.
 *
 * One instance lives for the whole page: its DOM listeners are wired once in
 * the constructor, and `init` re-binds it to each new run's context. Restart,
 * load, options and exit are handed back to `Game` through `PauseHooks` — they
 * rebuild the run in place rather than reloading the page.
 */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { t } from "../i18n";
import { save, saveMeta } from "../state/Snapshot";

const $ = (id: string) => document.getElementById(id)!;

export interface PauseHooks {
  restart(): void;
  /** rehydrate the current world from the save slot; false if it didn't match */
  load(): boolean;
  exit(): void;
  /** open the shared options panel; call `onClose` when it shuts */
  options(onClose: () => void): void;
}

export class PauseMenu implements System {
  readonly name = "hud:menu";

  private menu = $("menu");
  private note = $("menuNote");
  private paused = false;
  private ctx: GameContext | null = null;
  private noteTimer = 0;

  constructor(private readonly hooks: PauseHooks) {
    this.localize();
    this.menu.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button");
      if (btn?.dataset.act) this.act(btn.dataset.act);
    });
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.bus.on("game:pause", () => this.open());
    ctx.bus.on("game:resume", () => this.close());
    ctx.bus.on("game:over", () => {
      if (this.paused) ctx.bus.emit("game:resume");
    });
  }

  /** the run is being torn down — never leave the overlay up over the next */
  dispose(): void {
    this.close();
    this.ctx = null;
  }

  /** fill the static `#menu` DOM from the string table */
  private localize(): void {
    this.menu.querySelector("h2")!.textContent = t("menu.title");
    for (const btn of this.menu.querySelectorAll<HTMLButtonElement>(
      "button[data-act]",
    )) {
      btn.textContent = t(`menu.${btn.dataset.act}`);
    }
  }

  /** called from Input on Escape */
  toggle(): void {
    if (!this.ctx) return;
    const { clock, whale, bus } = this.ctx;
    if (!clock.started || whale.done || !whale.alive) return;
    bus.emit(this.paused ? "game:resume" : "game:pause");
  }

  private act(action: string): void {
    const ctx = this.ctx;
    if (!ctx) return;
    switch (action) {
      case "resume":
        ctx.bus.emit("game:resume");
        break;
      case "restart":
        this.hooks.restart();
        break;
      case "save":
        this.flash(save(ctx) ? t("menu.note.saved") : t("menu.note.saveFail"));
        break;
      case "load":
        if (!saveMeta()) this.flash(t("menu.note.noSave"));
        else if (this.hooks.load()) {
          this.flash(t("menu.note.loaded"));
          ctx.bus.emit("game:resume");
        } else this.flash(t("menu.note.wrongWorld"));
        break;
      case "options":
        this.hooks.options(() =>
          this.menu
            .querySelector<HTMLButtonElement>('[data-act="options"]')
            ?.focus(),
        );
        break;
      case "exit":
        this.hooks.exit();
        break;
    }
  }

  private open(): void {
    this.paused = true;
    this.menu.hidden = false;
    (this.menu.querySelector("button") as HTMLButtonElement | null)?.focus();
  }

  private close(): void {
    this.paused = false;
    this.menu.hidden = true;
    this.note.classList.remove("show");
    if (this.menu.contains(document.activeElement))
      (document.activeElement as HTMLElement).blur();
  }

  private flash(msg: string): void {
    this.note.textContent = msg;
    this.note.classList.add("show");
    clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(
      () => this.note.classList.remove("show"),
      2000,
    );
  }
}
