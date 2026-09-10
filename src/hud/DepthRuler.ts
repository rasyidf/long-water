/** The right-edge depth gauge: a vertical scale with the whale's depth marker,
 *  the light line, the seabed, and a small sonar dish at the foot that plots the
 *  pod and nearby life relative to the player. Its own 2D canvas, redrawn each
 *  frame. */
import { DARK_FULL, UNIT_M } from "../config/constants";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

const W = 120;
const SPINE = 86; // x of the vertical scale line
const MAX_D = 500; // metres the scale runs to
const BONE = "222,214,198";
const SONG = "159,232,213";

export class DepthRuler implements System {
  readonly name = "hud:ruler";
  private cv = document.getElementById("ruler") as HTMLCanvasElement;
  private c = this.cv.getContext("2d")!;

  render(ctx: GameContext): void {
    const { whale, world, pod, krill, schools, camera, clock } = ctx;
    const VH = camera.vh;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.cv.width !== W * dpr || this.cv.height !== VH * dpr) {
      this.cv.width = W * dpr;
      this.cv.height = VH * dpr;
      this.c.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const c = this.c;
    c.clearRect(0, 0, W, VH);

    const top = 54;
    const sonarR = Math.min(44, (VH - top) * 0.11);
    const span = VH - top - sonarR * 2 - 22;
    const yOf = (d: number) => top + Math.min(1, Math.max(0, d / MAX_D)) * span;
    const dm = Math.max(0, whale.y * UNIT_M);
    const py = yOf(dm);

    // ---- the scale: spine + ticks + labels ----
    c.strokeStyle = `rgba(${BONE},.5)`;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(SPINE + 0.5, top);
    c.lineTo(SPINE + 0.5, yOf(MAX_D));
    c.stroke();

    c.font = "10px 'Helvetica Neue',Helvetica,Arial,sans-serif";
    c.textAlign = "left";
    c.textBaseline = "middle";
    for (let d = 0; d <= MAX_D; d += 25) {
      const y = yOf(d);
      const major = d % 100 === 0;
      c.strokeStyle = `rgba(${BONE},${major ? 0.42 : 0.16})`;
      c.beginPath();
      c.moveTo(SPINE - (major ? 15 : 7), y + 0.5);
      c.lineTo(SPINE, y + 0.5);
      c.stroke();
      if (major && Math.abs(y - py) > 14) {
        c.fillStyle = `rgba(${BONE},.4)`;
        c.fillText(String(d), SPINE + 8, y);
      }
    }

    // ---- the light line ----
    const ly = yOf(DARK_FULL * UNIT_M);
    c.strokeStyle = `rgba(${SONG},.34)`;
    c.setLineDash([3, 4]);
    c.beginPath();
    c.moveTo(10, ly + 0.5);
    c.lineTo(SPINE - 2, ly + 0.5);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = `rgba(${SONG},.5)`;
    c.textAlign = "left";
    c.fillText("light ends", 10, ly - 9);
    c.fillStyle = `rgba(${SONG},.36)`;
    c.fillText(`≈ ${Math.round(DARK_FULL * UNIT_M)} m`, 10, ly + 9);

    // ---- the seabed ----
    const fy = yOf(world.floorAt(whale.x) * UNIT_M);
    c.fillStyle = "rgba(39,74,92,.8)";
    c.fillRect(SPINE - 4, fy, W - SPINE + 4, Math.max(2, yOf(MAX_D) - fy + 1));

    // ---- the whale's depth marker ----
    c.fillStyle = "#62c7bb";
    c.beginPath();
    c.moveTo(SPINE, py);
    c.lineTo(SPINE - 8, py - 4.5);
    c.lineTo(SPINE - 8, py + 4.5);
    c.closePath();
    c.fill();
    c.textAlign = "right";
    c.fillStyle = "#ded6c6";
    c.font = "11px 'Helvetica Neue',Helvetica,Arial,sans-serif";
    c.fillText(`${dm.toFixed(0)} m`, SPINE - 13, py);
    wave(c, SPINE - 13, py + 11, 20, "#62c7bb", 0.7);

    // ---- the sonar dish ----
    const cx = W - sonarR - 14;
    const cy = VH - sonarR - 14;
    const RANGE = 6000; // world units mapped to the dish edge

    c.strokeStyle = `rgba(${SONG},.28)`;
    c.lineWidth = 1;
    for (const f of [1, 0.62, 0.3]) {
      c.beginPath();
      c.arc(cx, cy, sonarR * f, 0, Math.PI * 2);
      c.stroke();
    }
    c.strokeStyle = `rgba(${SONG},.14)`;
    c.beginPath();
    c.moveTo(cx - sonarR, cy);
    c.lineTo(cx + sonarR, cy);
    c.moveTo(cx, cy - sonarR);
    c.lineTo(cx, cy + sonarR);
    c.stroke();

    // sweep
    const sweep = (clock.t * 1.6) % (Math.PI * 2);
    const mk = (
      c as unknown as {
        createConicGradient?: (
          a: number,
          x: number,
          y: number,
        ) => CanvasGradient;
      }
    ).createConicGradient;
    const g = mk ? mk.call(c, sweep, cx, cy) : null;
    if (g) {
      g.addColorStop(0, `rgba(${SONG},.16)`);
      g.addColorStop(0.1, `rgba(${SONG},0)`);
      g.addColorStop(1, `rgba(${SONG},0)`);
      c.fillStyle = g;
      c.beginPath();
      c.arc(cx, cy, sonarR - 1, 0, Math.PI * 2);
      c.fill();
    }

    c.save();
    c.beginPath();
    c.arc(cx, cy, sonarR - 1, 0, Math.PI * 2);
    c.clip();
    const blip = (wx: number, wy: number, r: number, fill: string) => {
      const bx = cx + ((wx - whale.x) / RANGE) * sonarR;
      const by = cy + ((wy - whale.y) / RANGE) * sonarR;
      c.fillStyle = fill;
      c.beginPath();
      c.arc(bx, by, r, 0, Math.PI * 2);
      c.fill();
    };
    for (const s of krill.swarms)
      blip(s.x, s.y, 1.4, `rgba(255,156,91,${0.3 + 0.4 * s.lit})`);
    for (const sc of schools.schools)
      blip(sc.x, sc.y, 1.2, "rgba(169,194,200,.4)");
    for (const w of pod.whales) {
      if (w.state === "lost") continue;
      const col =
        w.state === "following"
          ? `rgba(${SONG},.95)`
          : w.state === "answered"
            ? "rgba(98,199,187,.7)"
            : `rgba(${BONE},.3)`;
      blip(w.body.x, w.body.y, w.state === "following" ? 2.2 : 1.8, col);
    }
    c.restore();

    // the player at the centre, pointing where it swims
    const ang =
      Math.hypot(whale.vx, whale.vy) > 6
        ? Math.atan2(whale.vy, whale.vx)
        : whale.facing >= 0
          ? 0
          : Math.PI;
    c.save();
    c.translate(cx, cy);
    c.rotate(ang);
    c.fillStyle = "#ded6c6";
    c.beginPath();
    c.moveTo(6, 0);
    c.lineTo(-4, -3.5);
    c.lineTo(-4, 3.5);
    c.closePath();
    c.fill();
    c.restore();
  }
}

/** a short two-crest wave glyph, right-aligned to (x, y) */
function wave(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  stroke: string,
  alpha: number,
): void {
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = stroke;
  c.lineWidth = 1.4;
  c.lineCap = "round";
  c.beginPath();
  const q = w / 4;
  c.moveTo(x - w, y);
  c.quadraticCurveTo(x - w + q, y - 3, x - w + 2 * q, y);
  c.quadraticCurveTo(x - w + 3 * q, y + 3, x, y);
  c.stroke();
  c.restore();
}
