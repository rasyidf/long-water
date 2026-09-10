/** The additive bloom pass: sonar-lit seabed, lit krill/fish, and song rings. */
import { COL, C, NCOL } from "../config/constants";
import { SPECIES } from "../config/species";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class GlowRenderer implements System {
  readonly name = "render:glow";

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, world } = ctx;
    const sc = cam.scale;
    const [left, right] = cam.visibleX(300);
    const c0 = Math.max(0, Math.floor(left / COL));
    const c1 = Math.min(NCOL - 1, Math.ceil(right / COL));

    const gg = L.glowGraphics;
    gg.clear();

    for (let c = c0; c <= c1; c++) {
      if (world.floorLit[c] < 0.05) continue;
      gg.rect(
        cam.sx(c * COL) - 1,
        cam.sy(world.floorY[c]) - 2,
        COL * sc + 2,
        3,
      );
      gg.fill({ color: C.song, alpha: Math.min(0.95, world.floorLit[c]) });
    }

    for (const s of ctx.krill.swarms) {
      if (s.amount <= 0 || s.lit < 0.06 || Math.abs(s.x - cam.x) > 5600)
        continue;
      for (const p of s.parts) gg.rect(cam.sx(p.px), cam.sy(p.py), 2.6, 2.6);
      gg.fill({ color: C.krill, alpha: s.lit });
    }

    for (const s of ctx.schools.schools) {
      if (s.lit < 0.06 || Math.abs(s.x - cam.x) > 5000) continue;
      const sp = SPECIES[s.species] ?? SPECIES[0];
      for (const f of s.fish) gg.rect(cam.sx(f.x), cam.sy(f.y), 2.2, 2.2);
      gg.fill({
        color: sp.glowColor ?? sp.baseColor ?? C.silver,
        alpha: s.lit * 0.75,
      });
    }

    // squid: photophores down the mantle + eye-shine, pulsing with arousal
    for (const sq of ctx.squid.squids) {
      const glow = sq.arousal * 0.6 + (sq.state === "strike" ? 0.4 : 0);
      if (glow < 0.05 || Math.abs(sq.x - cam.x) > 5200) continue;
      const ca = Math.cos(sq.heading);
      const sa = Math.sin(sq.heading);
      const k = sc * sq.size;
      const pulse = 0.6 + 0.4 * Math.sin(sq.jet * 1.4);
      for (let n = 0; n < 5; n++) {
        const al = 10 + n * 16; // down the ~96u mantle
        const pe = (n % 2 ? 1 : -1) * 7;
        gg.circle(
          cam.sx(sq.x) + (al * ca - pe * sa) * k,
          cam.sy(sq.y) + (al * sa + pe * ca) * k,
          (1.6 + n * 0.25) * k,
        );
      }
      gg.fill({ color: 0x7fd7e6, alpha: Math.min(0.8, glow * pulse) });
    }

    for (const p of ctx.song.pings) {
      const fade = 1 - p.r / p.maxR;
      gg.circle(cam.sx(p.x), cam.sy(p.y), p.r * sc);
      gg.stroke({
        width: Math.max(1, (3 + p.chorus * 1.6) * fade),
        color: p.friendly ? C.song : C.krill,
        alpha: (p.friendly ? 0.5 : 0.4) * fade,
      });
    }
  }
}
