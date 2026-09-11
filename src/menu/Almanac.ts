/**
 * The almanac: a two-tab book reached from the title screen. *Creatures* is a
 * field guide — every animal (and ship) the crossing can put in front of you,
 * shown as a silhouette with "???" until you've actually seen it. *Trophies* is
 * the case of feats, earned or still to earn. Reads `Profile`; the entries come
 * from `config/almanac.ts`, the art from `menu/art.ts`, the copy from
 * `almanac.<id>.*` / `trophy.<id>.*`.
 *
 * Moving focus over a card (arrows, Tab, hover or click) opens it in the
 * detail pane, so the book is fully keyboard-drivable.
 */
import { CREATURES, TROPHIES, type TrophyTier } from "../config/almanac";
import { t } from "../i18n";
import type { Profile } from "../state/Profile";
import { creatureArt, trophyArt } from "./art";
import { $, isShown, setShown } from "./dom";

export type AlmanacTab = "creatures" | "trophies";

const FACTS = ["size", "found", "temper"] as const;

export class Almanac {
  private el = $("almanac");
  private grid = $("almGrid");
  private detail = $("almDetail");
  private tab: AlmanacTab = "creatures";
  private selected = "";
  private onClose: (() => void) | null = null;

  constructor(private readonly profile: Profile) {
    this.el.querySelector("h2")!.textContent = t("almanac.title");
    this.el.querySelector('[data-act="back"]')!.textContent = t("menu.back");

    this.el.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest("button");
      if (!btn) return;
      if (btn.dataset.act === "back") this.close();
      else if (btn.dataset.tab) this.show(btn.dataset.tab as AlmanacTab);
      else if (btn.dataset.id) this.select(btn.dataset.id);
    });
    // focus drives the detail pane, so arrowing through the grid reads the book
    this.grid.addEventListener("focusin", (e) => {
      const id = (e.target as HTMLElement).closest("button")?.dataset.id;
      if (id) this.select(id);
    });
    this.grid.addEventListener("pointerover", (e) => {
      const id = (e.target as HTMLElement).closest("button")?.dataset.id;
      if (id) this.select(id);
    });
  }

  get isOpen(): boolean {
    return isShown(this.el);
  }

  open(tab: AlmanacTab, onClose: () => void): void {
    this.onClose = onClose;
    setShown(this.el, true);
    this.show(tab);
  }

  close(): void {
    if (!this.isOpen) return;
    setShown(this.el, false);
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  /** the book's root, for spatial arrow-key focus */
  get root(): HTMLElement {
    return this.el;
  }

  private show(tab: AlmanacTab): void {
    this.tab = tab;
    this.selected = "";
    const p = this.profile;
    const seen = CREATURES.filter((c) => p.hasSeen(c.id)).length;
    const won = TROPHIES.filter((tr) => p.hasTrophy(tr.id)).length;
    for (const b of this.el.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
      const which = b.dataset.tab as AlmanacTab;
      b.setAttribute("aria-selected", String(which === tab));
      b.innerHTML = `${t(`almanac.tab.${which}`)} <span class="n">${
        which === "creatures"
          ? `${seen}/${CREATURES.length}`
          : `${won}/${TROPHIES.length}`
      }</span>`;
    }

    this.grid.className = `alm-grid ${tab}`;
    this.grid.innerHTML =
      tab === "creatures"
        ? CREATURES.map((c) => {
            const known = p.hasSeen(c.id);
            return `<button type="button" class="alm-card${known ? "" : " locked"}" data-id="${c.id}">
              <span class="art">${creatureArt(c.id)}</span>
              <span class="nm">${known ? t(`almanac.${c.id}.name`) : t("almanac.unknown")}</span>
            </button>`;
          }).join("")
        : TROPHIES.map((tr) => {
            const got = p.hasTrophy(tr.id);
            return `<button type="button" class="alm-card trophy ${tr.tier}${got ? "" : " locked"}" data-id="${tr.id}">
              <span class="art">${trophyArt(tr.tier)}</span>
              <span class="nm">${t(`trophy.${tr.id}.name`)}</span>
            </button>`;
          }).join("");

    const first = this.grid.querySelector<HTMLButtonElement>("button");
    if (first) {
      first.focus();
      this.select(first.dataset.id!);
    }
  }

  private select(id: string): void {
    if (id === this.selected) return;
    this.selected = id;
    for (const b of this.grid.querySelectorAll<HTMLButtonElement>("button"))
      b.classList.toggle("sel", b.dataset.id === id);
    this.detail.innerHTML =
      this.tab === "creatures"
        ? this.creatureDetail(id)
        : this.trophyDetail(id);
  }

  private creatureDetail(id: string): string {
    if (!this.profile.hasSeen(id)) {
      return `<div class="alm-portrait locked">${creatureArt(id)}<b>?</b></div>
        <h3>${t("almanac.unknown")}</h3>
        <p class="alm-desc">${t("almanac.locked")}</p>`;
    }
    const facts = FACTS.map(
      (f) =>
        `<dt>${t(`almanac.fact.${f}`)}</dt><dd>${t(`almanac.${id}.${f}`)}</dd>`,
    ).join("");
    return `<div class="alm-portrait">${creatureArt(id)}</div>
      <h3>${t(`almanac.${id}.name`)}</h3>
      <dl class="alm-facts">${facts}</dl>
      <p class="alm-desc">${t(`almanac.${id}.body`)}</p>`;
  }

  private trophyDetail(id: string): string {
    const tier: TrophyTier =
      TROPHIES.find((tr) => tr.id === id)?.tier ?? "bronze";
    const at = this.profile.trophyAt(id);
    const when =
      at === undefined
        ? t("trophy.unearned")
        : t("trophy.earned", {
            date: new Date(at).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            }),
          });
    return `<div class="alm-portrait cup ${tier}${at === undefined ? " locked" : ""}">${trophyArt(tier)}</div>
      <h3>${t(`trophy.${id}.name`)}</h3>
      <p class="alm-tier ${tier}">${t(`trophy.tier.${tier}`)}</p>
      <p class="alm-desc">${t(`trophy.${id}.desc`)}</p>
      <p class="alm-when">${when}</p>`;
  }
}
