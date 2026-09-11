/**
 * The options panel, shared by the title screen and the pause menu: master
 * volume, the controls reference, and (from the title only) resetting almanac
 * progress. Volume persists in `localStorage["long-water:opts"]` and is pushed
 * out through `onVolume`, which `Game` forwards to the live run as
 * `audio:volume`.
 */
import { t } from "../i18n";
import { $, setShown, isShown } from "./dom";

const OPTS_KEY = "long-water:opts";

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

/** the controls reference, `[keys, i18n key]` */
const CONTROLS: [string, string][] = [
  ["W A S D", "controls.wasd"],
  ["Shift", "controls.shift"],
  ["Space", "controls.space"],
  ["Esc", "controls.esc"],
  ["R", "controls.r"],
];

export interface OptionsHooks {
  onVolume(v: number): void;
  onReset(): void;
}

export class Options {
  private el = $("options");
  private slider = $<HTMLInputElement>("optVolume");
  private volNum = $("optVolumeNum");
  private resetBtn =
    this.el.querySelector<HTMLButtonElement>('[data-act="reset"]')!;
  private opts = readOpts();
  private onClose: (() => void) | null = null;
  private armed = 0;

  constructor(private readonly hooks: OptionsHooks) {
    this.localize();
    this.slider.value = String(Math.round(this.opts.volume * 100));
    this.volNum.textContent = `${this.slider.value}%`;
    this.slider.addEventListener("input", () => {
      this.opts.volume = Number(this.slider.value) / 100;
      this.volNum.textContent = `${this.slider.value}%`;
      writeOpts(this.opts);
      this.hooks.onVolume(this.opts.volume);
    });
    this.el.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest("button")?.dataset.act;
      if (act === "back") this.close();
      else if (act === "reset") this.reset();
    });
  }

  get volume(): number {
    return this.opts.volume;
  }

  get isOpen(): boolean {
    return isShown(this.el);
  }

  /** `canReset` shows the progress wipe (title only — not mid-run) */
  open(canReset: boolean, onClose: () => void): void {
    this.onClose = onClose;
    this.resetBtn.hidden = !canReset;
    this.disarm();
    setShown(this.el, true);
    this.slider.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    setShown(this.el, false);
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  /** two-step: the first press arms it, a second within 3 s wipes */
  private reset(): void {
    if (!this.armed) {
      this.resetBtn.textContent = t("options.resetConfirm");
      this.resetBtn.classList.add("armed");
      this.armed = window.setTimeout(() => this.disarm(), 3000);
      return;
    }
    this.disarm();
    this.hooks.onReset();
    this.resetBtn.textContent = t("options.resetDone");
  }

  private disarm(): void {
    clearTimeout(this.armed);
    this.armed = 0;
    this.resetBtn.textContent = t("options.reset");
    this.resetBtn.classList.remove("armed");
  }

  private localize(): void {
    this.el.querySelector("h2")!.textContent = t("options.title");
    this.el.querySelector(".opt-volume span")!.textContent =
      t("options.volume");
    this.el.querySelector("h3")!.textContent = t("options.controls");
    this.el.querySelector(".keys")!.innerHTML = CONTROLS.map(
      ([k, key]) => `<b>${k}</b><span>${t(key)}</span>`,
    ).join("");
    this.el.querySelector('[data-act="back"]')!.textContent = t("menu.back");
  }
}
