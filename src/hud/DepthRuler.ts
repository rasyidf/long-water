/** The right-edge depth gauge. Its own 2D canvas, redrawn each frame. */
import { UNIT_M } from "../config/constants";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class DepthRuler implements System {
  readonly name = "hud:ruler";
  private cv = document.getElementById("ruler") as HTMLCanvasElement;
  private c = (
    document.getElementById("ruler") as HTMLCanvasElement
  ).getContext("2d")!;

  render(ctx: GameContext): void {
    const { whale, world, camera } = ctx;
    const VH = camera.vh;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.cv.width !== 78 * dpr || this.cv.height !== VH * dpr) {
      this.cv.width = 78 * dpr;
      this.cv.height = VH * dpr;
      this.c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const c = this.c;
    c.clearRect(0, 0, 78, VH);

    const maxD = 500;
    const top = 46;
    const span = VH - 100;
    const dm = Math.max(0, whale.y * UNIT_M);
    const py = top + Math.min(1, dm / maxD) * span;

    c.font = "10px 'Helvetica Neue',Helvetica,Arial,sans-serif";
    c.textAlign = "right";
    for (let d = 0; d <= maxD; d += 25) {
      const y = top + (d / maxD) * span;
      const major = d % 100 === 0;
      c.strokeStyle = major ? "rgba(222,214,198,.4)" : "rgba(222,214,198,.15)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(78 - (major ? 22 : 11), y + 0.5);
      c.lineTo(72, y + 0.5);
      c.stroke();
      if (major && Math.abs(y - py) > 16) {
        c.fillStyle = "rgba(222,214,198,.42)";
        c.fillText(String(d), 52, y + 3.5);
      }
    }

    const ly = top + (180 / maxD) * span;
    c.strokeStyle = "rgba(120,214,200,.36)";
    c.setLineDash([3, 4]);
    c.beginPath();
    c.moveTo(8, ly + 0.5);
    c.lineTo(70, ly + 0.5);
    c.stroke();
    c.setLineDash([]);
    c.textAlign = "left";
    c.fillStyle = "rgba(120,214,200,.5)";
    c.fillText("light ends", 8, ly - 5);

    const fy =
      top + Math.min(1, (world.floorAt(whale.x) * UNIT_M) / maxD) * span;
    c.fillStyle = "rgba(39,74,92,.85)";
    c.fillRect(66, fy, 6, Math.max(2, span + top - fy));

    c.fillStyle = "#62c7bb";
    c.beginPath();
    c.moveTo(76, py);
    c.lineTo(62, py - 5);
    c.lineTo(62, py + 5);
    c.closePath();
    c.fill();
    c.textAlign = "right";
    c.font = "11px 'Helvetica Neue',Helvetica,Arial,sans-serif";
    c.fillStyle = "#ded6c6";
    c.fillText(dm.toFixed(0) + " m", 58, py + 4);
  }
}
