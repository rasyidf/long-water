import type { Graphics } from "pixi.js";
import type { Camera } from "../../core/Camera";
import { clamp01, smoothstep, type Vec2 } from "../../core/math";
import { mixColor } from "../color";
import type { WhaleDrawOptions, WhaleView } from "./WhaleView";

const BODY_END = 0.94;
/** upper bound on hull segments per side; the point pools are sized for this */
const MAX_STEPS = 44;

/** Authentic Blue Whale body proportions. `juv` 0..1 morphs toward a calf:
 * the head takes up more of the body and is blunter, the forebody stays full,
 * and the tail tapers less. */
function profile(t: number, w: number, juv = 0): number {
  // Tapered rostrum — shorter and rounder on a calf, finer at the tip on an adult
  const head = Math.pow(clamp01(t / (0.17 + juv * 0.08)), 0.52 - juv * 0.2);
  // Holds the main girth longer through the body so they don't look thin
  const midGirth = 1.0 - (0.36 - juv * 0.16) * smoothstep(0.32, BODY_END, t);
  // Stronger tail section
  const peduncle = Math.pow(1 - clamp01(t / BODY_END), 0.6 - juv * 0.14);

  return w * head * midGirth * Math.max(0.11 + juv * 0.05, peduncle);
}

const topHalf = (t: number, w: number, juv = 0): number =>
  profile(t, w, juv) * 0.42;
const botHalf = (t: number, w: number, juv = 0): number =>
  profile(t, w, juv) * (0.58 + 0.15 * smoothstep(0.5, 0.1, t));

/** Smooth closed curve through `pts[0..count)`, quadratics via the midpoints. */
function drawBlob(g: Graphics, pts: Vec2[], count: number): void {
  if (count < 3) return;
  const a = pts[0];
  const z = pts[count - 1];
  g.moveTo((z.x + a.x) / 2, (z.y + a.y) / 2);
  for (let i = 0; i < count; i++) {
    const c = pts[i];
    const d = pts[(i + 1) % count];
    g.quadraticCurveTo(c.x, c.y, (c.x + d.x) / 2, (c.y + d.y) / 2);
  }
  g.closePath();
}

/** cheap deterministic 0..1 hash, for placing the skin mottling */
function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class ProceduralWhaleView implements WhaleView {
  // Pre-allocated point pools + scratch vectors — draw() touches no `new` so a
  // pod of whales at 60fps produces no per-frame garbage.
  private readonly outline: Vec2[] = ProceduralWhaleView.pool();
  private readonly pale: Vec2[] = ProceduralWhaleView.pool();
  private readonly p: Vec2 = { x: 0, y: 0 };
  private readonly f: Vec2 = { x: 0, y: 0 };
  private readonly per: Vec2 = { x: 0, y: 0 };
  private readonly w0: Vec2 = { x: 0, y: 0 };

  private static pool(): Vec2[] {
    return Array.from({ length: MAX_STEPS * 2 + 5 }, () => ({ x: 0, y: 0 }));
  }

  draw(
    g: Graphics,
    sp: ReadonlyArray<Vec2>,
    opts: WhaleDrawOptions,
    cam: Camera,
  ): void {
    const { scale, facing, skin, belly, alpha } = opts;
    const width = opts.width ?? 48;
    const juv = clamp01(opts.juv ?? 0);
    const last = sp.length - 1;
    if (last < 1) return;

    const px = scale * cam.scale;
    // smooth LOD/visibility ramps so nothing pops as the camera scale drifts
    const detail = smoothstep(0.08, 0.26, px); // fins + hull resolution
    const faceDetail = smoothstep(0.24, 0.5, px); // eye + jaw line
    const mottle = smoothstep(0.22, 0.48, px); // dappled skin + rim light

    // fewer hull segments when small/far; the pools cover the upper bound
    const STEPS = Math.max(
      8,
      Math.min(MAX_STEPS, Math.round(20 + 20 * detail)),
    );

    // --- barrel roll about the long axis, faked in the side view -------------
    // `roll` is the roll angle; `rk` eases the whole effect in/out. All the
    // drivers below collapse to "no effect" at rk = 0, so a level whale (and
    // every pod whale) renders exactly as before.
    const roll = opts.roll ?? 0;
    const rk = clamp01(opts.rollK ?? (opts.roll != null ? 1 : 0));
    const cs = Math.cos(roll);
    const sn = Math.sin(roll);
    // signed "how much the dorsal-ventral axis still faces the camera": 1 level,
    // 0 edge-on (90°), -1 rolled fully over (180°). Flips the fins to the far side.
    const cr = 1 + (cs - 1) * rk;
    // cross-section foreshortening as the body turns edge-on (a whale's girth
    // is ≈ 0.85 of its dorsal-ventral height, so the silhouette barely narrows)
    const foreK = 1 - 0.15 * Math.abs(sn) * rk;
    const bellyCam = Math.max(0, sn) * rk; // belly rotating toward the camera
    const backCam = Math.max(0, -sn) * rk; // dorsal/back rotating toward the camera
    const flipped = Math.max(0, -cs) * rk; // near 1 around a half roll (belly up)

    // --- spine frame + point projection, writing into pre-allocated vectors ---
    const frameAt = (t: number): void => {
      const u = clamp01(t) * last;
      const i = Math.min(last - 1, Math.floor(u));
      const k = u - i;
      this.p.x = sp[i].x + (sp[i + 1].x - sp[i].x) * k;
      this.p.y = sp[i].y + (sp[i + 1].y - sp[i].y) * k;
      const ang = Math.atan2(sp[i].y - sp[i + 1].y, sp[i].x - sp[i + 1].x);
      this.f.x = Math.cos(ang);
      this.f.y = Math.sin(ang);
      this.per.x = -this.f.y * facing;
      this.per.y = this.f.x * facing;
    };

    /** screen-space point `fwd` along the spine tangent and `prp` off it */
    const at = (t: number, fwd: number, prp: number, out: Vec2): Vec2 => {
      frameAt(t);
      const wx = this.p.x + (this.f.x * fwd + this.per.x * prp) * scale;
      const wy = this.p.y + (this.f.y * fwd + this.per.y * prp) * scale;
      out.x = cam.sx(wx);
      out.y = cam.sy(wy);
      return out;
    };

    const th = (t: number): number => topHalf(t, width, juv);
    const bh = (t: number): number => botHalf(t, width, juv);

    const darkSkin = mixColor(skin, 0x000000, 0.22);
    const finSkin = mixColor(skin, 0x000000, 0.16);
    const backSheen = mixColor(skin, 0xbfdbe8, 0.24); // sunlit dorsal ridge
    const blotch = mixColor(skin, 0xa9c8d6, 0.5); // pale mottling flecks
    const midTone = mixColor(belly, skin, 0.5); // soft countershade edge

    // ---------- 1. Main body hull ----------
    let n = 0;
    at(0.01, 0, -th(0.01) * foreK, this.outline[n++]);
    at(0, 1, 0, this.outline[n++]);
    at(0.01, 0, bh(0.01) * foreK, this.outline[n++]);
    for (let s = 1; s <= STEPS; s++) {
      const t = (s / STEPS) * BODY_END;
      at(t, 0, -th(t) * foreK, this.outline[n++]);
    }
    for (let s = STEPS; s >= 1; s--) {
      const t = (s / STEPS) * BODY_END;
      at(t, 0, bh(t) * foreK, this.outline[n++]);
    }
    drawBlob(g, this.outline, n);
    g.fill({ color: mixColor(skin, 0x000000, 0.14 * backCam), alpha });

    // ---------- 2. Fluke ----------
    // swept-back blades, pointed tips, concave trailing edge and a centre notch
    {
      const rootT = BODY_END;
      const span = 22 * scale * foreK;
      const sweep = 15 * scale;

      const rx = at(rootT, 0, 0, this.w0).x;
      const ry = this.w0.y;
      at(rootT, -sweep * 1.15, -span, this.w0);
      const topX = this.w0.x;
      const topY = this.w0.y;
      at(rootT, -sweep * 0.18, 0, this.w0);
      const notchX = this.w0.x;
      const notchY = this.w0.y;
      at(rootT, -sweep * 1.15, span, this.w0);
      const botX = this.w0.x;
      const botY = this.w0.y;

      g.moveTo(rx, ry);
      at(rootT, 3, -span * 0.55, this.w0); // leading edge, root → top tip
      g.quadraticCurveTo(this.w0.x, this.w0.y, topX, topY);
      at(rootT, -sweep * 1.35, -span * 0.34, this.w0); // concave trailing edge
      g.quadraticCurveTo(this.w0.x, this.w0.y, notchX, notchY);
      at(rootT, -sweep * 1.35, span * 0.34, this.w0);
      g.quadraticCurveTo(this.w0.x, this.w0.y, botX, botY);
      at(rootT, 3, span * 0.55, this.w0);
      g.quadraticCurveTo(this.w0.x, this.w0.y, rx, ry);
      g.closePath();
      g.fill({ color: finSkin, alpha });
    }

    // shared band extent for the shading layers below
    const lo = 0.02;
    const hi = BODY_END - 0.08;
    const drawBand = (
      topFn: (t: number) => number,
      botFn: (t: number) => number,
      color: number,
      a: number,
    ): void => {
      if (a <= 0.01) return;
      let m = 0;
      for (let s = 0; s <= STEPS; s++) {
        const t = lo + (s / STEPS) * (hi - lo);
        at(t, 0, botFn(t) * foreK, this.pale[m++]);
      }
      for (let s = STEPS; s >= 0; s--) {
        const t = lo + (s / STEPS) * (hi - lo);
        at(t, 0, topFn(t) * foreK, this.pale[m++]);
      }
      drawBlob(g, this.pale, m);
      g.fill({ color, alpha: Math.min(1, a) });
    };

    // ---------- 3. Sunlit dorsal sheen ----------
    // a lighter wash hugging the top edge, so the back reads as lit from above
    drawBand(
      (t) => -th(t) * 0.98,
      (t) => -th(t) * (0.1 + 0.34 * smoothstep(0.05, 0.75, t)),
      backSheen,
      alpha * 0.5 * clamp01(Math.abs(cr) + backCam * 0.4),
    );

    // ---------- 4. Pale belly countershading ----------
    // The bright patch hugs the lower flank but sweeps up high behind the head
    // and along the lower jaw. A wider, fainter mid-tone band softens its upper
    // edge. As the whale rolls belly-to-camera both spread over the whole body;
    // past a half roll they sit on the upper flank; as the back comes round they
    // fade and the dark hull shows instead.
    {
      const spread = Math.max(bellyCam, flipped);
      const bellyLevel = (t: number): number => {
        const base = bh(t) * (0.46 - 0.14 * smoothstep(0.08, 0.5, t));
        const lift = smoothstep(0.36, 0.04, t); // rises toward the rostrum
        let top = base + (-th(t) * 0.42 - base) * lift;
        top = top + (-th(t) - top) * spread;
        return top;
      };
      const bellyOuter = (t: number): number => {
        const outer = bh(t) * 0.99;
        return outer + (-bellyLevel(t) - outer) * flipped;
      };

      drawBand(
        (t) => bellyLevel(t) - th(t) * 0.24,
        bellyOuter,
        midTone,
        alpha * 0.5 * (1 - backCam),
      );
      drawBand(
        bellyLevel,
        bellyOuter,
        belly,
        alpha * 0.9 * (1 - backCam) * (1 + 0.5 * bellyCam),
      );
    }

    // ---------- 5. Dappled skin mottling ----------
    // scattered pale flecks over the back — the blue whale's signature marbling
    if (mottle > 0.02 && cr > 0.05) {
      const flecks = 4 + Math.round(9 * mottle);
      for (let k = 0; k < flecks; k++) {
        const r1 = hash01(k + 0.5);
        const r2 = hash01(k * 2.7 + 1.3);
        const r3 = hash01(k * 4.1 + 5.9);
        const t = 0.12 + r1 * 0.74;
        const vy = -th(t) * (0.85 - r2 * 0.95); // back → upper flank
        at(t, (r3 - 0.5) * 12 * scale, vy * foreK, this.w0);
        g.circle(this.w0.x, this.w0.y, (1.6 + r3 * 3.4) * px);
        g.fill({
          color: blotch,
          alpha: alpha * mottle * clamp01(cr) * (0.1 + 0.12 * r2),
        });
      }
    }

    // ---------- 6. Pectoral flipper ----------
    // long, slender and pointed, angled down and back off the forebody
    if (detail > 0.02 && Math.abs(cr) > 0.04) {
      const t = 0.28;
      // signed girth — flips to the dorsal side once the whale rolls past 90°
      const bf = bh(t) * cr * foreK;
      const rfX = at(t, 11, bf * 0.05, this.w0).x;
      const rfY = this.w0.y;
      const rbX = at(t, -13, bf * 0.42, this.w0).x;
      const rbY = this.w0.y;
      const tipX = at(t, -46, bf * 1.72, this.w0).x;
      const tipY = this.w0.y;

      g.moveTo(rfX, rfY);
      at(t, -12, bf * 1.02, this.w0); // leading edge, gently convex
      g.quadraticCurveTo(this.w0.x, this.w0.y, tipX, tipY);
      at(t, -33, bf * 1.32, this.w0); // trailing edge back to the root
      g.quadraticCurveTo(this.w0.x, this.w0.y, rbX, rbY);
      at(t, 0, bf * 0.16, this.w0); // root fillet
      g.quadraticCurveTo(this.w0.x, this.w0.y, rfX, rfY);
      g.closePath();
      g.fill({
        color: darkSkin,
        alpha:
          alpha * Math.max(0.2, Math.abs(cr)) * smoothstep(0.02, 0.35, detail),
      });
    }

    // ---------- 7. Small falcate dorsal fin ----------
    // a stubby, blunt hook set three-quarters of the way back
    {
      const t = 0.72;
      const k = cr * foreK; // points up level, edge-on at 90°, down when inverted
      const h = th(t) * 0.8 + 3.5;
      const frX = at(t + 0.028, 0, -th(t + 0.028) * k, this.w0).x;
      const frY = this.w0.y;
      const bkX = at(t - 0.04, 0, -th(t - 0.04) * k, this.w0).x;
      const bkY = this.w0.y;
      const tpX = at(t - 0.018, -3, -(th(t) + h) * k, this.w0).x;
      const tpY = this.w0.y;

      g.moveTo(frX, frY);
      at(t + 0.02, 2, -(th(t) + h * 0.55) * k, this.w0); // convex leading edge
      g.quadraticCurveTo(this.w0.x, this.w0.y, tpX, tpY);
      at(t - 0.035, -4, -(th(t) + h * 0.5) * k, this.w0); // concave trailing edge
      g.quadraticCurveTo(this.w0.x, this.w0.y, bkX, bkY);
      at(t - 0.005, 0, -th(t) * 0.5 * k, this.w0);
      g.quadraticCurveTo(this.w0.x, this.w0.y, frX, frY);
      g.closePath();
      g.fill({
        color: finSkin,
        alpha: alpha * Math.min(1, Math.abs(cr) + 0.1),
      });
    }

    // ---------- 8. Dorsal rim light ----------
    // a thin bright line where the overhead light catches the top of the back
    if (mottle > 0.03 && cr > 0.2) {
      const RS = 12;
      let b = 0;
      for (let s = 0; s <= RS; s++) {
        const t = 0.05 + (s / RS) * 0.8;
        at(t, 0, -th(t) * 0.93 * foreK, this.outline[b++]);
      }
      g.moveTo(this.outline[0].x, this.outline[0].y);
      for (let s = 1; s < b; s++) {
        const c = this.outline[s - 1];
        const d = this.outline[s];
        g.quadraticCurveTo(c.x, c.y, (c.x + d.x) / 2, (c.y + d.y) / 2);
      }
      g.stroke({
        width: Math.max(0.8, 1.3 * px),
        color: mixColor(skin, 0xffffff, 0.55),
        alpha: alpha * 0.42 * mottle * clamp01(cr),
      });
    }

    // ---------- 9. Eye, jaw line & blowhole ----------
    // all live on the near flank — gone once the whale rolls its belly or
    // back to the camera
    if (faceDetail > 0.02 && cr > 0.05) {
      const ek = cr * foreK;
      const fk = faceDetail * clamp01(cr);

      // long curved gape from the rostrum tip past the eye
      const snoutX = at(0.005, 0, bh(0.005) * 0.12 * ek, this.w0).x;
      const snoutY = this.w0.y;
      const jawX = at(0.24, -2, bh(0.24) * 0.28 * ek, this.w0).x;
      const jawY = this.w0.y;
      g.moveTo(snoutX, snoutY);
      at(0.12, 0, bh(0.12) * 0.28 * ek, this.w0);
      g.quadraticCurveTo(this.w0.x, this.w0.y, jawX, jawY);
      g.stroke({
        width: Math.max(0.8, 1.2 * px),
        color: mixColor(skin, 0x000000, 0.42),
        alpha: alpha * 0.5 * fk,
      });

      // eye, low and just behind the corner of the mouth
      at(0.17, -2, bh(0.17) * 0.02 * ek, this.w0);
      g.circle(this.w0.x, this.w0.y, Math.max(1.2, 1.7 * px));
      g.fill({ color: 0x05090d, alpha: alpha * fk });

      // blowhole splash-guard mark on top of the head
      at(0.09, 0, -th(0.09) * 0.72 * ek, this.w0);
      g.circle(this.w0.x, this.w0.y, Math.max(0.9, 1.3 * px));
      g.fill({ color: mixColor(skin, 0x000000, 0.4), alpha: alpha * 0.7 * fk });
    }
  }
}
