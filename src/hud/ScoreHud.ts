/**
 * The score readout (top-right, under the gauges) and the transient trick
 * popup. Pure DOM, driven from `ctx.score` each frame — the counter eases up to
 * the real total, and a fresh `awardSeq` flashes the popup with the label,
 * points and flow multiplier. Mirrors `Hints` for the fade/timeout.
 */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

const $ = (id: string) => document.getElementById(id)!;

export class ScoreHud implements System {
  readonly name = "hud:score";

  private numEl = $("scoreNum");
  private popEl = $("trickpop");

  /** score currently painted (eases toward `score.total`) */
  private shown = 0;
  private seq = -1;
  private popUntil = 0;

  init(ctx: GameContext): void {
    ctx.bus.on("game:restart", () => {
      this.shown = 0;
      this.seq = ctx.score.awardSeq;
      this.numEl.textContent = "0";
      this.popEl.classList.remove("show");
    });
  }

  render(ctx: GameContext): void {
    const { score, clock } = ctx;

    if (this.shown !== score.total) {
      const gap = score.total - this.shown;
      const step = gap > 0 ? Math.max(1, Math.ceil(gap * 0.16)) : gap;
      this.shown += step;
      this.numEl.textContent = this.shown.toLocaleString();
    }

    if (score.awardSeq !== this.seq) {
      this.seq = score.awardSeq;
      const a = score.lastAward;
      if (a) {
        const mul =
          score.comboMul > 1 ? ` <b>&times;${score.comboMul}</b>` : "";
        this.popEl.innerHTML =
          `<span class="lbl">${a.label}</span>` +
          `<span class="pts">+${a.points.toLocaleString()}${mul}</span>`;
        this.popEl.classList.add("show");
        this.popEl.classList.toggle("big", score.comboMul >= 3);
        this.popUntil = clock.t + 1.9;
      }
    }

    if (this.popUntil > 0 && clock.t >= this.popUntil) {
      this.popUntil = 0;
      this.popEl.classList.remove("show");
    }
  }
}
