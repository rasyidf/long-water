/** The instrument panel: breath / reserves meters, zone name, leg distance, pod
 * dots and drafting readout. Pure DOM, driven each frame from the context. */
import { UNIT_M } from "../config/constants";
import { kmCovered, legId, legLengthKm } from "../config/route";
import { waterTempC, zoneAt } from "../config/zones";
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
    compassNeedle: $("compassNeedle"),
    clock: $("clock"),
    temp: $("temp"),
  };
  private lastPod = -1;
  private lastZone = "";
  private lastClock = "";
  private lastTemp = "";

  init(): void {
    document.getElementById("goal")!.textContent = t(`leg.${legId()}.goal`);
  }

  render(ctx: GameContext): void {
    const { whale, pod, clock } = ctx;
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

    // compass needle: swims toward S (left) as the whale makes southward way
    const dir = Math.max(-1, Math.min(1, whale.vx / 900));
    this.el.compassNeedle.style.left = `${50 - dir * 44}%`;

    // in-game clock: the day passes as the crossing wears on (starts 08:00)
    const mins = Math.floor((8 * 60 + clock.sinceStart * 0.7) % 1440);
    const hhmm = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(
      mins % 60,
    ).padStart(2, "0")}`;
    if (hhmm !== this.lastClock)
      this.el.clock.textContent = this.lastClock = hhmm;

    // water temperature at the whale's position — climbs on the way south
    const temp = `${Math.round(waterTempC(whale.x, Math.max(0, whale.y * UNIT_M)))}°`;
    if (temp !== this.lastTemp) this.el.temp.textContent = this.lastTemp = temp;

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
