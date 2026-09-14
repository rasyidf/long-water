/**
 * Everything outside the swim itself: the title screen (New game / Continue /
 * Multiplayer / Options / Almanac), the end-of-run screen, the almanac and
 * options overlays, the "new in the almanac" toast, the opening controls
 * strip, and the curtain that hides a world rebuild. Lives for the whole page;
 * `Game` rebuilds runs underneath it and calls in here to switch screens.
 *
 * The current screen is mirrored to `<body data-screen>` so CSS can hide the
 * HUD on the title. Menus are real `<button>`s — mouse, Tab and Enter work as
 * usual — and arrows / WASD move focus spatially within whichever layer is on
 * top.
 */
import { CREATURES, TROPHIES, type TrophyTier } from "../config/almanac";
import { kmCovered } from "../config/route";
import { isTouchDevice } from "../core/touch";
import { t } from "../i18n";
import type { Profile } from "../state/Profile";
import type { SaveMeta } from "../state/Snapshot";
import type { AlmanacFind } from "../systems/AlmanacSystem";
import type { CardContent } from "../hud/cardContent";
import { Almanac, type AlmanacTab } from "./Almanac";
import { creatureArt, trophyArt } from "./art";
import { Credits } from "./Credits";
import { $, isShown, keyDir, moveFocus, setShown } from "./dom";
import { Options } from "./Options";

export type Screen = "title" | "play" | "end";

export interface FrontEndHooks {
  newGame(): void;
  continueGame(): void;
  /** swim the same leg again, straight from the end screen */
  restart(): void;
  toTitle(): void;
  onVolume(v: number): void;
}

/** ms the end screen ignores input, so keys mashed at the moment the run
 *  ends don't skip straight past it */
const END_GUARD_MS = 900;
/** ms the opening controls strip stays up */
const KEYHINT_MS = 9000;
/** ms per unlock toast */
const TOAST_MS = 3200;

export class FrontEnd {
  readonly options: Options;
  readonly almanac: Almanac;
  readonly credits = new Credits();

  private title = $("title");
  private end = $("end");
  private curtain = $("curtain");
  private toastEl = $("toast");
  private keyhint = $("keyhint");
  private titleNote = $("titleNote");
  private screen: Screen = "title";
  private busy = false;
  private toastQueue: AlmanacFind[] = [];
  private toastTimer = 0;
  private keyhintTimer = 0;
  private noteTimer = 0;

  constructor(
    private readonly profile: Profile,
    private readonly hooks: FrontEndHooks,
  ) {
    this.options = new Options({
      onVolume: (v) => hooks.onVolume(v),
      onReset: () => {
        profile.reset();
        this.refreshTitle();
      },
    });
    this.almanac = new Almanac(profile);
    this.localize();

    this.title.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest("button")?.dataset.act;
      if (act) this.titleAct(act);
    });
    this.end.addEventListener("click", (e) => {
      const act = (e.target as HTMLElement).closest("button")?.dataset.act;
      if (act === "title") hooks.toTitle();
      else if (act === "again") hooks.restart();
    });
    addEventListener("keydown", this.onKey);
  }

  get current(): Screen {
    return this.screen;
  }

  /** true while a screen change is in flight — ignore further requests */
  get transitioning(): boolean {
    return this.busy;
  }

  // ── screens ──────────────────────────────────────────────────────────────

  showTitle(save: SaveMeta | null): void {
    this.setScreen("title");
    setShown(this.end, false);
    this.fillContinue(save);
    this.refreshTitle();
    setShown(this.title, true);
    this.focusFirst(this.title);
  }

  /** the run is live: drop every menu, and on a fresh start show the
   *  controls strip for a few seconds */
  showPlay(fresh: boolean): void {
    this.setScreen("play");
    setShown(this.title, false);
    setShown(this.end, false);
    this.options.close();
    this.almanac.close();
    clearTimeout(this.keyhintTimer);
    this.keyhint.classList.toggle("show", fresh);
    if (fresh)
      this.keyhintTimer = window.setTimeout(
        () => this.keyhint.classList.remove("show"),
        KEYHINT_MS,
      );
  }

  showEnd(c: CardContent, finds: AlmanacFind[]): void {
    this.setScreen("end");
    this.keyhint.classList.remove("show");
    this.end.querySelector("h1")!.innerHTML = c.h1;
    this.end.querySelector("p")!.innerHTML = c.body;

    const list = this.end.querySelector<HTMLElement>(".end-finds")!;
    list.hidden = finds.length === 0;
    list.querySelector("h2")!.textContent = t("end.finds");
    list.querySelector("ul")!.innerHTML = finds
      .map((f) => `<li>${this.findChip(f)}</li>`)
      .join("");

    setShown(this.end, true);
    // hold input off briefly: the player is usually mid-keypress when it ends
    this.end.inert = true;
    window.setTimeout(() => {
      if (this.screen !== "end") return;
      this.end.inert = false;
      this.focusFirst(this.end);
    }, END_GUARD_MS);
  }

  /** is the end screen up and accepting input? (R goes back to the title) */
  get endReady(): boolean {
    return this.screen === "end" && !this.end.inert;
  }

  /**
   * Fade to black, run `work` (a world rebuild — a synchronous hitch), then
   * fade back up. Resolves once the curtain starts lifting.
   */
  async curtainOver(work: () => void): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.curtain.classList.add("on");
    await wait(340);
    try {
      work();
    } finally {
      // two frames so the rebuilt scene is on screen before it's revealed
      await nextFrame();
      await nextFrame();
      this.curtain.classList.remove("on");
      this.busy = false;
    }
  }

  /** a short line under the title menu (e.g. a save that failed to load) */
  note(msg: string): void {
    this.titleNote.textContent = msg;
    this.titleNote.classList.add("show");
    clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(
      () => this.titleNote.classList.remove("show"),
      3200,
    );
  }

  /** Escape: close the almanac / options if one is up. False if nothing
   *  consumed it, so the caller can treat it as pause. */
  escape(): boolean {
    if (this.almanac.isOpen) {
      this.almanac.close();
      return true;
    }
    if (this.options.isOpen) {
      this.options.close();
      return true;
    }
    if (this.credits.isOpen) {
      this.credits.close();
      return true;
    }
    return false;
  }

  /** open options over the pause menu; `onClose` hands focus back */
  openOptions(canReset: boolean, onClose: () => void): void {
    this.options.open(canReset, onClose);
  }

  // ── toast ────────────────────────────────────────────────────────────────

  /** queue a "new in the almanac" toast */
  toast(f: AlmanacFind): void {
    this.toastQueue.push(f);
    if (!this.toastTimer) this.nextToast();
  }

  private nextToast(): void {
    const f = this.toastQueue.shift();
    if (!f) {
      this.toastTimer = 0;
      this.toastEl.classList.remove("show");
      return;
    }
    this.toastEl.innerHTML = `<span class="kicker">${t(
      f.kind === "trophy" ? "toast.trophy" : "toast.creature",
    )}</span>${this.findChip(f)}`;
    this.toastEl.classList.add("show");
    this.toastTimer = window.setTimeout(() => {
      this.toastEl.classList.remove("show");
      this.toastTimer = window.setTimeout(() => this.nextToast(), 400);
    }, TOAST_MS);
  }

  /** drop queued toasts (a new run shouldn't replay the last one's) */
  clearToasts(): void {
    this.toastQueue.length = 0;
    clearTimeout(this.toastTimer);
    this.toastTimer = 0;
    this.toastEl.classList.remove("show");
  }

  // ── internals ────────────────────────────────────────────────────────────

  private titleAct(act: string): void {
    if (this.busy) return;
    switch (act) {
      case "new":
        this.hooks.newGame();
        break;
      case "continue":
        this.hooks.continueGame();
        break;
      case "options":
        this.options.open(true, () => this.refocus(this.title, act));
        break;
      case "almanac":
      case "trophies":
        this.openAlmanac(act === "trophies" ? "trophies" : "creatures", act);
        break;
      case "credits":
        this.credits.open(() => this.refocus(this.title, act));
        break;
    }
  }

  private openAlmanac(tab: AlmanacTab, from: string): void {
    this.almanac.open(tab, () => {
      this.refreshTitle();
      this.refocus(this.title, from);
    });
  }

  private fillContinue(save: SaveMeta | null): void {
    const btn = this.title.querySelector<HTMLButtonElement>(
      '[data-act="continue"]',
    )!;
    btn.disabled = !save;
    const meta = btn.querySelector("small")!;
    meta.textContent = save
      ? t("title.continueMeta", {
          km: kmCovered(save.x).toFixed(1),
          score: save.score.toLocaleString(),
          when: ago(save.savedAt),
        })
      : t("title.noSave");
  }

  /** trophy shelf + lifetime records + almanac progress */
  private refreshTitle(): void {
    const p = this.profile;
    const tiers: TrophyTier[] = ["gold", "silver", "bronze"];
    const shelf = tiers
      .map((tier) => {
        const n = TROPHIES.filter(
          (tr) => tr.tier === tier && p.hasTrophy(tr.id),
        ).length;
        return `<span class="cup ${tier}${n ? "" : " none"}">${trophyArt(tier)}<b>${n}</b></span>`;
      })
      .join("");
    const won = TROPHIES.filter((tr) => p.hasTrophy(tr.id)).length;
    const seen = CREATURES.filter((c) => p.hasSeen(c.id)).length;
    this.title.querySelector(".title-shelf")!.innerHTML =
      `${shelf}<span class="shelf-label">${t("title.shelf", {
        won,
        total: TROPHIES.length,
      })}</span>`;
    this.title.querySelector('[data-act="almanac"] small')!.textContent = t(
      "title.almanacMeta",
      { seen, total: CREATURES.length },
    );

    const rec: string[] = [];
    if (p.bestScore > 0)
      rec.push(t("title.best", { score: p.bestScore.toLocaleString() }));
    if (p.bestKm > 0)
      rec.push(t("title.furthest", { km: p.bestKm.toFixed(1) }));
    if (p.crossings > 0)
      rec.push(
        t(p.crossings === 1 ? "title.crossings.one" : "title.crossings", {
          n: p.crossings,
        }),
      );
    this.title.querySelector(".title-records")!.textContent = rec.join("  ·  ");
  }

  private findChip(f: AlmanacFind): string {
    const art =
      f.kind === "trophy"
        ? trophyArt(TROPHIES.find((tr) => tr.id === f.id)?.tier ?? "bronze")
        : creatureArt(f.id);
    const name = t(
      f.kind === "trophy" ? `trophy.${f.id}.name` : `almanac.${f.id}.name`,
    );
    return `<span class="chip ${f.kind}"><span class="art">${art}</span><span>${name}</span></span>`;
  }

  private setScreen(s: Screen): void {
    this.screen = s;
    document.body.dataset.screen = s;
    if (s !== "play") this.clearToasts();
  }

  /** the layer arrow keys should move within, top-most first */
  private activeLayer(): HTMLElement | null {
    if (this.almanac.isOpen) return this.almanac.root;
    if (this.options.isOpen) return $("options");
    if (this.credits.isOpen) return this.credits.root;
    const pause = $("menu");
    if (!pause.hidden) return pause;
    if (this.screen === "end" && !this.end.inert) return this.end;
    if (this.screen === "title" && isShown(this.title)) return this.title;
    return null;
  }

  private onKey = (e: KeyboardEvent): void => {
    const dir = keyDir(e.code);
    if (!dir) return;
    const layer = this.activeLayer();
    if (!layer) return;
    // a focused slider owns its own left/right
    const a = document.activeElement;
    if (
      a instanceof HTMLInputElement &&
      a.type === "range" &&
      (dir === "left" || dir === "right")
    )
      return;
    if (moveFocus(layer, dir)) e.preventDefault();
  };

  private focusFirst(root: HTMLElement): void {
    root
      .querySelector<HTMLButtonElement>("button:not([disabled]):not([hidden])")
      ?.focus();
  }

  private refocus(root: HTMLElement, act: string): void {
    root.querySelector<HTMLButtonElement>(`[data-act="${act}"]`)?.focus();
  }

  private localize(): void {
    for (const btn of this.title.querySelectorAll<HTMLButtonElement>(
      ".title-menu button[data-act]",
    )) {
      const label = btn.querySelector(".lbl");
      if (label) label.textContent = t(`title.${btn.dataset.act}`);
    }
    this.title.querySelector('[data-act="multiplayer"] small')!.textContent =
      t("title.soon");
    this.title.querySelector(".title-tag")!.textContent = t("title.tagline");
    this.end.querySelector('[data-act="title"] .lbl')!.textContent =
      t("end.title");
    this.end.querySelector('[data-act="again"] .lbl')!.textContent =
      t("end.again");
    // touch has no keyboard — and a dedicated pause button, so no Esc row
    this.keyhint.innerHTML = (
      isTouchDevice
        ? [
            ["Stick", "keyhint.swim"],
            ["Surge", "keyhint.surge"],
            ["Sing", "keyhint.sing"],
          ]
        : [
            ["W A S D", "keyhint.swim"],
            ["Shift", "keyhint.surge"],
            ["Space", "keyhint.sing"],
            ["Esc", "keyhint.pause"],
          ]
    )
      .map(([k, key]) => `<span><kbd>${k}</kbd>${t(key)}</span>`)
      .join("");
  }
}

const wait = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
const nextFrame = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => r()));

/** "3 minutes ago" in the player's locale */
function ago(at: number): string {
  const s = Math.round((at - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (s > -60) return rtf.format(0, "second");
  if (s > -3600) return rtf.format(Math.round(s / 60), "minute");
  if (s > -86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}
