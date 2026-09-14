/**
 * The fish-body library. Each entry paints ONE fish as a path; `FaunaRenderer`
 * resolves `FISH_STRATEGIES[profile.draw]` and batches a single `fill()` per
 * school, so strategies never fill or stroke — everything is one filled
 * silhouette (tendrils/tails included, as thin filled slivers).
 *
 * Add a body: write a `FishStrategy`, register it here, point a `SpeciesProfile`
 * at its key.
 *
 * ---- deferred optimisation (not built) --------------------------------------
 * Every fish pose is unique per frame, so `GraphicsContext` / `Graphics.clone`
 * / `cacheAsTexture` buy nothing here. The one lever that would:
 *   - far-LOD fish: `renderer.generateTexture()` each species silhouette once at
 *     a reference size, then a `ParticleContainer` of rotated/scaled instances
 *     below some `cam.scale`. A `SpriteFishStrategy` would register under these
 *     same keys and `FaunaRenderer` would pick Graphics vs sprite by a profile
 *     flag — the seam already allows it.
 * Pursue only if a profile shows fauna outside the frame budget.
 */
import type { Graphics } from "pixi.js";
import type { FishStrategy } from "./FishStrategy";

// local -> screen, allocation-free (no per-fish closure)
function mv(
  g: Graphics,
  px: number,
  py: number,
  ca: number,
  sa: number,
  al: number,
  pe: number,
): void {
  g.moveTo(px + ca * al - sa * pe, py + sa * al + ca * pe);
}

function ln(
  g: Graphics,
  px: number,
  py: number,
  ca: number,
  sa: number,
  al: number,
  pe: number,
): void {
  g.lineTo(px + ca * al - sa * pe, py + sa * al + ca * pe);
}

function qc(
  g: Graphics,
  px: number,
  py: number,
  ca: number,
  sa: number,
  cAl: number,
  cPe: number,
  eAl: number,
  ePe: number,
): void {
  g.quadraticCurveTo(
    px + ca * cAl - sa * cPe,
    py + sa * cAl + ca * cPe,
    px + ca * eAl - sa * ePe,
    py + sa * eAl + ca * ePe,
  );
}

/** 3-point dart — baitfish, and the far-LOD fallback for `forkedTail` */
const dart: FishStrategy = (g, px, py, ca, sa, l, w) => {
  mv(g, px, py, ca, sa, l, 0);
  ln(g, px, py, ca, sa, -l, w);
  ln(g, px, py, ca, sa, -l, -w);
  g.closePath();
};

/** the original detailed fish: nose, curved flanks, forked tail */
const forkedTail: FishStrategy = (g, px, py, ca, sa, l, w, detail, t) => {
  if (detail < 0.35) {
    dart(g, px, py, ca, sa, l, w, detail, t);
    return;
  }
  mv(g, px, py, ca, sa, l * 1.15, 0); // nose
  qc(g, px, py, ca, sa, l * 0.1, w, -l * 0.6, w * 0.55); // upper flank
  ln(g, px, py, ca, sa, -l * 1.35, w); // upper tail lobe
  ln(g, px, py, ca, sa, -l * 0.82, 0); // tail notch
  ln(g, px, py, ca, sa, -l * 1.35, -w); // lower tail lobe
  ln(g, px, py, ca, sa, -l * 0.6, -w * 0.55);
  qc(g, px, py, ca, sa, l * 0.1, -w, l * 1.15, 0); // lower flank
  g.closePath();
};

/** ribbon eel — a long body with a travelling sine flex, tapering to the tail */
const eelRibbon: FishStrategy = (g, px, py, ca, sa, l, w, detail, t) => {
  const nose = l * 2;
  const span = nose + l; // nose (+2l) down to tail (-l)
  const steps = 5 + Math.round(detail * 5);
  const bend = (f: number): number =>
    Math.sin(t * 3 + f * 4 + px * 0.02) * w * 2.2 * f;
  const wid = (f: number): number =>
    w * (1 - 0.7 * f) * (f < 0.12 ? f / 0.12 : 1);
  mv(g, px, py, ca, sa, nose, 0);
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    ln(g, px, py, ca, sa, nose - f * span, bend(f) + wid(f));
  }
  for (let i = steps; i >= 1; i--) {
    const f = i / steps;
    ln(g, px, py, ca, sa, nose - f * span, bend(f) - wid(f));
  }
  g.closePath();
};

/** eagle ray — a wide flattened diamond; the wingtips flap fore/aft over time */
const rayGlide: FishStrategy = (g, px, py, ca, sa, l, w, detail, t) => {
  const flap = Math.sin(t * 2 + px * 0.03);
  const tip = w * (0.9 + 0.15 * flap);
  const rise = w * 0.35 * flap;
  mv(g, px, py, ca, sa, l, 0); // nose
  qc(g, px, py, ca, sa, l * 0.2, tip, -l * 0.2 + rise, tip); // right leading edge
  qc(g, px, py, ca, sa, -l * 0.9, tip * 0.5, -l * 1.1, 0); // right trailing edge
  if (detail > 0.4) {
    ln(g, px, py, ca, sa, -l * 2.4, 0); // whip tail
    ln(g, px, py, ca, sa, -l * 1.1, 0);
  }
  qc(g, px, py, ca, sa, -l * 0.9, -tip * 0.5, -l * 0.2 + rise, -tip); // left trailing
  qc(g, px, py, ca, sa, l * 0.2, -tip, l, 0); // left leading edge
  g.closePath();
};

/** moon jelly — a pulsing bell with trailing tendrils. Heading-agnostic: the
 *  bell always sits upright in screen space and the tendrils hang below. */
const jellyBell: FishStrategy = (g, px, py, _ca, _sa, l, w, detail, t) => {
  const pulse = Math.sin(t * 2 + px * 0.05);
  const bw = w * (1 + 0.12 * pulse);
  const bh = l * (1 - 0.14 * pulse);
  // bell — a dome open at the bottom, with a shallow scalloped rim
  g.moveTo(px - bw, py);
  g.quadraticCurveTo(px - bw, py - bh, px, py - bh);
  g.quadraticCurveTo(px + bw, py - bh, px + bw, py);
  g.quadraticCurveTo(px + bw * 0.5, py + bh * 0.18, px, py);
  g.quadraticCurveTo(px - bw * 0.5, py + bh * 0.18, px - bw, py);
  g.closePath();
  // tendrils — thin filled slivers so the single school fill still catches them
  const n = 3 + Math.round(detail * 3);
  const tw = Math.max(0.6, bw * 0.05);
  for (let i = 0; i < n; i++) {
    const sx = n === 1 ? 0 : (i / (n - 1) - 0.5) * 2 * bw * 0.7;
    const wob = Math.sin(t * 2.5 + i * 1.3 + px * 0.05) * bw * 0.3;
    const midX = px + sx + wob;
    const endX = px + sx * 0.4 + wob;
    const top = py + bh * 0.1;
    g.moveTo(px + sx - tw, top);
    g.quadraticCurveTo(midX - tw, py + bh * 0.9, endX - tw, py + bh * 1.7);
    g.lineTo(endX + tw, py + bh * 1.7);
    g.quadraticCurveTo(midX + tw, py + bh * 0.9, px + sx + tw, top);
    g.closePath();
  }
};

/** bulky-finned reef grazer — deep rounded body, blunt tail, a dorsal and
 *  ventral fin bump breaking the outline instead of a forked tail */
const bulkyFinned: FishStrategy = (g, px, py, ca, sa, l, w, detail, t) => {
  if (detail < 0.35) {
    dart(g, px, py, ca, sa, l, w, detail, t);
    return;
  }
  mv(g, px, py, ca, sa, l * 1.1, 0); // rounded nose
  qc(g, px, py, ca, sa, l * 0.7, w * 1.15, l * 0.1, w * 1.3); // deep upper body
  ln(g, px, py, ca, sa, -l * 0.15, w * 1.75); // dorsal fin bump
  ln(g, px, py, ca, sa, -l * 0.55, w * 1.3);
  qc(g, px, py, ca, sa, -l * 0.85, w * 0.9, -l * 1.05, w * 0.35); // taper to tail
  qc(g, px, py, ca, sa, -l * 1.15, w * 0.15, -l * 1.2, 0); // blunt tail
  qc(g, px, py, ca, sa, -l * 1.15, -w * 0.15, -l * 1.05, -w * 0.35);
  qc(g, px, py, ca, sa, -l * 0.85, -w * 0.9, -l * 0.55, -w * 1.3);
  ln(g, px, py, ca, sa, -l * 0.15, -w * 1.75); // anal fin bump
  qc(g, px, py, ca, sa, l * 0.1, -w * 1.3, l * 0.7, -w * 1.15);
  g.closePath();
};

export const FISH_STRATEGIES: Record<string, FishStrategy> = {
  dart,
  forkedTail,
  eelRibbon,
  rayGlide,
  jellyBell,
  bulkyFinned,
};
