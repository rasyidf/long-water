/**
 * Coral reefs: static growths rooted in the shallow shelf and seamount rock.
 * Ambient-lit like the seabed, and brightened when a sonar sweep lights the
 * seabed rim under them (read from `world.floorLit`, never written).
 */
import { COL, C, NCOL } from "../config/constants";
import { clamp } from "../core/math";
import { lightAt } from "../core/light";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import type { Graphics } from "pixi.js";

type P = readonly [number, number];

export class CoralRenderer implements System {
  readonly name = "render:coral";

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, world, clock } = ctx;
    const sc = cam.scale;
    const [left, right] = cam.visibleX(500);

    const g = L.coral;
    g.clear();

    for (const cr of ctx.coral.items) {
      if (cr.x < left || cr.x > right) continue;
      const col = clamp(Math.round(cr.x / COL), 0, NCOL - 1);
      const v = Math.max(lightAt(cr.y) * 0.9, world.floorLit[col] * 0.95);
      if (v < 0.05) continue;

      const px = cam.sx(cr.x);
      const py = cam.sy(cr.y);
      const h = 105 * cr.scale * sc;
      const lean = Math.sin(clock.t * 0.7 + cr.ph) * 0.09;
      const a = Math.min(1, v);

      // local -> screen: fx sideways, fy up from the seabed root
      const p = (fx: number, fy: number): P => [px + fx + lean * fy, py - fy];

      if (cr.kind === 0) this.fan(g, p, h, a);
      else if (cr.kind === 1) this.staghorn(g, p, h, a);
      else this.mound(g, p, h, a);
    }
  }

  private fan(
    g: Graphics,
    p: (x: number, y: number) => P,
    h: number,
    a: number,
  ): void {
    const ribs = 7;
    for (let i = 0; i < ribs; i++) {
      const s = (i / (ribs - 1) - 0.5) * 2; // -1..1
      g.moveTo(...p(0, 0));
      g.quadraticCurveTo(...p(s * h * 0.14, h * 0.45), ...p(s * h * 0.62, h));
    }
    g.stroke({ width: Math.max(1, h * 0.045), color: C.coral, alpha: a });
  }

  private staghorn(
    g: Graphics,
    p: (x: number, y: number) => P,
    h: number,
    a: number,
  ): void {
    const arms = 5;
    for (let i = 0; i < arms; i++) {
      const s = (i / (arms - 1) - 0.5) * 2;
      g.moveTo(...p(0, 0));
      g.lineTo(...p(s * h * 0.12, h * 0.5));
      g.lineTo(...p(s * h * 0.4, h * 0.78));
      g.lineTo(...p(s * h * 0.52, h));
    }
    g.stroke({
      width: Math.max(1, h * 0.08),
      color: C.coralGlow,
      alpha: a,
      cap: "round",
      join: "round",
    });
  }

  private mound(
    g: Graphics,
    p: (x: number, y: number) => P,
    h: number,
    a: number,
  ): void {
    g.moveTo(...p(-h * 0.55, 0));
    g.quadraticCurveTo(...p(-h * 0.32, h * 0.72), ...p(0, h * 0.6));
    g.quadraticCurveTo(...p(h * 0.32, h * 0.72), ...p(h * 0.55, 0));
    g.closePath();
    g.fill({ color: C.coral, alpha: a * 0.45 });
    g.stroke({ width: Math.max(1, h * 0.04), color: C.coralGlow, alpha: a });
  }
}
