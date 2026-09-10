/** Fish schools — ambient-lit silhouettes. Each school hands the renderer its
 * `SpeciesProfile` (`config/species.ts`); the renderer resolves the draw
 * strategy, sizes it by `cam.scale`, paints every fish, then lays down one
 * batched fill for the school. Krill lives in `KrillRenderer`; the additive
 * sonar-glow pass for both is in `GlowRenderer`. */
import { SPECIES } from "../config/species";
import { hash01, smoothstep } from "../core/math";
import { lightAt } from "../core/light";
import { mixColor } from "./color";
import { FISH_STRATEGIES } from "./fauna/strategies";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class FaunaRenderer implements System {
  readonly name = "render:fauna";

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, clock } = ctx;
    const sc = cam.scale;

    const fg = L.fish;
    fg.clear();
    for (const s of ctx.schools.schools) {
      const v = Math.max(lightAt(s.ay) * 0.55, s.lit * 0.9);
      if (v < 0.05 || Math.abs(s.x - cam.x) > 5000) continue;

      const p = SPECIES[s.species] ?? SPECIES[0];
      const draw = FISH_STRATEGIES[p.draw] ?? FISH_STRATEGIES.dart;
      const detail = smoothstep(p.lodLo, p.lodHi, sc);
      const l = p.length * sc;
      const w = p.width * sc;

      for (const f of s.fish) {
        const a = Math.atan2(f.vy, f.vx);
        draw(
          fg,
          cam.sx(f.x),
          cam.sy(f.y),
          Math.cos(a),
          Math.sin(a),
          l,
          w,
          detail,
          clock.t,
        );
      }

      const col = p.jitter
        ? mixColor(
            p.baseColor,
            p.jitterColor ?? p.baseColor,
            hash01(Math.round(s.x)) * p.jitter,
          )
        : p.baseColor;
      fg.fill({ color: col, alpha: Math.min(1, v) });
    }
  }
}
