/**
 * Coral reefs: static growths rooted in the shallow shelf and seamount rock.
 * Ambient-lit like the seabed, and brightened when a sonar sweep lights the
 * seabed rim under them (read from `world.floorLit`, never written).
 *
 * Every growth is a filled silhouette (never a bare wireframe) with a rim or
 * vein highlight and a soft contact shadow at its root, so it reads as part of
 * the reef instead of a decal floating on top of it. Five kinds; a per-item
 * hue jitter keeps a patch from reading as one flat colour.
 */
import { COL, C, NCOL } from "../config/constants";
import { clamp, hash01 } from "../core/math";
import { lightAt } from "../core/light";
import { mixColor } from "./color";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import type { Graphics } from "pixi.js";

type P = readonly [number, number];
/** local -> screen: `fx` sideways in px, `fy` up from the seabed root in px */
type Fn = (fx: number, fy: number) => P;

/** blend target that sinks coral colours back toward the water */
const WATER = 0x14384a;

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
      const h = 88 * cr.scale * sc;
      const a = Math.min(1, v);
      const tone = hash01(Math.round(cr.x));
      const sway =
        Math.sin(clock.t * 0.7 + cr.ph) * 0.055 +
        Math.sin(clock.t * 1.9 + cr.ph * 2.3) * 0.02;
      const p: Fn = (fx, fy) => [px + fx + sway * fy, py - fy];

      // sunk well toward the water so it sits in the reef, warmed a touch by
      // the per-item hue jitter; tips/rims stay bright
      const body = mixColor(C.coral, WATER, 0.44 + tone * 0.16);
      const tip = mixColor(C.coralGlow, 0xfff1e2, 0.15);

      // contact shadow / holdfast
      g.ellipse(px, py + 2 * sc, h * 0.4, h * 0.1);
      g.fill({ color: 0x02050a, alpha: a * 0.32 });

      const k = cr.kind % 5;
      if (k === 0) this.fan(g, p, h, a, body, tip);
      else if (k === 1) this.staghorn(g, p, h, a, body, tip, tone);
      else if (k === 2) this.brain(g, p, h, a, body, tip);
      else if (k === 3) this.tubes(g, p, h, a, body, tip, tone);
      else this.whip(g, p, h, a, body, tip, clock.t, cr.ph);
    }
  }

  /** sea fan — a filled membrane on a short stalk, veins picked out on top */
  private fan(
    g: Graphics,
    p: Fn,
    h: number,
    a: number,
    body: number,
    tip: number,
  ): void {
    const w = h * 0.7;
    g.moveTo(...p(-w * 0.07, 0));
    g.lineTo(...p(-w * 0.1, h * 0.22));
    g.lineTo(...p(w * 0.1, h * 0.22));
    g.lineTo(...p(w * 0.07, 0));
    g.closePath();
    g.fill({ color: body, alpha: a });

    g.moveTo(...p(-w * 0.1, h * 0.2));
    g.quadraticCurveTo(...p(-w * 1.05, h * 0.5), ...p(-w * 0.66, h));
    g.quadraticCurveTo(...p(-w * 0.28, h * 1.16), ...p(0, h * 1.05));
    g.quadraticCurveTo(...p(w * 0.28, h * 1.16), ...p(w * 0.66, h));
    g.quadraticCurveTo(...p(w * 1.05, h * 0.5), ...p(w * 0.1, h * 0.2));
    g.closePath();
    g.fill({ color: body, alpha: a * 0.8 });

    for (let i = 0; i < 9; i++) {
      const s = (i / 8 - 0.5) * 2;
      g.moveTo(...p(0, h * 0.2));
      g.quadraticCurveTo(
        ...p(s * w * 0.22, h * 0.62),
        ...p(s * w * 0.7, h * 1.02),
      );
    }
    g.stroke({ width: Math.max(1, h * 0.018), color: tip, alpha: a * 0.4 });
  }

  /** staghorn — a recursively branching thicket of tapered filled arms */
  private staghorn(
    g: Graphics,
    p: Fn,
    h: number,
    a: number,
    body: number,
    tip: number,
    tone: number,
  ): void {
    const grow = (
      x: number,
      y: number,
      ang: number,
      len: number,
      wid: number,
      depth: number,
    ): void => {
      const dx = Math.sin(ang);
      const dy = Math.cos(ang);
      const bx = x + dx * len;
      const by = y + dy * len;
      const nx = dy; // unit normal
      const ny = -dx;
      const w1 = wid * 0.6;
      g.moveTo(...p(x + nx * wid, y + ny * wid));
      g.lineTo(...p(x - nx * wid, y - ny * wid));
      g.lineTo(...p(bx - nx * w1, by - ny * w1));
      g.lineTo(...p(bx + nx * w1, by + ny * w1));
      g.closePath();
      g.fill({ color: body, alpha: a });
      g.circle(...p(bx, by), w1 * 1.3);
      g.fill({ color: tip, alpha: a * 0.6 });
      if (depth <= 0) return;
      const spread = 0.42 + tone * 0.22;
      grow(bx, by, ang - spread, len * 0.72, w1, depth - 1);
      grow(bx, by, ang + spread * 0.8, len * 0.68, w1, depth - 1);
      if (depth === 3)
        grow(bx, by, ang + 0.05, len * 0.58, w1 * 0.9, depth - 1);
    };
    grow(-h * 0.18, 0, -0.25, h * 0.4, h * 0.09, 3);
    grow(h * 0.16, 0, 0.28, h * 0.38, h * 0.085, 3);
  }

  /** brain / boulder coral — a filled dome with contour grooves and a rim light */
  private brain(
    g: Graphics,
    p: Fn,
    h: number,
    a: number,
    body: number,
    tip: number,
  ): void {
    const w = h * 0.62;
    g.moveTo(...p(-w, 0));
    g.quadraticCurveTo(...p(-w * 0.9, h * 0.9), ...p(0, h * 0.9));
    g.quadraticCurveTo(...p(w * 0.9, h * 0.9), ...p(w, 0));
    g.closePath();
    g.fill({ color: body, alpha: a * 0.95 });

    // grooves — a couple of arcs nested inside the dome, following its curve
    for (let i = 1; i <= 2; i++) {
      const f = 1 - i / 3; // 0.66, 0.33
      g.moveTo(...p(-w * f, h * 0.1));
      g.quadraticCurveTo(...p(0, h * (0.3 + 0.62 * f)), ...p(w * f, h * 0.1));
    }
    g.stroke({
      width: Math.max(1, h * 0.018),
      color: 0x02050a,
      alpha: a * 0.2,
    });

    // faint sunlit shoulder, upper-left only
    g.moveTo(...p(-w * 0.88, h * 0.14));
    g.quadraticCurveTo(...p(-w * 0.6, h * 0.86), ...p(-w * 0.05, h * 0.9));
    g.stroke({ width: Math.max(1, h * 0.03), color: tip, alpha: a * 0.2 });
  }

  /** tube sponges — a clump of vertical tapered tubes with dark openings */
  private tubes(
    g: Graphics,
    p: Fn,
    h: number,
    a: number,
    body: number,
    tip: number,
    tone: number,
  ): void {
    const n = 3 + Math.round(tone);
    for (let i = 0; i < n; i++) {
      const s = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2;
      const bx = s * h * 0.42;
      // per-tube height jitter so the clump isn't a symmetric fan
      const th = h * (0.6 + 0.4 * hash01(i * 7 + Math.round(bx)));
      const tx = bx + s * h * 0.18;
      const r0 = h * 0.09;
      const r1 = h * 0.07;
      g.moveTo(...p(bx - r0, 0));
      g.quadraticCurveTo(...p(bx - r0 * 1.1, th * 0.55), ...p(tx - r1, th));
      g.quadraticCurveTo(...p(tx, th + r1 * 1.8), ...p(tx + r1, th));
      g.quadraticCurveTo(...p(bx + r0 * 1.1, th * 0.55), ...p(bx + r0, 0));
      g.closePath();
      g.fill({ color: body, alpha: a });
      // dark mouth + a bright lip so each tube reads separately
      g.ellipse(...p(tx, th), r1 * 0.78, r1 * 0.36);
      g.fill({ color: mixColor(body, 0x02050a, 0.6), alpha: a });
      g.ellipse(...p(tx, th - r1 * 0.5), r1 * 0.9, r1 * 0.4);
      g.stroke({ width: Math.max(1, h * 0.014), color: tip, alpha: a * 0.5 });
    }
  }

  /** sea whip — tall thin swaying strands studded with polyps */
  private whip(
    g: Graphics,
    p: Fn,
    h: number,
    a: number,
    body: number,
    tip: number,
    t: number,
    ph: number,
  ): void {
    for (let i = 0; i < 3; i++) {
      const s = (i - 1) * 0.5;
      const bx = s * h * 0.14;
      const H = h * (1.1 + 0.16 * i);
      const bend = (f: number): number =>
        bx + Math.sin(f * 2.6 + t * 1.5 + ph + i * 1.7) * h * 0.14 * f;
      const rib = (f: number): number => h * 0.022 * (1 - f * 0.7);
      const STEP = 7;
      g.moveTo(...p(bend(0) - rib(0), 0));
      for (let k = 1; k <= STEP; k++) {
        const f = k / STEP;
        g.lineTo(...p(bend(f) - rib(f), f * H));
      }
      for (let k = STEP; k >= 0; k--) {
        const f = k / STEP;
        g.lineTo(...p(bend(f) + rib(f), f * H));
      }
      g.closePath();
      g.fill({ color: body, alpha: a * 0.92 });
      for (let k = 1; k < STEP; k++) {
        const f = k / STEP;
        g.circle(...p(bend(f), f * H), h * 0.028);
        g.fill({ color: tip, alpha: a * 0.45 });
      }
    }
  }
}
