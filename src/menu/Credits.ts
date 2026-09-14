/**
 * The credits panel, reached from the title screen: who made this, and
 * where to find them.
 */
import { t } from "../i18n";
import { $, isShown, setShown } from "./dom";

export class Credits {
  private el = $("credits");
  private onClose: (() => void) | null = null;

  constructor() {
    this.el.querySelector("h2")!.textContent = t("credits.title");
    this.el.querySelector(".credits-made")!.textContent = t("credits.made");
    this.el.querySelector(".credits-name")!.textContent = t("credits.name");
    this.el.querySelector(".credits-link")!.textContent = t("credits.site");
    this.el.querySelector('[data-act="back"]')!.textContent = t("menu.back");

    this.el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button")?.dataset.act === "back")
        this.close();
    });
  }

  get isOpen(): boolean {
    return isShown(this.el);
  }

  /** the panel's root, for spatial arrow-key focus */
  get root(): HTMLElement {
    return this.el;
  }

  open(onClose: () => void): void {
    this.onClose = onClose;
    setShown(this.el, true);
  }

  close(): void {
    if (!this.isOpen) return;
    setShown(this.el, false);
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }
}
