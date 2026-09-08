/**
 * A flat-illustration blue whale, rebuilt from the simulated spine each frame.
 *
 * The spine is resampled by arc-parameter `t` (0 = snout, 1 = fluke tips), giving
 * a position and a local {forward, perp} frame at any `t`. Every part — outline,
 * countershading, fins, face — is expressed as offsets in that frame, so the
 * drawing bends with the body and mirrors cleanly with `facing`.
 */
import type { Graphics } from "pixi.js";
import type { Camera } from "../../core/Camera";
import { clamp01, smoothstep, type Vec2 } from "../../core/math";
import { mixColor } from "../color";
import type { WhaleDrawOptions, WhaleView } from "./WhaleView";

/** body half-width (world units, before `scale`) along the body, t in [0, BODY_END] */
const BODY_END = 0.92;
function profile(t: number): number {
  const head = Math.pow(smoothstep(0, 0.16, t), 0.8); // slow rise → tapered snout
  const fullness =
    0.24 + 0.76 * Math.sin(Math.PI * Math.pow(clamp01(t / BODY_END), 0.74));
  const peduncle = 1 - 0.68 * smoothstep(0.42, BODY_END, t); // long taper, keep girth
  return 21 * head * fullness * Math.max(0.15, peduncle);
}
const topHalf = (t: number): number => profile(t) * 0.94;
const botHalf = (t: number): number =>
  profile(t) * (1 + 0.5 * Math.exp(-(((t - 0.13) / 0.11) ** 2))); // throat bulge

/** smooth closed curve through midpoints of `pts`, using pts as control points */
function blob(g: Graphics, pts: Vec2[]): void {
  const n = pts.length;
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
    const last = sp.length - 1;
    const px = scale * cam.scale; // rough on-screen size
    const fine = px > 0.4;
    const veryFine = px > 0.85;

    // --- spine sampler: world position + local frame at arc-param t ---
    const frame = (t: number): { p: Vec2; f: Vec2; per: Vec2 } => {
      const u = clamp01(t) * last;
      const i = Math.min(last - 1, Math.floor(u));
      const k = u - i;
      const p = {
        x: sp[i].x + (sp[i + 1].x - sp[i].x) * k,
        y: sp[i].y + (sp[i + 1].y - sp[i].y) * k,
      };
      const a = Math.atan2(sp[i].y - sp[i + 1].y, sp[i].x - sp[i + 1].x); // toward snout
      const f = { x: Math.cos(a), y: Math.sin(a) };
      return { p, f, per: { x: -f.y * facing, y: f.x * facing } };
    };

    /** world point at t, offset `fwd` forward and `prp` perpendicular (ventral +) */
    const W = (t: number, fwd: number, prp: number): Vec2 => {
      const fr = frame(t);
      return {
        x: fr.p.x + fr.f.x * fwd * scale + fr.per.x * prp * scale,
        y: fr.p.y + fr.f.y * fwd * scale + fr.per.y * prp * scale,
      };
    };
    /** same, in screen space */
    const S = (t: number, fwd: number, prp: number): Vec2 => {
      const w = W(t, fwd, prp);
      return { x: cam.sx(w.x), y: cam.sy(w.y) };
    };
    const xy = (v: Vec2): [number, number] => [cam.sx(v.x), cam.sy(v.y)];

    const darkSkin = mixColor(skin, 0x000000, 0.36);
    const finSkin = mixColor(skin, 0x000000, 0.16);
    const ridge = mixColor(skin, 0xffffff, 0.16);

    // ---------- fluke: graceful crescent at the peduncle (drawn first) ----------
    {
      const rootT = BODY_END - 0.04;
      const span = 46 * scale; // tip spread from the axis
      const chord = 30 * scale; // how far back the trailing edge sweeps
      const root = S(rootT, 4, 0);
      const upTip = S(rootT, -chord * 0.35, -span);
      const dnTip = S(rootT, -chord * 0.35, span);
      const notch = S(rootT, -chord * 0.12, 0);
      g.moveTo(root.x, root.y);
      g.quadraticCurveTo(...xy(W(rootT, 10, -span * 0.62)), upTip.x, upTip.y);
      g.quadraticCurveTo(
        ...xy(W(rootT, -chord * 0.62, -span * 0.42)),
        notch.x,
        notch.y,
      );
      g.quadraticCurveTo(
        ...xy(W(rootT, -chord * 0.62, span * 0.42)),
        dnTip.x,
        dnTip.y,
      );
      g.quadraticCurveTo(...xy(W(rootT, 10, span * 0.62)), root.x, root.y);
      g.closePath();
      g.fill({ color: mixColor(skin, 0x000000, 0.24), alpha });
    }

    // ---------- body silhouette ----------
    const STEPS = 22;
    const outline: Vec2[] = [];
    outline.push(S(0, 19, 0)); // snout tip
    for (let s = 0; s <= STEPS; s++) {
      const t = (s / STEPS) * BODY_END;
      outline.push(S(t, 0, -topHalf(t))); // dorsal, snout → peduncle
    }
    for (let s = STEPS; s >= 0; s--) {
      const t = (s / STEPS) * BODY_END;
      outline.push(S(t, 0, botHalf(t))); // ventral, peduncle → snout
    }
    blob(g, outline);
    g.fill({ color: skin, alpha });

    // ---------- countershading: pale lower body ----------
    {
      const pale: Vec2[] = [];
      const lo = 0.08;
      const spanT = BODY_END - 0.14;
      for (let s = 1; s < STEPS; s++) {
        const t = lo + (s / STEPS) * spanT;
        pale.push(S(t, 0, botHalf(t) * 0.99));
      }
      for (let s = STEPS - 1; s >= 1; s--) {
        const t = lo + (s / STEPS) * spanT;
        // upper edge of the panel: sits a little above the belly, dipping at the head
        const up = -botHalf(t) * (0.02 + 0.2 * smoothstep(0.1, 0.5, t));
        pale.push(S(t, 0, up));
      }
      blob(g, pale);
      g.fill({ color: belly, alpha: alpha * 0.88 });
    }

    // ---------- pectoral flipper: bold sickle, swept back ----------
    if (fine) {
      const t = 0.2;
      const base = S(t, 4, botHalf(t) * 0.3);
      const tip = S(t, -64, 52);
      const heel = S(t, -24, 5);
      g.moveTo(base.x, base.y);
      g.quadraticCurveTo(...xy(W(t, -30, 4)), tip.x, tip.y);
      g.quadraticCurveTo(...xy(W(t, -46, 34)), heel.x, heel.y);
      g.quadraticCurveTo(...xy(W(t, -9, 1)), base.x, base.y);
      g.closePath();
      g.fill({ color: darkSkin, alpha });
    }

    // ---------- throat grooves ----------
    if (veryFine) {
      const gc = mixColor(belly, skin, 0.45);
      for (let k = 0; k < 3; k++) {
        const frac = 0.34 + k * 0.2;
        for (let s = 0; s <= 6; s++) {
          const t = 0.05 + (s / 6) * 0.36;
          const q = S(t, 0, botHalf(t) * frac);
          if (s === 0) g.moveTo(q.x, q.y);
          else g.lineTo(q.x, q.y);
        }
        g.stroke({
          width: Math.max(0.6, 0.8 * px),
          color: gc,
          alpha: alpha * 0.28,
        });
      }
    }

    // ---------- small nubby dorsal fin, ~3/4 back ----------
    {
      const t = 0.71;
      const root0 = S(t - 0.03, 0, -topHalf(t - 0.03));
      const root1 = S(t + 0.06, 0, -topHalf(t + 0.06));
      const peak = S(t, -9, -(topHalf(t) + 20));
      g.moveTo(root0.x, root0.y);
      g.quadraticCurveTo(...xy(W(t, 3, -(topHalf(t) + 11))), peak.x, peak.y);
      g.quadraticCurveTo(
        ...xy(W(t + 0.04, -11, -(topHalf(t) + 4))),
        root1.x,
        root1.y,
      );
      g.closePath();
      g.fill({ color: finSkin, alpha });
    }

    // ---------- dorsal ridge highlight ----------
    if (fine) {
      for (let s = 0; s <= 16; s++) {
        const t = 0.1 + (s / 16) * 0.5;
        const q = S(t, 0, -topHalf(t) * 0.82);
        if (s === 0) g.moveTo(q.x, q.y);
        else g.lineTo(q.x, q.y);
      }
      g.stroke({
        width: Math.max(0.8, 1.3 * px),
        color: ridge,
        alpha: alpha * 0.4,
      });
    }

    // ---------- face: mouth line, blowhole, eye ----------
    if (fine) {
      const snout = S(0, 9, 0);
      const jaw = S(0.2, 0, botHalf(0.2) * 0.82);
      g.moveTo(snout.x, snout.y);
      g.quadraticCurveTo(...xy(W(0.09, 4, botHalf(0.09) * 0.7)), jaw.x, jaw.y);
      g.stroke({
        width: Math.max(0.7, 0.9 * px),
        color: mixColor(skin, 0x000000, 0.45),
        alpha: alpha * 0.5,
      });
    }
    if (veryFine) {
      const bh = S(0.07, 4, -topHalf(0.07) * 0.72);
      g.ellipse(bh.x, bh.y, 2.3 * px, 1.2 * px);
      g.fill({ color: 0x05090d, alpha: alpha * 0.8 });
    }
    if (fine) {
      const eye = S(0.1, -1, -topHalf(0.1) * 0.05);
      g.circle(eye.x, eye.y, Math.max(1, 2.2 * px));
      g.fill({ color: 0x05090d, alpha });
    }
  }
}
