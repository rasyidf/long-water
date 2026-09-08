/** The instrument panel: breath / reserves meters, zone name, leg distance, pod
 * dots and drafting readout. Pure DOM, driven each frame from the context. */
import { UNIT_M, WORLD_W } from "../config/constants";
import { zoneAt } from "../config/zones";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

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

  render(ctx: GameContext): void {
    const { whale, pod } = ctx;
    this.el.breathFill.style.transform = `scaleX(${whale.breath / 100})`;
    this.el.energyFill.style.transform = `scaleX(${whale.energy / 100})`;
    this.el.breathNum.textContent = String(Math.round(whale.breath));
    this.el.energyNum.textContent = String(Math.round(whale.energy));
    this.el.breathFill.classList.toggle("low", whale.breath < 30);

    const z = zoneAt(whale.x);
    if (this.el.zoneName.textContent !== z.name)
      this.el.zoneName.textContent = z.name;
    this.el.leg.textContent =
      `${((whale.x * UNIT_M) / 1000).toFixed(1)} of ` +
      `${((WORLD_W * UNIT_M) / 1000).toFixed(1)} km`;

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
        ? `drafting, ${Math.round((1 - 1 / (1 + 0.2 * n)) * 100)}% less effort`
        : "swimming alone";
    }
  }
}
