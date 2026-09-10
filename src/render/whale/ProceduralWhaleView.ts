import type { Graphics } from "pixi.js";
import type { Camera } from "../../core/Camera";
import { clamp01, lerp, smoothstep, type Vec2 } from "../../core/math";
import { mixColor } from "../color";
import type { WhaleDrawOptions, WhaleSection, WhaleView } from "./WhaleView";

const BODY_END = 0.94;
/** hull segments per side at full detail; the point pools are sized for this */
const MAX_STEPS = 40;
/** body length (world units) the fixed feature offsets below were tuned at */
const REF_LEN = 280;

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

// `smoothstep(0.5, 0.1, t)` here deliberately passes the edges high→low: this
// codebase's smoothstep divides by `(b - a)` without reordering, so that form
// yields a ramp that is 1 at the rostrum and eases to 0 through the body.
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

/** cheap deterministic 0..1 hash, for placing the skin mottling. `seed` gives
 * each whale in a pod its own marbling. */
function hash01(n: number, seed: number): number {
  const s = Math.sin((n + seed * 1.37) * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class ProceduralWhaleView implements WhaleView {
  // Pre-allocated point pools + scratch vectors — draw() touches no `new` so a
  // pod of whales at 60fps produces no per-frame garbage from the geometry.
  private readonly outline: Vec2[] = ProceduralWhaleView.pool();
  private readonly pale: Vec2[] = ProceduralWhaleView.pool();
  /** smoothed per-vertex spine tangents, rebuilt once per draw */
  private readonly tan: Vec2[] = Array.from({ length: 24 }, () => ({
    x: 1,
    y: 0,
  }));
  /** cumulative spine arc length per vertex, rebuilt once per draw */
  private readonly cum: number[] = new Array(24).fill(0);
  private readonly p: Vec2 = { x: 0, y: 0 };
  private readonly f: Vec2 = { x: 1, y: 0 };
  private readonly per: Vec2 = { x: 0, y: 0 };
  private readonly w0: Vec2 = { x: 0, y: 0 };

  // Countershade palette, rebuilt only when the skin / belly inputs change so a
  // pod sharing one skin colour costs a single `mixColor` sweep per frame.
  private ckSkin = -1;
  private ckBelly = -1;
  private cDark = 0;
  private cFin = 0;
  private cSheen = 0;
  private cBlotch = 0;
  private cMid = 0;
  private cRim = 0;
  private cGape = 0;
  private cBlow = 0;

  private static pool(): Vec2[] {
    return Array.from({ length: MAX_STEPS * 2 + 8 }, () => ({ x: 0, y: 0 }));
  }

  private palette(skin: number, belly: number): void {
    if (skin === this.ckSkin && belly === this.ckBelly) return;
    this.ckSkin = skin;
    this.ckBelly = belly;
    this.cDark = mixColor(skin, 0x000000, 0.22);
    this.cFin = mixColor(skin, 0x000000, 0.16);
    this.cSheen = mixColor(skin, 0xbfdbe8, 0.24); // sunlit dorsal ridge
    this.cBlotch = mixColor(skin, 0xa9c8d6, 0.5); // pale mottling flecks
    this.cMid = mixColor(belly, skin, 0.5); // soft countershade edge
    this.cRim = mixColor(skin, 0xffffff, 0.55);
    this.cGape = mixColor(skin, 0x000000, 0.42);
    this.cBlow = mixColor(skin, 0x000000, 0.4);
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
    const seed = opts.seed ?? 0;
    const last = sp.length - 1;
    if (last < 1) return;

    // designer hook: route a named section to its own Graphics, or the shared one
    const pick = (s: WhaleSection): Graphics => opts.layer?.(s) ?? g;

    this.palette(skin, belly);

    // --- arc-length table: `t` tracks real length, not joint index, so head
    //     and peduncle proportions hold if the spine stretches unevenly --------
    this.cum[0] = 0;
    let total = 0;
    for (let i = 1; i <= last; i++) {
      total += Math.hypot(sp[i].x - sp[i - 1].x, sp[i].y - sp[i - 1].y);
      this.cum[i] = total;
    }
    if (total < 1e-3) return;

    // --- smoothed per-vertex tangents, once per draw. A near-zero segment
    //     keeps its neighbour's tangent instead of snapping the frame to +x. ---
    for (let i = 0; i <= last; i++) {
      const a = sp[Math.max(0, i - 1)];
      const b = sp[Math.min(last, i + 1)];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const len = Math.hypot(dx, dy);
      if (len > 1e-6) {
        this.tan[i].x = dx / len;
        this.tan[i].y = dy / len;
      } else if (i > 0) {
        this.tan[i].x = this.tan[i - 1].x;
        this.tan[i].y = this.tan[i - 1].y;
      } else {
        this.tan[i].x = 1;
        this.tan[i].y = 0;
      }
    }

    const px = scale * cam.scale;
    // smooth LOD/visibility ramps so nothing pops as the camera scale drifts
    const detail = smoothstep(0.08, 0.26, px); // fins + hull resolution
    const faceDetail = smoothstep(0.24, 0.5, px); // eye + jaw line
    const mottle = smoothstep(0.22, 0.48, px); // dappled skin + rim light

    // Hull resolution snaps to a few fixed tiers, so sample points don't crawl
    // as the camera scale drifts. (True hysteresis would need per-whale state;
    // this view instance is shared across the whole pod.)
    const STEPS = Math.max(
      16,
      Math.min(MAX_STEPS, Math.round((20 + 20 * detail) / 8) * 8),
    );

    // Body length in pre-`scale` units. The fixed feature offsets (flipper,
    // fluke span, fleck spread) were tuned at REF_LEN; `featK` keeps them
    // proportional if the measured body is a different length.
    const featK = total / scale / REF_LEN;

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
    // 1 level, 0.5 edge-on, 0 fully inverted. Blends the fuller belly profile
    // onto whichever side now faces "up", so the silhouette mirrors past 90°.
    const upK = clamp01((cr + 1) * 0.5);

    // --- spine frame + point projection, writing into pre-allocated vectors ---
    const frameAt = (t: number): void => {
      const target = clamp01(t) * total;
      let i = 0;
      while (i < last - 1 && this.cum[i + 1] < target) i++;
      const seg = this.cum[i + 1] - this.cum[i] || 1;
      const k = clamp01((target - this.cum[i]) / seg);
      this.p.x = sp[i].x + (sp[i + 1].x - sp[i].x) * k;
      this.p.y = sp[i].y + (sp[i + 1].y - sp[i].y) * k;
      // interpolate the smoothed vertex tangents, then renormalise, so the
      // outline offset turns continuously through each spine joint (no kinks)
      const fx = this.tan[i].x + (this.tan[i + 1].x - this.tan[i].x) * k;
      const fy = this.tan[i].y + (this.tan[i + 1].y - this.tan[i].y) * k;
      const fl = Math.hypot(fx, fy);
      if (fl > 1e-6) {
        this.f.x = fx / fl;
        this.f.y = fy / fl;
      }
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

    // Blended half-heights. At upK = 1 (level, and every pod whale) these are
    // exactly the plain profile; past 90° roll they swap so the belly profile
    // rides the up-facing edge and the fins anchor to the right silhouette.
    const th = (t: number): number =>
      lerp(botHalf(t, width, juv), topHalf(t, width, juv), upK);
    const bh = (t: number): number =>
      lerp(topHalf(t, width, juv), botHalf(t, width, juv), upK);

    const darkSkin = this.cDark;
    const finSkin = this.cFin;
    const backSheen = this.cSheen;
    const blotch = this.cBlotch;
    const midTone = this.cMid;

    // ---------- Pectoral flipper ----------
    // Long, slender, pointed, angled down and back off the forebody. Drawn
    // before the hull when it falls on the far side of the body (so the body
    // simply covers it), after the hull when it's on the near side.
    const drawPectoral = (): void => {
      if (detail <= 0.02 || Math.abs(cr) <= 0.04) return;
      const pg = pick(cr < 0 ? "farPectoral" : "nearPectoral");
      const t = 0.28;
      // signed girth — flips to the dorsal side once the whale rolls past 90°
      const bf = bh(t) * cr * foreK;
      const rfX = at(t, 11 * featK, bf * 0.05, this.w0).x;
      const rfY = this.w0.y;
      const rbX = at(t, -13 * featK, bf * 0.42, this.w0).x;
      const rbY = this.w0.y;
      const tipX = at(t, -46 * featK, bf * 1.72, this.w0).x;
      const tipY = this.w0.y;

      pg.moveTo(rfX, rfY);
      at(t, -12 * featK, bf * 1.02, this.w0); // leading edge, gently convex
      pg.quadraticCurveTo(this.w0.x, this.w0.y, tipX, tipY);
      at(t, -33 * featK, bf * 1.32, this.w0); // trailing edge back to the root
      pg.quadraticCurveTo(this.w0.x, this.w0.y, rbX, rbY);
      at(t, 0, bf * 0.16, this.w0); // root fillet
      pg.quadraticCurveTo(this.w0.x, this.w0.y, rfX, rfY);
      pg.closePath();
      pg.fill({
        color: darkSkin,
        alpha:
          cr < 0
            ? alpha
            : alpha *
              Math.max(0.2, Math.abs(cr)) *
              smoothstep(0.02, 0.35, detail),
      });
    };

    // ---------- far-side pectoral (under the hull) ----------
    if (cr < 0) drawPectoral();

    // ---------- Fluke ----------
    // swept-back blades, pointed tips, concave trailing edge and a centre notch.
    // Drawn before the hull so the tail stock covers the darker root seam.
    {
      const fg = pick("fluke");
      const rootT = BODY_END;
      const span = 22 * scale * foreK * featK;
      const sweep = 15 * scale * featK;

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

      fg.moveTo(rx, ry);
      at(rootT, 3 * featK, -span * 0.55, this.w0); // leading edge, root → top tip
      fg.quadraticCurveTo(this.w0.x, this.w0.y, topX, topY);
      at(rootT, -sweep * 1.35, -span * 0.34, this.w0); // concave trailing edge
      fg.quadraticCurveTo(this.w0.x, this.w0.y, notchX, notchY);
      at(rootT, -sweep * 1.35, span * 0.34, this.w0);
      fg.quadraticCurveTo(this.w0.x, this.w0.y, botX, botY);
      at(rootT, 3 * featK, span * 0.55, this.w0);
      fg.quadraticCurveTo(this.w0.x, this.w0.y, rx, ry);
      fg.closePath();
      fg.fill({ color: finSkin, alpha });
    }

    // ---------- Main body hull ----------
    // Wound as one loop: top edge aft, bottom edge forward, then the head cap.
    // (The cap points come last so the outline never crosses itself at the
    // rostrum, which would confuse earcut and notch the snout.)
    {
      const hg = pick("hull");
      let n = 0;
      for (let s = 1; s <= STEPS; s++) {
        const t = (s / STEPS) * BODY_END;
        at(t, 0, -th(t) * foreK, this.outline[n++]);
      }
      for (let s = STEPS; s >= 1; s--) {
        const t = (s / STEPS) * BODY_END;
        at(t, 0, bh(t) * foreK, this.outline[n++]);
      }
      at(0.01, 0, bh(0.01) * foreK, this.outline[n++]);
      at(0, 1, 0, this.outline[n++]);
      at(0.01, 0, -th(0.01) * foreK, this.outline[n++]);
      drawBlob(hg, this.outline, n);
      hg.fill({
        color: backCam > 0.01 ? mixColor(skin, 0x000000, 0.14 * backCam) : skin,
        alpha,
      });
    }

    // shared band extent for the shading layers below
    const lo = 0.02;
    const hi = BODY_END - 0.08;
    const drawBand = (
      dg: Graphics,
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
      drawBlob(dg, this.pale, m);
      dg.fill({ color, alpha: Math.min(1, a) });
    };

    // ---------- Sunlit dorsal sheen ----------
    // a lighter wash hugging the top edge, so the back reads as lit from above
    drawBand(
      pick("sheen"),
      (t) => -th(t) * 0.98,
      (t) => -th(t) * (0.1 + 0.34 * smoothstep(0.05, 0.75, t)),
      backSheen,
      alpha * 0.5 * clamp01(Math.abs(cr) + backCam * 0.4),
    );

    // ---------- Pale belly countershading ----------
    // The bright patch hugs the lower flank but sweeps up high behind the head
    // and along the lower jaw. A wider, fainter mid-tone band softens its upper
    // edge. As the whale rolls belly-to-camera both spread over the whole body;
    // past a half roll they sit on the upper flank; as the back comes round they
    // fade and the dark hull shows instead.
    {
      const bg = pick("belly");
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
        bg,
        (t) => bellyLevel(t) - th(t) * 0.24,
        bellyOuter,
        midTone,
        alpha * 0.5 * (1 - backCam),
      );
      drawBand(
        bg,
        bellyLevel,
        bellyOuter,
        belly,
        alpha * 0.9 * (1 - backCam) * (1 + 0.5 * bellyCam),
      );
    }

    // ---------- Dappled skin mottling ----------
    // scattered pale flecks over the back — the blue whale's signature marbling.
    // Visible when the back faces the camera too (it's most visible then), so
    // the gate follows `cr + backCam` like the sheen; the flecks also spread
    // over the whole girth as the back rolls round.
    const mottleShow = clamp01(cr + backCam);
    if (mottle > 0.02 && mottleShow > 0.02) {
      const mg = pick("mottle");
      const flecks = 4 + Math.round(9 * mottle);
      for (let k = 0; k < flecks; k++) {
        const r1 = hash01(k + 0.5, seed);
        const r2 = hash01(k * 2.7 + 1.3, seed);
        const r3 = hash01(k * 4.1 + 5.9, seed);
        const t = 0.12 + r1 * 0.74;
        const vy = -th(t) * (0.85 - r2 * (0.95 + 0.8 * backCam));
        at(t, (r3 - 0.5) * 12 * featK, vy * foreK, this.w0);
        mg.circle(this.w0.x, this.w0.y, (1.6 + r3 * 3.4) * px);
        mg.fill({
          color: blotch,
          // fade each fleck in with the mottle ramp instead of popping on
          alpha:
            alpha *
            mottle *
            mottleShow *
            clamp01(9 * mottle - k) *
            (0.1 + 0.12 * r2),
        });
      }
    }

    // ---------- near-side pectoral (over the hull) ----------
    if (cr >= 0) drawPectoral();

    // ---------- Small falcate dorsal fin ----------
    // a stubby, blunt hook set three-quarters of the way back
    {
      const dg = pick("dorsal");
      const t = 0.72;
      const k = cr * foreK; // points up level, edge-on at 90°, down when inverted
      const h = (th(t) * 0.8 + 3.5) * (1 - 0.22 * juv);
      const frX = at(t + 0.028, 0, -th(t + 0.028) * k, this.w0).x;
      const frY = this.w0.y;
      const bkX = at(t - 0.04, 0, -th(t - 0.04) * k, this.w0).x;
      const bkY = this.w0.y;
      const tpX = at(t - 0.018, -3 * featK, -(th(t) + h) * k, this.w0).x;
      const tpY = this.w0.y;

      dg.moveTo(frX, frY);
      at(t + 0.02, 2 * featK, -(th(t) + h * 0.55) * k, this.w0); // convex leading edge
      dg.quadraticCurveTo(this.w0.x, this.w0.y, tpX, tpY);
      at(t - 0.035, -4 * featK, -(th(t) + h * 0.5) * k, this.w0); // concave trailing edge
      dg.quadraticCurveTo(this.w0.x, this.w0.y, bkX, bkY);
      at(t - 0.005, 0, -th(t) * 0.5 * k, this.w0);
      dg.quadraticCurveTo(this.w0.x, this.w0.y, frX, frY);
      dg.closePath();
      dg.fill({
        color: finSkin,
        alpha: alpha * Math.min(1, Math.abs(cr) + 0.1),
      });
    }

    // ---------- Dorsal rim light ----------
    // a thin bright line where the overhead light catches the top of the back.
    // The sun is always above, so this stays on the screen-top edge at any roll.
    if (mottle > 0.03) {
      const rg = pick("rim");
      const RS = 12;
      let b = 0;
      for (let s = 0; s <= RS; s++) {
        const t = 0.05 + (s / RS) * 0.8;
        at(t, 0, -th(t) * 0.93 * foreK, this.outline[b++]);
      }
      rg.moveTo(this.outline[0].x, this.outline[0].y);
      for (let s = 1; s < b; s++) {
        const c = this.outline[s - 1];
        const d = this.outline[s];
        rg.quadraticCurveTo(c.x, c.y, (c.x + d.x) / 2, (c.y + d.y) / 2);
      }
      rg.stroke({
        width: Math.max(0.8, 1.3 * px),
        color: this.cRim,
        alpha: alpha * 0.42 * mottle * clamp01(Math.abs(cr) + backCam * 0.5),
      });
    }

    // ---------- Eye, jaw line & blowhole ----------
    // all live on whichever flank faces the camera — gone only when the whale
    // turns exactly edge-on
    if (faceDetail > 0.02 && Math.abs(cr) > 0.05) {
      const fcg = pick("face");
      const ek = cr * foreK; // signed — mirrors to the visible flank past 90°
      const fk = faceDetail * clamp01(Math.abs(cr));

      // long curved gape from the rostrum tip, ending just below and ahead of
      // the eye
      const snoutX = at(0.005, 0, bh(0.005) * 0.12 * ek, this.w0).x;
      const snoutY = this.w0.y;
      const jawX = at(0.22, -2 * featK, bh(0.22) * 0.34 * ek, this.w0).x;
      const jawY = this.w0.y;
      fcg.moveTo(snoutX, snoutY);
      at(0.12, 0, bh(0.12) * 0.28 * ek, this.w0);
      fcg.quadraticCurveTo(this.w0.x, this.w0.y, jawX, jawY);
      fcg.stroke({
        width: Math.max(0.8, 1.2 * px),
        color: this.cGape,
        alpha: alpha * 0.5 * fk,
      });

      // eye, low and just behind the corner of the mouth
      at(0.17, -2 * featK, bh(0.17) * 0.02 * ek, this.w0);
      fcg.circle(this.w0.x, this.w0.y, Math.max(1.2, 1.7 * px));
      fcg.fill({ color: 0x05090d, alpha: alpha * fk });

      // blowhole splash-guard mark on top of the head
      at(0.09, 0, -th(0.09) * 0.72 * ek, this.w0);
      fcg.circle(this.w0.x, this.w0.y, Math.max(0.9, 1.3 * px));
      fcg.fill({ color: this.cBlow, alpha: alpha * 0.7 * fk });
    }
  }
}
