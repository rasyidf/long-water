/**
 * Procedural deep-water squid — one filled silhouette per animal. Geometry is
 * built in the squid's local frame (`+along` is the mantle tip, arms fan back
 * off the head), rotated by `sq.heading` and projected to screen. The mantle
 * jets (pulsing width), the arms sway when cruising and flare / curl forward as
 * `sq.flare` rises for a grab, and the skin flushes from deep maroon to a pale
 * ghost with `sq.arousal`.
 *
 * The photophore + eye-shine glow is the additive pass in `GlowRenderer`.
 */
import type { Graphics } from "pixi.js";

import type { Camera } from "../../core/Camera";
import { clamp01 } from "../../core/math";
import type { Squid } from "../../state/Squid";
import type { CreatureDrawOptions } from "../CreatureView";
import { mixColor } from "../color";
import type { SquidSection, SquidView } from "./SquidView";

/** mantle length in world units at size 1 (~a third of the player whale) */
const MANTLE = 96;
const MANTLE_W = 24;

export class ProceduralSquidView implements SquidView {
  draw(
    g: Graphics,
    sq: Squid,
    opts: CreatureDrawOptions<SquidSection>,
    cam: Camera,
  ): void {
    const pick = (s: SquidSection): Graphics => opts.layer?.(s) ?? g;

    const ox = cam.sx(sq.x);
    const oy = cam.sy(sq.y);
    const k = cam.scale * sq.size;
    const ca = Math.cos(sq.heading);
    const sa = Math.sin(sq.heading);
    // local (along, across) → screen
    const X = (al: number, pe: number): number => ox + (al * ca - pe * sa) * k;
    const Y = (al: number, pe: number): number => oy + (al * sa + pe * ca) * k;

    const arousal = sq.arousal;
    const skin = mixColor(0x5c2733, 0xdcc4cb, clamp01(0.12 + arousal * 0.7));
    const finCol = mixColor(skin, 0x000000, 0.24);
    const armCol = mixColor(skin, 0x000000, 0.12);

    const jetPulse = Math.sin(sq.jet) * 0.16 + 1; // 0.84..1.16 mantle girth
    const ml = MANTLE;
    const mw = MANTLE_W * jetPulse;

    // ---- arms & tentacles (behind the head, pointing -along) ----------------
    this.drawArms(pick("arms"), sq, X, Y, armCol);

    // ---- caudal fins near the mantle tip ----------------------------------
    {
      const fg = pick("fins");
      const f0 = ml * 0.58;
      const f1 = ml * 0.98;
      const span = mw * 1.9;
      fg.moveTo(X(f0, mw * 0.5), Y(f0, mw * 0.5));
      fg.quadraticCurveTo(
        X(f1 * 0.9, span),
        Y(f1 * 0.9, span),
        X(f1, 0),
        Y(f1, 0),
      );
      fg.quadraticCurveTo(
        X(f1 * 0.9, -span),
        Y(f1 * 0.9, -span),
        X(f0, -mw * 0.5),
        Y(f0, -mw * 0.5),
      );
      fg.closePath();
      fg.fill({ color: finCol, alpha: 0.9 });
    }

    // ---- mantle -----------------------------------------------------------
    {
      const mg = pick("mantle");
      mg.moveTo(X(0, -mw * 0.62), Y(0, -mw * 0.62));
      mg.quadraticCurveTo(
        X(ml * 0.22, -mw),
        Y(ml * 0.22, -mw),
        X(ml * 0.6, -mw * 0.62),
        Y(ml * 0.6, -mw * 0.62),
      );
      mg.quadraticCurveTo(
        X(ml * 0.9, -mw * 0.3),
        Y(ml * 0.9, -mw * 0.3),
        X(ml, 0),
        Y(ml, 0),
      );
      mg.quadraticCurveTo(
        X(ml * 0.9, mw * 0.3),
        Y(ml * 0.9, mw * 0.3),
        X(ml * 0.6, mw * 0.62),
        Y(ml * 0.6, mw * 0.62),
      );
      mg.quadraticCurveTo(
        X(ml * 0.22, mw),
        Y(ml * 0.22, mw),
        X(0, mw * 0.62),
        Y(0, mw * 0.62),
      );
      mg.quadraticCurveTo(
        X(-mw * 0.5, mw * 0.4),
        Y(-mw * 0.5, mw * 0.4),
        X(-mw * 0.7, 0),
        Y(-mw * 0.7, 0),
      );
      mg.quadraticCurveTo(
        X(-mw * 0.5, -mw * 0.4),
        Y(-mw * 0.5, -mw * 0.4),
        X(0, -mw * 0.62),
        Y(0, -mw * 0.62),
      );
      mg.closePath();
      mg.fill({ color: skin, alpha: 0.95 });
    }

    // ---- pale mantle stripe (countershade) -------------------------------
    {
      const stg = pick("stripe");
      stg.moveTo(X(0, mw * 0.1), Y(0, mw * 0.1));
      stg.quadraticCurveTo(
        X(ml * 0.5, mw * 0.66),
        Y(ml * 0.5, mw * 0.66),
        X(ml * 0.92, mw * 0.12),
        Y(ml * 0.92, mw * 0.12),
      );
      stg.quadraticCurveTo(
        X(ml * 0.5, mw * 0.34),
        Y(ml * 0.5, mw * 0.34),
        X(0, mw * 0.1),
        Y(0, mw * 0.1),
      );
      stg.closePath();
      stg.fill({ color: mixColor(skin, 0xffffff, 0.3), alpha: 0.35 });
    }

    // ---- head -----------------------------------------------------------
    {
      const hg = pick("head");
      hg.circle(X(-mw * 0.1, 0), Y(-mw * 0.1, 0), mw * 0.72 * k);
      hg.fill({ color: skin, alpha: 0.95 });
    }

    // ---- eye ----------------------------------------------------------
    {
      const eg = pick("eye");
      const er = mw * 0.34 * k;
      eg.circle(X(-mw * 0.15, -mw * 0.5), Y(-mw * 0.15, -mw * 0.5), er);
      eg.fill({ color: 0x05070b, alpha: 0.95 });
      if (arousal > 0.15) {
        eg.circle(X(-mw * 0.15, -mw * 0.5), Y(-mw * 0.15, -mw * 0.5), er);
        eg.stroke({
          width: Math.max(0.8, 1.4 * k),
          color: mixColor(0xd9603f, 0xffd27a, arousal),
          alpha: 0.5 * arousal,
        });
      }
    }
  }

  private drawArms(
    g: Graphics,
    sq: Squid,
    X: (al: number, pe: number) => number,
    Y: (al: number, pe: number) => number,
    col: number,
  ): void {
    const N = 8;
    const flare = sq.flare;
    // fan half-angle grows as the arms flare open to grasp
    const fan = 0.22 + flare * 1.15;
    const base = -MANTLE_W * 0.15; // arms root just ahead of the head
    const armLen = MANTLE * (0.72 - 0.12 * flare);
    const tentLen = MANTLE * (1.5 - 0.2 * flare);
    const wave = (1 - flare * 0.7) * MANTLE_W * 0.5;

    for (let i = 0; i < N + 2; i++) {
      const tentacle = i >= N;
      const idx = tentacle ? (i === N ? -0.5 : 0.5) : i / (N - 1) - 0.5;
      const dir = Math.PI + idx * 2 * fan; // local angle, PI = straight back
      const len = tentacle ? tentLen : armLen;
      const w0 = (tentacle ? 5 : 8) * (1 + flare * 0.3);

      const dca = Math.cos(dir);
      const dsa = Math.sin(dir);
      const S = 5;
      const edge: [number, number][] = [];
      for (let s = 0; s <= S; s++) {
        const f = s / S;
        const along = base + dca * len * f;
        const across = dsa * len * f;
        // sway when cruising; a curl toward centre-line when grasping
        const sway =
          Math.sin(sq.jet * 1.6 + i * 0.8 + f * 3) * wave * f +
          -idx * flare * MANTLE_W * 1.4 * f * f;
        const nx = -dsa;
        const ny = dca;
        edge.push([along + nx * sway, across + ny * sway]);
      }
      const halfW = (f: number): number => w0 * (1 - 0.85 * f);
      g.moveTo(
        X(edge[0][0], edge[0][1] + halfW(0)),
        Y(edge[0][0], edge[0][1] + halfW(0)),
      );
      for (let s = 1; s <= S; s++) {
        const f = s / S;
        g.lineTo(
          X(edge[s][0], edge[s][1] + halfW(f)),
          Y(edge[s][0], edge[s][1] + halfW(f)),
        );
      }
      for (let s = S; s >= 0; s--) {
        const f = s / S;
        g.lineTo(
          X(edge[s][0], edge[s][1] - halfW(f)),
          Y(edge[s][0], edge[s][1] - halfW(f)),
        );
      }
      g.closePath();
    }
    g.fill({ color: col, alpha: 0.9 });
  }
}
