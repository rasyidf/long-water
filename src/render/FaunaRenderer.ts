/** Fish schools and krill swarms — ambient-lit dots and darts. Glow pass for
 * their sonar returns lives in `GlowRenderer`. */
import { C } from "../config/constants";
import { lightAt } from "../core/light";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class FaunaRenderer implements System {
  readonly name = "render:fauna";

  render(ctx: GameContext): void {
    const { camera: cam, layers: L } = ctx;
    const sc = cam.scale;

    const fg = L.fish;
    fg.clear();
    const simple = sc < 0.32; // far out: cheap darts
    for (const s of ctx.schools.schools) {
      const v = Math.max(lightAt(s.ay) * 0.55, s.lit * 0.9);
      if (v < 0.05 || Math.abs(s.x - cam.x) > 5000) continue;
      const l = 8 * sc;
      const w = 2.7 * sc;
      for (const f of s.fish) {
        const a = Math.atan2(f.vy, f.vx);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const px = cam.sx(f.x);
        const py = cam.sy(f.y);
        // along = +nose / -tail, perp = flank
        const pt = (al: number, pe: number): [number, number] => [
          px + ca * al - sa * pe,
          py + sa * al + ca * pe,
        ];
        if (simple) {
          fg.moveTo(...pt(l, 0));
          fg.lineTo(...pt(-l, w));
          fg.lineTo(...pt(-l, -w));
          fg.closePath();
          continue;
        }
        fg.moveTo(...pt(l * 1.15, 0)); // nose
        fg.quadraticCurveTo(...pt(l * 0.1, w), ...pt(-l * 0.6, w * 0.55)); // upper flank
        fg.lineTo(...pt(-l * 1.35, w)); // upper tail lobe
        fg.lineTo(...pt(-l * 0.82, 0)); // tail notch
        fg.lineTo(...pt(-l * 1.35, -w)); // lower tail lobe
        fg.lineTo(...pt(-l * 0.6, -w * 0.55));
        fg.quadraticCurveTo(...pt(l * 0.1, -w), ...pt(l * 1.15, 0)); // lower flank
        fg.closePath();
      }
      fg.fill({ color: C.silver, alpha: Math.min(1, v) });
    }

    const kg = L.krill;
    kg.clear();
    for (const s of ctx.krill.swarms) {
      if (s.amount <= 0) continue;
      const v = Math.max(lightAt(s.y) * 0.75, s.lit);
      if (v < 0.05 || Math.abs(s.x - cam.x) > 5600) continue;
      for (const p of s.parts) kg.rect(cam.sx(p.px), cam.sy(p.py), 2.3, 2.3);
      kg.fill({ color: C.krill, alpha: Math.min(1, v) });
    }
  }
}
