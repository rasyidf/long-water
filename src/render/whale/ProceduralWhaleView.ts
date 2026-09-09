import type { Graphics } from "pixi.js";
import type { Camera } from "../../core/Camera";
import { clamp01, smoothstep, type Vec2 } from "../../core/math";
import { mixColor } from "../color";
import type { WhaleDrawOptions, WhaleView } from "./WhaleView";

const BODY_END = 0.94;

/** Authentic Blue Whale body proportions. `juv` 0..1 morphs toward a calf:
 * the head takes up more of the body and is blunter, the forebody stays full,
 * and the tail tapers less. */
function profile(t: number, w: number, juv = 0): number {
  // Blunt head — shorter and rounder on a calf
  const head = Math.pow(clamp01(t / (0.16 + juv * 0.08)), 0.45 - juv * 0.16);
  // Holds the main girth longer through the body so they don't look thin
  const midGirth = 1.0 - (0.35 - juv * 0.16) * smoothstep(0.35, BODY_END, t);
  // Stronger tail section
  const peduncle = Math.pow(1 - clamp01(t / BODY_END), 0.6 - juv * 0.14);

  return w * head * midGirth * Math.max(0.12 + juv * 0.05, peduncle);
}

const topHalf = (t: number, w: number, juv = 0): number =>
  profile(t, w, juv) * 0.42;
const botHalf = (t: number, w: number, juv = 0): number =>
  profile(t, w, juv) * (0.58 + 0.15 * smoothstep(0.5, 0.1, t));

function blob(g: Graphics, pts: Vec2[]): void {
  const n = pts.length;
  if (n < 3) return;
  const a = pts[0];
  const z = pts[n - 1];
  g.moveTo((z.x + a.x) / 2, (z.y + a.y) / 2);
  for (let i = 0; i < n; i++) {
    const c = pts[i];
    const d = pts[(i + 1) % n];
    g.quadraticCurveTo(c.x, c.y, (c.x + d.x) / 2, (c.y + d.y) / 2);
  }
  g.closePath();
}

export class ProceduralWhaleView implements WhaleView {
  draw(g: Graphics, sp: Vec2[], opts: WhaleDrawOptions, cam: Camera): void {
    const { scale, facing, skin, belly, alpha } = opts;
    const width = opts.width ?? 48;
    const juv = clamp01(opts.juv ?? 0);
    const TH = (t: number, w: number): number => topHalf(t, w, juv);
    const BH = (t: number, w: number): number => botHalf(t, w, juv);

    const last = sp.length - 1;
    if (last < 1) return;

    const px = scale * cam.scale;
    // 0..1 detail factor: ramps in smoothly so fins and face don't pop on/off
    // as the camera scale drifts across a hard threshold. Full detail well
    // before normal play zoom; only a genuinely tiny far whale drops it.
    const detail = smoothstep(0.08, 0.26, px);
    const faceDetail = smoothstep(0.3, 0.6, px);

    const frame = (t: number): { p: Vec2; f: Vec2; per: Vec2 } => {
      const u = clamp01(t) * last;
      const i = Math.min(last - 1, Math.floor(u));
      const k = u - i;
      const p = {
        x: sp[i].x + (sp[i + 1].x - sp[i].x) * k,
        y: sp[i].y + (sp[i + 1].y - sp[i].y) * k,
      };
      const a = Math.atan2(sp[i].y - sp[i + 1].y, sp[i].x - sp[i + 1].x);
      const f = { x: Math.cos(a), y: Math.sin(a) };
      return { p, f, per: { x: -f.y * facing, y: f.x * facing } };
    };

    const W = (t: number, fwd: number, prp: number): Vec2 => {
      const fr = frame(t);
      return {
        x: fr.p.x + (fr.f.x * fwd + fr.per.x * prp) * scale,
        y: fr.p.y + (fr.f.y * fwd + fr.per.y * prp) * scale,
      };
    };

    const S = (t: number, fwd: number, prp: number): Vec2 => {
      const wPos = W(t, fwd, prp);
      return { x: cam.sx(wPos.x), y: cam.sy(wPos.y) };
    };

    const xy = (v: Vec2): [number, number] => [cam.sx(v.x), cam.sy(v.y)];

    const darkSkin = mixColor(skin, 0x000000, 0.28);
    const finSkin = mixColor(skin, 0x000000, 0.18);

    // ---------- 1. Continuous Main Body Hull ----------
    const STEPS = 36;
    const outline: Vec2[] = [];

    // Smooth rounded nose
    outline.push(S(0.01, 0, -TH(0.01, width)));
    outline.push(S(0, 1, 0));
    outline.push(S(0.01, 0, BH(0.01, width)));

    for (let s = 1; s <= STEPS; s++) {
      const t = (s / STEPS) * BODY_END;
      outline.push(S(t, 0, -TH(t, width)));
    }

    for (let s = STEPS; s >= 1; s--) {
      const t = (s / STEPS) * BODY_END;
      outline.push(S(t, 0, BH(t, width)));
    }

    blob(g, outline);
    g.fill({ color: skin, alpha });

    // ---------- 2. Fluke ----------
    {
      const rootT = BODY_END;
      const span = 20 * scale;
      const sweep = 12 * scale;

      const root = S(rootT, 0, 0);
      const topTip = S(rootT, -sweep, -span);
      const botTip = S(rootT, -sweep, span);
      const notch = S(rootT, -sweep * 0.35, 0);

      g.moveTo(root.x, root.y);
      g.quadraticCurveTo(...xy(W(rootT, 2, -span * 0.45)), topTip.x, topTip.y);
      g.quadraticCurveTo(
        ...xy(W(rootT, -sweep * 0.7, -span * 0.25)),
        notch.x,
        notch.y,
      );
      g.quadraticCurveTo(
        ...xy(W(rootT, -sweep * 0.7, span * 0.25)),
        botTip.x,
        botTip.y,
      );
      g.quadraticCurveTo(...xy(W(rootT, 2, span * 0.45)), root.x, root.y);
      g.closePath();
      g.fill({ color: finSkin, alpha });
    }

    // ---------- 3. Pale Belly Countershading ----------
    {
      const pale: Vec2[] = [];
      const lo = 0.02;
      const hi = BODY_END - 0.1;
      for (let s = 0; s <= STEPS; s++) {
        const t = lo + (s / STEPS) * (hi - lo);
        pale.push(S(t, 0, BH(t, width) * 0.98));
      }
      for (let s = STEPS; s >= 0; s--) {
        const t = lo + (s / STEPS) * (hi - lo);
        // Pulled the white belly back up! It now covers about 50% to 70% of the lower half
        const up = BH(t, width) * (0.45 - 0.2 * smoothstep(0.1, 0.4, t));
        pale.push(S(t, 0, up));
      }
      blob(g, pale);
      g.fill({ color: belly, alpha: alpha * 0.88 });
    }

    // ---------- 4. Pectoral Flipper ----------
    if (detail > 0.02) {
      const t = 0.25;
      const bh = BH(t, width);
      // Wide chord at the root (fwd +10 .. -16) tapering to a blunt paddle tip,
      // so the flipper reads as a limb rather than a hair.
      const rootFront = S(t, 10, bh * 0.05);
      const rootBack = S(t, -16, bh * 0.42);
      const tipFront = S(t, -20, bh * 1.32);
      const tipBack = S(t, -34, bh * 1.5);

      g.moveTo(rootFront.x, rootFront.y);
      // leading edge
      g.quadraticCurveTo(...xy(W(t, -4, bh * 0.9)), tipFront.x, tipFront.y);
      // blunt rounded tip
      g.quadraticCurveTo(...xy(W(t, -30, bh * 1.62)), tipBack.x, tipBack.y);
      // trailing edge sweeping back to the base
      g.quadraticCurveTo(...xy(W(t, -22, bh * 0.98)), rootBack.x, rootBack.y);
      // root fillet
      g.quadraticCurveTo(...xy(W(t, -1, bh * 0.16)), rootFront.x, rootFront.y);
      g.closePath();
      g.fill({ color: darkSkin, alpha: alpha * detail });
    }

    // ---------- 5. Tiny Dorsal Fin ----------
    {
      const t = 0.75;
      const r0 = S(t - 0.02, 0, -TH(t - 0.02, width));
      const r1 = S(t + 0.02, 0, -TH(t + 0.02, width));
      const peak = S(t + 0.01, -3, -(TH(t, width) + 4));

      g.moveTo(r0.x, r0.y);
      g.quadraticCurveTo(peak.x, peak.y, r1.x, r1.y);
      g.closePath();
      g.fill({ color: finSkin, alpha });
    }

    // ---------- 6. Eye & Throat Jaw Line ----------
    if (faceDetail > 0.02) {
      const snout = S(0.01, 0, BH(0.01, width) * 0.15);
      const jaw = S(0.2, -2, BH(0.2, width) * 0.25);

      g.moveTo(snout.x, snout.y);
      g.quadraticCurveTo(...xy(W(0.1, 0, BH(0.1, width) * 0.25)), jaw.x, jaw.y);
      g.stroke({
        width: Math.max(0.8, 1.2 * px),
        color: mixColor(skin, 0x000000, 0.4),
        alpha: alpha * 0.5 * faceDetail,
      });

      const eye = S(0.15, -1, -TH(0.15, width) * 0.05);
      g.circle(eye.x, eye.y, Math.max(1.2, 1.8 * px));
      g.fill({ color: 0x05090d, alpha: alpha * faceDetail });
    }
  }
}
