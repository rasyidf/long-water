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
    const faceDetail = smoothstep(0.3, 0.6, px); // eye + jaw line

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

    const darkSkin = mixColor(skin, 0x000000, 0.28);
    const finSkin = mixColor(skin, 0x000000, 0.18);

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
    {
      const rootT = BODY_END;
      const span = 20 * scale * foreK;
      const sweep = 12 * scale;

      const rx = at(rootT, 0, 0, this.w0).x;
      const ry = this.w0.y;
      at(rootT, -sweep, -span, this.w0);
      const topX = this.w0.x;
      const topY = this.w0.y;
      at(rootT, -sweep * 0.35, 0, this.w0);
      const notchX = this.w0.x;
      const notchY = this.w0.y;
      at(rootT, -sweep, span, this.w0);
      const botX = this.w0.x;
      const botY = this.w0.y;

      g.moveTo(rx, ry);
      at(rootT, 2, -span * 0.45, this.w0);
      g.quadraticCurveTo(this.w0.x, this.w0.y, topX, topY);
      at(rootT, -sweep * 0.7, -span * 0.25, this.w0);
      g.quadraticCurveTo(this.w0.x, this.w0.y, notchX, notchY);
      at(rootT, -sweep * 0.7, span * 0.25, this.w0);
      g.quadraticCurveTo(this.w0.x, this.w0.y, botX, botY);
      at(rootT, 2, span * 0.45, this.w0);
      g.quadraticCurveTo(this.w0.x, this.w0.y, rx, ry);
      g.closePath();
      g.fill({ color: finSkin, alpha });
    }

    // ---------- 3. Pale belly countershading ----------
    // The patch normally hugs the lower flank. As the whale rolls belly-to-
    // camera it spreads to cover the whole visible body; past a half roll it
    // sits on the *upper* flank (belly is up); as the back comes round it fades
    // out and the dark hull shows instead.
    {
      const lo = 0.02;
      const hi = BODY_END - 0.1;
      const spread = Math.max(bellyCam, flipped);
      const bandTop = (t: number): number => {
        const inner = bh(t) * (0.45 - 0.2 * smoothstep(0.1, 0.4, t));
        return inner + (-th(t) - inner) * spread;
      };
      const bandBot = (t: number): number => {
        const inner = bh(t) * (0.45 - 0.2 * smoothstep(0.1, 0.4, t));
        const outer = bh(t) * 0.98;
        return outer + (-inner - outer) * flipped;
      };
      let m = 0;
      for (let s = 0; s <= STEPS; s++) {
        const t = lo + (s / STEPS) * (hi - lo);
        const tp = bandTop(t);
        const bt = bandBot(t);
        const mid = (tp + bt) * 0.5;
        at(t, 0, (mid + (bt - mid) * (1 - backCam)) * foreK, this.pale[m++]);
      }
      for (let s = STEPS; s >= 0; s--) {
        const t = lo + (s / STEPS) * (hi - lo);
        const tp = bandTop(t);
        const bt = bandBot(t);
        const mid = (tp + bt) * 0.5;
        at(t, 0, (mid + (tp - mid) * (1 - backCam)) * foreK, this.pale[m++]);
      }
      drawBlob(g, this.pale, m);
      const ba = Math.min(
        1,
        alpha * 0.88 * (1 - backCam) * (1 + 0.5 * bellyCam),
      );
      g.fill({ color: belly, alpha: ba });
    }

    // ---------- 4. Pectoral flipper ----------
    if (detail > 0.02 && Math.abs(cr) > 0.04) {
      const t = 0.25;
      // signed girth — flips to the dorsal side once the whale rolls past 90°
      const bf = bh(t) * cr * foreK;
      const rfX = at(t, 10, bf * 0.05, this.w0).x;
      const rfY = this.w0.y;
      const rbX = at(t, -16, bf * 0.42, this.w0).x;
      const rbY = this.w0.y;
      const tfX = at(t, -20, bf * 1.32, this.w0).x;
      const tfY = this.w0.y;
      const tbX = at(t, -34, bf * 1.5, this.w0).x;
      const tbY = this.w0.y;

      g.moveTo(rfX, rfY);
      at(t, -4, bf * 0.9, this.w0); // leading edge
      g.quadraticCurveTo(this.w0.x, this.w0.y, tfX, tfY);
      at(t, -30, bf * 1.62, this.w0); // blunt tip
      g.quadraticCurveTo(this.w0.x, this.w0.y, tbX, tbY);
      at(t, -22, bf * 0.98, this.w0); // trailing edge
      g.quadraticCurveTo(this.w0.x, this.w0.y, rbX, rbY);
      at(t, -1, bf * 0.16, this.w0); // root fillet
      g.quadraticCurveTo(this.w0.x, this.w0.y, rfX, rfY);
      g.closePath();
      g.fill({
        color: darkSkin,
        alpha: alpha * detail * Math.max(0.15, Math.abs(cr)),
      });
    }

    // ---------- 5. Tiny dorsal fin ----------
    {
      const t = 0.75;
      const k = cr * foreK; // points up level, edge-on at 90°, down when inverted
      const r0X = at(t - 0.02, 0, -th(t - 0.02) * k, this.w0).x;
      const r0Y = this.w0.y;
      const r1X = at(t + 0.02, 0, -th(t + 0.02) * k, this.w0).x;
      const r1Y = this.w0.y;
      at(t + 0.01, -3, -(th(t) + 4) * k, this.w0);
      g.moveTo(r0X, r0Y);
      g.quadraticCurveTo(this.w0.x, this.w0.y, r1X, r1Y);
      g.closePath();
      g.fill({
        color: finSkin,
        alpha: alpha * Math.min(1, Math.abs(cr) + 0.1),
      });
    }

    // ---------- 6. Eye & throat jaw line ----------
    // both live on the near flank — gone once the whale rolls its belly or
    // back to the camera
    if (faceDetail > 0.02 && cr > 0.05) {
      const ek = cr * foreK;
      const fk = faceDetail * clamp01(cr);
      const snoutX = at(0.01, 0, bh(0.01) * 0.15 * ek, this.w0).x;
      const snoutY = this.w0.y;
      const jawX = at(0.2, -2, bh(0.2) * 0.25 * ek, this.w0).x;
      const jawY = this.w0.y;
      g.moveTo(snoutX, snoutY);
      at(0.1, 0, bh(0.1) * 0.25 * ek, this.w0);
      g.quadraticCurveTo(this.w0.x, this.w0.y, jawX, jawY);
      g.stroke({
        width: Math.max(0.8, 1.2 * px),
        color: mixColor(skin, 0x000000, 0.4),
        alpha: alpha * 0.5 * fk,
      });

      at(0.15, -1, -th(0.15) * 0.05 * ek, this.w0);
      g.circle(this.w0.x, this.w0.y, Math.max(1.2, 1.8 * px));
      g.fill({ color: 0x05090d, alpha: alpha * fk });
    }
  }
}
