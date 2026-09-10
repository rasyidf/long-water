/** The seabed, drawn as depth layers:
 *
 *  - a distant ridge (`terrainFar`) scrolled at a parallax fraction of the
 *    camera, flattened and hazed so it reads as background,
 *  - the near seabed you swim over: a solid dark body, a soft gradient that
 *    lights its upper shoulder so it doesn't read as a flat cut-out, faceted
 *    rubble piled on the steep shelf-break faces, and a bright mint rim where
 *    sunlight (or a sonar sweep) reaches the crest.
 *
 * Each fill is a spline through the smoothed heightfield, closed off *below the
 * deepest point of the visible span* rather than at a fixed screen line — so
 * when part of the floor drops off the bottom of the screen the fill stays a
 * simple polygon and never self-intersects. Columns outside the generated
 * range clamp to the first/last sample, so the floor reads as a flat
 * continuation off either end of the route. */
import { FillGradient, type Graphics } from "pixi.js";
import { COL, C, NCOL } from "../config/constants";
import type { Camera } from "../core/Camera";
import { lightAt } from "../core/light";
import { clamp01, hash01 } from "../core/math";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { mixColor } from "./color";

/** the far ridge scrolls at this fraction of the camera's x motion */
const FAR_PARALLAX = 0.55;
/** hazed toward the water so the ridge recedes (atmospheric perspective) */
const FAR_FILL = mixColor(C.rock, 0x16394d, 0.7);
const FAR_RIM = mixColor(C.rockLit, 0x1c4a60, 0.55);

/** angular rubble on the steep shelf-break faces */
const SCREE = mixColor(C.seabedDeep, 0x1e3d49, 0.82);
const SCREE_LIT = mixColor(SCREE, C.reefRim, 0.28);

/** sunlit shoulder tint; the gradient fades it out with depth below the crest */
const SHOULDER_LIT = mixColor(C.seabed, 0xffffff, 0.05);
/** how far below the crest the shoulder light still reaches, in world units */
const SHOULDER_DEPTH = 312;
const rgba = (rgb: number, a: number): string =>
  `rgba(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255},${a})`;
/** one vertical gradient, normalised to the shoulder polygon's bounds, that
 * replaces what used to be eight stacked translucent bands faking a falloff */
const SHOULDER_FILL = new FillGradient({
  type: "linear",
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
  textureSpace: "local",
  colorStops: [
    { offset: 0, color: rgba(SHOULDER_LIT, 0.4) },
    { offset: 0.4, color: rgba(SHOULDER_LIT, 0.13) },
    { offset: 0.75, color: rgba(SHOULDER_LIT, 0.03) },
    { offset: 1, color: rgba(SHOULDER_LIT, 0) },
  ],
});

type At = (c: number) => number;

export class TerrainRenderer implements System {
  readonly name = "render:terrain";

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, world } = ctx;
    const f = world.floorY;
    const at: At = (c) => f[c < 0 ? 0 : c > NCOL - 1 ? NCOL - 1 : c];

    const half = cam.vw / 2 / cam.scale;
    const sc = cam.scale;

    // ---------- far parallax ridge ----------
    {
      const g = L.terrainFar;
      g.clear();
      const camFarX = cam.x * FAR_PARALLAX;
      const first = Math.floor((camFarX - half - 300) / COL);
      const last = Math.ceil((camFarX + half + 300) / COL);
      const sx = (wx: number): number =>
        (wx - camFarX) * cam.scale + cam.vw / 2;
      // a ridgeline of its own: the heightfield sampled at a higher spatial
      // frequency, flattened and lifted so its crests rise above the near
      // seabed (a distant range seen across the water) rather than hiding
      // behind every shelf
      const shape = (c: number): number => {
        const s = 230 + (at(Math.round(c * 1.7) + 260) - 520) * 0.28;
        return s < 240 ? 240 : s;
      };

      this.trace(g, cam, first, last, sx, shape);
      g.fill({ color: FAR_FILL, alpha: 0.42 });

      // faint crest highlight so the silhouette reads
      g.moveTo(sx(first * COL), cam.sy(shape(first)));
      for (let c = first; c < last; c++)
        g.lineTo(sx((c + 0.5) * COL), cam.sy((shape(c) + shape(c + 1)) / 2));
      g.stroke({ width: 1.5, color: FAR_RIM, alpha: 0.22 });
    }

    // ---------- near seabed ----------
    {
      const g = L.terrain;
      g.clear();
      const [left, right] = cam.visibleX(300);
      const first = Math.floor(left / COL);
      const last = Math.ceil(right / COL);
      if (last <= first + 2) return;

      const mx = (c: number): number => cam.sx((c + 0.5) * COL);
      const my = (c: number): number => cam.sy((at(c) + at(c + 1)) / 2);

      // solid body
      this.trace(g, cam, first, last, (wx) => cam.sx(wx), at);
      g.fill({ color: C.seabedDeep });

      // how flat the seabed is at column `c`: 1 on the near-horizontal shelf,
      // 0 on a steep break or trench wall
      const gentle = (c: number): number =>
        clamp01(1 - Math.abs(at(c + 1) - at(c)) / COL / 0.85);

      // sunlit shoulder — one translucent slab hugging the crest, its lower
      // edge pinched shut wherever the seabed pitches down so the lit shelf
      // reads as a shoulder that ends at the lip rather than a contour map
      // running all the way down the drop-off. A single vertical gradient
      // (SHOULDER_FILL) fades it out with depth in place of stacked bands.
      g.moveTo(cam.sx(first * COL), cam.sy(at(first)));
      for (let c = first; c < last; c++)
        g.quadraticCurveTo(cam.sx(c * COL), cam.sy(at(c)), mx(c), my(c));
      g.lineTo(cam.sx(last * COL), cam.sy(at(last)));
      for (let c = last; c >= first; c--)
        g.lineTo(
          cam.sx(c * COL),
          cam.sy(at(c)) + SHOULDER_DEPTH * sc * gentle(c),
        );
      g.closePath();
      g.fill(SHOULDER_FILL);

      // rubble on the steep faces
      this.scree(g, cam, first, last, at);

      // edges: a bright mint rim on the sunlit shelf that fades out at the lip,
      // plus a faint cool edge on near-vertical walls (trench lips only)
      for (let c = first; c < last; c++) {
        const amb = lightAt(at(c));
        const gc = gentle(c);
        const wall = Math.abs(at(c + 1) - at(c)) / COL > 2.4;
        const ax = c === first ? cam.sx(first * COL) : mx(c - 1);
        const ay = c === first ? cam.sy(at(first)) : my(c - 1);
        const stroke = (w: number, col: number, alpha: number): void => {
          g.moveTo(ax, ay);
          g.quadraticCurveTo(cam.sx(c * COL), cam.sy(at(c)), mx(c), my(c));
          g.stroke({ width: w, color: col, alpha, cap: "round" });
        };
        const rim = amb * 1.5 * clamp01(gc * 1.4 - 0.2);
        if (rim > 0.04) {
          stroke(3 + 2 * sc, C.reefRim, Math.min(0.22, rim * 0.28));
          stroke(1.5 + 1.4 * sc, C.reefRim, Math.min(1, rim));
        } else if (wall) {
          stroke(1 + sc, C.rockLit, 0.22);
        }
      }
    }
  }

  /** faceted boulders piled where the seabed pitches steeply — placement and
   * shape are deterministic from the column hash, so the scree is stable. */
  private scree(
    g: Graphics,
    cam: Camera,
    first: number,
    last: number,
    at: At,
  ): void {
    const sc = cam.scale;
    const gc = (c: number): number =>
      clamp01(1 - Math.abs(at(c + 1) - at(c)) / COL / 0.85);

    for (let c = first; c < last; c++) {
      // one pile at the single column where the shelf tips over into the break,
      // plus a rare loose block scattered further down the face
      const isLip = gc(c) > 0.5 && gc(c + 1) <= 0.5 && gc(c + 3) < 0.3;
      const loose =
        !isLip &&
        Math.abs(at(c + 1) - at(c)) / COL > 1.3 &&
        hash01(c * 1.73) < 0.04;
      if (!isLip && !loose) continue;

      const cluster = isLip ? 6 + Math.floor(hash01(c * 5.1) * 4) : 1;
      const spread = isLip ? 7 : 3;
      const big = isLip ? 1.15 : 0.5;
      for (let k = 0; k < cluster; k++) {
        const h1 = hash01(c * 7.3 + k * 41.1);
        const h2 = hash01(c * 3.9 + k * 17.7);
        const h3 = hash01(c * 11.1 + k * 5.3);
        const h4 = hash01(c * 2.6 + k * 9.4);
        const along = (c + (h1 - 0.5) * spread) * COL;
        const down = at(c) + h2 * 240 + (h4 - 0.5) * 70;
        const px = cam.sx(along);
        const py = cam.sy(down);
        const r = (24 + h3 * 58) * sc * big * (1 - h2 * 0.3);
        const verts = 5 + Math.floor(h2 * 3);
        const rot = h1 * 6.283;
        g.moveTo(px + Math.cos(rot) * r, py + Math.sin(rot) * r);
        for (let v = 1; v <= verts; v++) {
          const a = rot + (v / verts) * 6.283;
          const rr = r * (0.66 + hash01(c + k * 3 + v) * 0.46);
          g.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr);
        }
        g.closePath();
        g.fill({ color: SCREE });
        // lit facet on the sunward (upper-left) shoulder
        g.moveTo(px - r * 0.05, py - r * 0.05);
        g.lineTo(px - r * 0.98, py - r * 0.05);
        g.lineTo(px - r * 0.35, py - r * 0.92);
        g.closePath();
        g.fill({ color: SCREE_LIT, alpha: 0.16 + lightAt(down) * 0.3 });
      }
    }
  }

  /** Trace a smooth heightfield spline across `[first, last]` into a closed
   * polygon. `sx` maps world-x to screen-x (so a caller can apply parallax);
   * `y` returns the world-space floor height for column `c`. The bottom edge
   * sits below the deepest sampled point, guaranteeing a simple polygon. */
  private trace(
    g: Graphics,
    cam: Camera,
    first: number,
    last: number,
    sx: (wx: number) => number,
    y: (c: number) => number,
  ): void {
    let botY = cam.vh + 40;
    for (let c = first; c <= last; c++) {
      const s = cam.sy(y(c));
      if (s > botY) botY = s;
    }
    botY += 80;

    const px = (c: number): number => sx(c * COL);
    const py = (c: number): number => cam.sy(y(c));

    g.moveTo(px(first), botY);
    g.lineTo(px(first), py(first));
    for (let c = first; c < last; c++) {
      const mx = sx((c + 0.5) * COL);
      const my = cam.sy((y(c) + y(c + 1)) / 2);
      g.quadraticCurveTo(px(c), py(c), mx, my);
    }
    g.lineTo(px(last), py(last));
    g.lineTo(px(last), botY);
    g.closePath();
  }
}
