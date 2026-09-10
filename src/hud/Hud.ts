/** The instrument panel: breath / reserves meters, zone name, leg distance, pod
 * dots and drafting readout. Pure DOM, driven each frame from the context. */
import { LEG, kmCovered, legLengthKm } from "../config/route";
import { zoneAt } from "../config/zones";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { t } from "../i18n";

const $ = (id: string) => document.getElementById(id)!;

export class Hud implements System {
  readonly name = "hud";
  private el = {
    zoneName: $("zoneName"),
    leg: $("leg"),
    breathFill: $("breathFill"),
    energyFill: $("energyFill"),
    breathNum: $("breathNum"),
    energyNum: $("energyNum"),
    podDots: $("podDots"),
    draft: $("draft"),
  };
  private lastPod = -1;
  private lastZone = "";

  init(): void {
    document.getElementById("goal")!.textContent = t(`leg.${LEG.id}.goal`);
  }

  render(ctx: GameContext): void {
    const { whale, pod } = ctx;
    this.el.breathFill.style.width = `${Math.max(0, Math.min(100, whale.breath))}%`;
    this.el.energyFill.style.width = `${Math.max(0, Math.min(100, whale.energy))}%`;
    this.el.breathNum.textContent = `${Math.round(whale.breath)}%`;
    this.el.energyNum.textContent = `${Math.round(whale.energy)}%`;
    this.el.breathFill.classList.toggle("low", whale.breath < 30);

    const z = zoneAt(whale.x);
    if (this.lastZone !== z.id) {
      this.lastZone = z.id;
      this.el.zoneName.textContent = t(`zone.${z.id}`);
    }
    this.el.leg.textContent = t("hud.leg", {
      done: kmCovered(whale.x).toFixed(1),
      total: legLengthKm().toFixed(1),
    });

    const n = pod.followers().length;
    if (n !== this.lastPod) {
      this.lastPod = n;
      this.el.podDots.innerHTML = "";
      for (let i = 0; i < n; i++) {
        const d = document.createElement("span");
        d.className = "dot";
        this.el.podDots.appendChild(d);
      }
      this.el.draft.textContent = n
        ? t("hud.draft.drafting", {
            pct: Math.round((1 - 1 / (1 + 0.2 * n)) * 100),
          })
        : t("hud.draft.alone");
    }
  }
}
