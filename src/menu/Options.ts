/**
 * The options panel, shared by the title screen and the pause menu: master
 * volume, graphics quality, the controls reference, and (from the title only)
 * resetting almanac progress. Volume persists in `localStorage["long-water:opts"]`
 * and is pushed out through `onVolume`, which `Game` forwards to the live run
 * as `audio:volume`. Graphics live in `state/Quality` — every renderer reads
 * that store each frame, so a slider moved from the pause menu lands on the
 * very next frame behind the panel.
 */
import { t } from "../i18n";
import {
  applyQualityPreset,
  QUALITY_ITEMS,
  quality,
  qualityLevel,
  setQuality,
  type QualityKey,
  type QualityPreset,
  type QualitySettings,
} from "../state/Quality";
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

const PRESETS: readonly QualityPreset[] = ["low", "medium", "high"];

export interface OptionsHooks {
  onVolume(v: number): void;
  onReset(): void;
}

interface GfxControl {
  input: HTMLInputElement;
  value: HTMLElement;
}

export class Options {
  private el = $("options");
  private slider = $<HTMLInputElement>("optVolume");
  private volNum = $("optVolumeNum");
  private presets = $("gfxPresets");
  private items = $("gfxItems");
  private resetBtn =
    this.el.querySelector<HTMLButtonElement>('[data-act="reset"]')!;
  private opts = readOpts();
  private gfx = new Map<QualityKey, GfxControl>();
  private onClose: (() => void) | null = null;
  private armed = 0;

  constructor(private readonly hooks: OptionsHooks) {
    this.localize();
    this.buildGraphics();
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
    this.refreshGraphics();
    setShown(this.el, true);
    this.el.scrollTop = 0;
    this.slider.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    setShown(this.el, false);
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  // ── graphics ─────────────────────────────────────────────────────────────

  /** the preset row and one control per quality dial, built once from
   * `QUALITY_ITEMS` so a new dial only needs its string */
  private buildGraphics(): void {
    for (const name of PRESETS) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.preset = name;
      b.textContent = t(`quality.preset.${name}`);
      this.presets.append(b);
    }
    // "custom" is a state, not a choice: it lights up when a dial deviates
    const custom = document.createElement("button");
    custom.type = "button";
    custom.dataset.preset = "custom";
    custom.disabled = true;
    custom.textContent = t("quality.preset.custom");
    this.presets.append(custom);
    this.presets.addEventListener("click", (e) => {
      const name = (e.target as HTMLElement).closest("button")?.dataset
        .preset as QualityPreset | "custom" | undefined;
      if (!name || name === "custom") return;
      applyQualityPreset(name);
      this.refreshGraphics();
    });

    for (const it of QUALITY_ITEMS) {
      const row = document.createElement("label");
      row.className = `opt-row gfx-item ${it.kind}`;
      const name = document.createElement("span");
      name.textContent = t(`quality.${it.key}`);
      const input = document.createElement("input");
      if (it.kind === "toggle") {
        input.type = "checkbox";
      } else {
        input.type = "range";
        input.min = String(it.min);
        input.max = String(it.max);
        input.step = String(it.step);
      }
      const value = document.createElement("b");
      row.append(name, input, value);
      this.items.append(row);
      input.addEventListener("input", () => {
        const v = it.kind === "toggle" ? input.checked : Number(input.value);
        setQuality({ [it.key]: v } as Partial<QualitySettings>);
        this.refreshGraphics();
      });
      this.gfx.set(it.key, { input, value });
    }
    this.refreshGraphics();
  }

  /** mirror the live store into the controls and the preset highlight */
  private refreshGraphics(): void {
    const q = quality();
    const level = qualityLevel();
    for (const b of this.presets.querySelectorAll("button")) {
      b.setAttribute("aria-selected", String(b.dataset.preset === level));
    }
    for (const it of QUALITY_ITEMS) {
      const c = this.gfx.get(it.key)!;
      const v = q[it.key];
      if (it.kind === "toggle") {
        c.input.checked = v as boolean;
        c.value.textContent = t(v ? "quality.on" : "quality.off");
      } else {
        c.input.value = String(v);
        c.value.textContent = `${Math.round((v as number) * 100)}%`;
      }
    }
  }

  // ── progress reset ───────────────────────────────────────────────────────

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
    this.el.querySelector(".gfx-title")!.textContent = t("options.graphics");
    this.el.querySelector(".gfx-note")!.textContent = t("options.graphicsNote");
    this.el.querySelector(".ctl-title")!.textContent = t("options.controls");
    this.el.querySelector(".keys")!.innerHTML = CONTROLS.map(
      ([k, key]) => `<b>${k}</b><span>${t(key)}</span>`,
    ).join("");
    this.el.querySelector('[data-act="back"]')!.textContent = t("menu.back");
  }
}
