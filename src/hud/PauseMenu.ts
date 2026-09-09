/**
 * Escape → pause. Owns the pause overlay and its actions (resume, restart,
 * save, load, options, exit). Pause is expressed as `game:pause` / `game:resume`
 * on the bus; `Game` halts the simulation while paused, renderers keep drawing
 * the frozen frame.
 */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { t } from "../i18n";
import { hasSave, load, save } from "../state/Snapshot";

const OPTS_KEY = "long-water:opts";
const $ = (id: string) => document.getElementById(id)!;

interface Opts {
  volume: number;
}
function readOpts(): Opts {
  try {
    const raw = localStorage.getItem(OPTS_KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<Opts>;
      if (typeof o.volume === "number")
        return { volume: Math.max(0, Math.min(1, o.volume)) };
    }
  } catch {
    /* fall through to default */
  }
  return { volume: 1 };
}
function writeOpts(o: Opts): void {
  try {
    localStorage.setItem(OPTS_KEY, JSON.stringify(o));
  } catch {
    /* storage unavailable — options just won't persist */
  }
}

export class PauseMenu implements System {
  readonly name = "hud:menu";

  private menu = $("menu");
  private note = $("menuNote");
  private optionsPanel = $("menuOptions");
  private volume = $("optVolume") as HTMLInputElement;
  private paused = false;
  private ctx!: GameContext;
  private noteTimer = 0;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.localize();

    const opts = readOpts();
    this.volume.value = String(Math.round(opts.volume * 100));
    ctx.bus.emit("audio:volume", opts.volume);
    this.volume.addEventListener("input", () => {
      const v = Number(this.volume.value) / 100;
      ctx.bus.emit("audio:volume", v);
      writeOpts({ volume: v });
    });

    this.menu.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button");
      if (btn?.dataset.act) this.act(btn.dataset.act);
    });

    ctx.bus.on("game:pause", () => this.open());
    ctx.bus.on("game:resume", () => this.close());
    ctx.bus.on("game:over", () => {
      if (this.paused) ctx.bus.emit("game:resume");
    });
  }

  /** fill the static `#menu` DOM from the string table */
  private localize(): void {
    this.menu.querySelector("h2")!.textContent = t("menu.title");
    for (const btn of this.menu.querySelectorAll<HTMLButtonElement>(
      "button[data-act]",
    )) {
      btn.textContent = t(`menu.${btn.dataset.act}`);
    }
    const volumeLabel = this.optionsPanel.querySelector("label")?.firstChild;
    if (volumeLabel) volumeLabel.textContent = t("menu.volume");
  }

  /** called from Input on Escape */
  toggle(): void {
    const { clock, whale } = this.ctx;
    if (!clock.started || whale.done || !whale.alive) return;
    this.ctx.bus.emit(this.paused ? "game:resume" : "game:pause");
  }

  private act(action: string): void {
    const { bus } = this.ctx;
    switch (action) {
      case "resume":
        bus.emit("game:resume");
        break;
      case "restart":
        location.reload();
        break;
      case "save":
        this.flash(
          save(this.ctx) ? t("menu.note.saved") : t("menu.note.saveFail"),
        );
        break;
      case "load":
        if (!hasSave()) this.flash(t("menu.note.noSave"));
        else if (load(this.ctx)) {
          this.flash(t("menu.note.loaded"));
          bus.emit("game:resume");
        } else this.flash(t("menu.note.wrongWorld"));
        break;
      case "options":
        this.optionsPanel.hidden = !this.optionsPanel.hidden;
        break;
      case "exit":
        // drop any ?seed= override and return to the default-world title
        location.href = location.pathname;
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
    this.optionsPanel.hidden = true;
    this.note.classList.remove("show");
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
