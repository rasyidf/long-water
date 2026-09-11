import type { Graphics } from "pixi.js";
import type { Camera } from "../../core/Camera";
import { clamp01, lerp, smoothstep, type Vec2 } from "../../core/math";
import { mixColor } from "../color";
import { detailK, quality } from "../../state/Quality";
import {
  bandAt as sectionBandAt,
  bodyPoint,
  BODY_END,
  buildArcLength,
  buildHullOutline,
  buildTangents,
  computeSection,
  dorsalAnchors,
  edgeBot as sectionEdgeBot,
  edgeTop as sectionEdgeTop,
  faceAt as sectionFaceAt,
  type FinPoint,
  flukeAnchors,
  flukePitch,
  hash01,
  mouthPsi,
  pectoralAnchors,
  prpAt as sectionPrpAt,
  rollBasis,
  type RollBasis,
  type Section,
  spineFrameAt,
} from "./geometry";
import type { WhaleDrawOptions, WhaleSection, WhaleView } from "./WhaleView";

/** hull segments per side at full detail; the point pools are sized for this */
const MAX_STEPS = 40;
/** body length (world units) the fixed feature offsets below were tuned at */
const REF_LEN = 280;

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

/** open smooth polyline through `pts[0..count)`, for the rim / pleat strokes */
function drawRibbon(g: Graphics, pts: Vec2[], count: number): void {
  if (count < 2) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < count; i++) {
    const c = pts[i - 1];
    const d = pts[i];
    g.quadraticCurveTo(c.x, c.y, (c.x + d.x) / 2, (c.y + d.y) / 2);
  }
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
  private readonly w1: Vec2 = { x: 0, y: 0 };
  /** scratch band extent: `x` the top (dorsal-most) edge, `y` the bottom */
  private readonly band: Vec2 = { x: 0, y: 0 };
  /** scratch roll basis, rewritten once per draw */
  private readonly rb: RollBasis = { cs: 1, sn: 0 };
  /** scratch cross-section, memoised on `t` within a single draw */
  private readonly sec: Section = { A: 0, C: 0, B: 0, R: 0, D: 0 };
  /** scratch fin/fluke anchor points — 8 is the fluke's count, the largest */
  private readonly finPts: FinPoint[] = Array.from({ length: 8 }, () => ({
    t: 0,
    fwd: 0,
    prp: 0,
  }));
  private readonly finProj: Vec2[] = Array.from({ length: 8 }, () => ({
    x: 0,
    y: 0,
  }));

  // Countershade palette, rebuilt only when the skin / belly inputs change so a
  // pod sharing one skin colour costs a single `mixColor` sweep per frame.
  private ckSkin = -1;
  private ckBelly = -1;
  private cDark = 0;
  private cFin = 0;
  private cSheen = 0;
  private cShadow = 0;
  private cBlotch = 0;
  private cMid = 0;
  private cRim = 0;
  private cCrease = 0;
  private cEye = 0;

  private static pool(): Vec2[] {
    return Array.from({ length: MAX_STEPS * 2 + 8 }, () => ({ x: 0, y: 0 }));
  }

  private palette(skin: number, belly: number): void {
    if (skin === this.ckSkin && belly === this.ckBelly) return;
    this.ckSkin = skin;
    this.ckBelly = belly;
    this.cDark = mixColor(skin, 0x000000, 0.3); // far-side fins
    this.cFin = mixColor(skin, 0x000000, 0.12); // near-side fins
    this.cSheen = mixColor(skin, 0xcfe7f2, 0.34); // light from above
    this.cShadow = mixColor(skin, 0x00060f, 0.52); // form shadow underneath
    this.cBlotch = mixColor(skin, 0xa9c8d6, 0.5); // pale mottling flecks
    this.cMid = mixColor(belly, skin, 0.52); // soft countershade edge
    this.cRim = mixColor(skin, 0xffffff, 0.6);
    this.cCrease = mixColor(skin, 0x000508, 0.42); // pleats, mouth, blowhole
    this.cEye = mixColor(skin, 0x000000, 0.86);
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
    const total = buildArcLength(sp, this.cum, last);
    if (total < 1e-3) return;

    // --- smoothed per-vertex tangents, once per draw. A near-zero segment
    //     keeps its neighbour's tangent instead of snapping the frame to +x. ---
    buildTangents(sp, this.tan, last);

    const px = scale * cam.scale;
    // smooth LOD/visibility ramps so nothing pops as the camera scale drifts;
    // the graphics-quality dial scales them all down together, so a low-end
    // machine draws the same animal with less skin work and a coarser hull
    const qd = detailK(quality().creatureDetail);
    const detail = smoothstep(0.08, 0.26, px) * qd; // fins + hull resolution
    const faceDetail = smoothstep(0.24, 0.5, px) * qd; // eye, mouth, pleats
    const mottle = smoothstep(0.22, 0.48, px) * qd; // dappled skin + rim light

    // Hull resolution snaps to a few fixed tiers, so sample points don't crawl
    // as the camera scale drifts. (True hysteresis would need per-whale state;
    // this view instance is shared across the whole pod.)
    const STEPS = Math.max(
      16,
      Math.min(MAX_STEPS, Math.round((20 + 20 * detail) / 8) * 8),
    );

    // Body length in pre-`scale` units. The fixed feature offsets (flipper
    // reach, fluke span, fleck spread) were tuned at REF_LEN; `featK` keeps
    // them proportional if the measured body is a different length.
    const featK = total / scale / REF_LEN;

    // ---- roll basis -------------------------------------------------------
    // The body is modelled as an offset ellipse in cross-section, and rolling
    // it about the long axis is an honest 2D projection of that ellipse rather
    // than a pile of blend factors: `cs` / `sn` are how much of the ventral
    // axis points down-screen and how much points at the camera. See
    // `geometry.rollBasis` — `rollK` eases the angle back toward level and the
    // pair is renormalised so the projection below stays exact at any blend.
    rollBasis(
      opts.roll ?? 0,
      opts.rollK ?? (opts.roll != null ? 1 : 0),
      this.rb,
    );
    const cs = this.rb.cs; // ventral axis → screen-down  (1 level, -1 belly-up)
    const sn = this.rb.sn; // ventral axis → toward camera (1 belly-on, -1 back-on)

    // --- spine frame + point projection, writing into pre-allocated vectors ---
    const frameAt = (t: number): void => {
      spineFrameAt(
        sp,
        this.cum,
        this.tan,
        total,
        last,
        t,
        facing,
        this.p,
        this.f,
        this.per,
      );
    };

    /** screen-space point `fwd` along the spine tangent and `prp` off it */
    const at = (t: number, fwd: number, prp: number, out: Vec2): Vec2 => {
      frameAt(t);
      bodyPoint(this.p, this.f, this.per, fwd, prp, scale, out);
      out.x = cam.sx(out.x);
      out.y = cam.sy(out.y);
      return out;
    };

    /** project every `FinPoint` in `this.finPts[0..count)` through `at()` into
     * `this.finProj`, for the fin/fluke blade outlines below */
    const projectFinPts = (count: number): void => {
      for (let i = 0; i < count; i++) {
        at(
          this.finPts[i].t,
          this.finPts[i].fwd,
          this.finPts[i].prp,
          this.finProj[i],
        );
      }
    };

    // ---- cross-section, memoised on `t` ------------------------------------
    // Callers hit the same `t` two or three times in a row (top edge, bottom
    // edge, band centre), so one slot of memo removes most of the profile work.
    let mt = NaN;
    const sect = (t: number): void => {
      if (t === mt) return;
      mt = t;
      computeSection(t, width, juv, cs, sn, this.sec);
    };

    /** silhouette edges — exact for the rolled ellipse, so at level roll these
     * are the plain back / belly lines and edge-on they narrow to the girth */
    const edgeTop = (t: number): number => {
      sect(t);
      return sectionEdgeTop(this.sec, cs);
    };
    const edgeBot = (t: number): number => {
      sect(t);
      return sectionEdgeBot(this.sec, cs);
    };

    /**
     * Cross-section angle `psi`: 0 at the ventral keel, ±π/2 out on the flanks
     * (+ is the flank facing the camera at level roll), ±π at the dorsal ridge.
     * This is the anchor every surface marking uses, which is what makes the
     * belly patch, mottling, pleats and eye all roll as one body.
     */
    const prpAt = (t: number, psi: number): number => {
      sect(t);
      return sectionPrpAt(this.sec, cs, psi);
    };
    /** how squarely that surface point faces the camera: 1 head-on, 0 at the
     * silhouette edge, negative once it has rolled round the far side */
    const faceAt = (t: number, psi: number): number => {
      sect(t);
      return sectionFaceAt(this.sec, psi);
    };

    /**
     * Visible screen extent of the surface band `psi` ∈ centre ± half, clipped
     * to the silhouette. A band that has rolled fully out of sight collapses to
     * zero height on the edge it went round, so it simply stops drawing.
     */
    const bandAt = (t: number, centre: number, half: number): void => {
      sect(t);
      sectionBandAt(this.sec, cs, centre, half, this.band);
    };

    // shared band extent for the shading layers below
    const lo = 0.02;
    const hi = BODY_END - 0.04;

    /** fill the screen-space region between two perpendicular offsets */
    const drawBand = (
      dg: Graphics,
      topFn: (t: number) => number,
      botFn: (t: number) => number,
      color: number,
      a: number,
      lo0: number = lo,
      hi0: number = hi,
    ): void => {
      if (a <= 0.01) return;
      let m = 0;
      for (let s = 0; s <= STEPS; s++) {
        const t = lo0 + (s / STEPS) * (hi0 - lo0);
        at(t, 0, botFn(t), this.pale[m++]);
      }
      for (let s = STEPS; s >= 0; s--) {
        const t = lo0 + (s / STEPS) * (hi0 - lo0);
        at(t, 0, topFn(t), this.pale[m++]);
      }
      drawBlob(dg, this.pale, m);
      dg.fill({ color, alpha: Math.min(1, a) });
    };

    /** fill a band that lives on the skin, so it rolls with the body */
    const drawSurfBand = (
      dg: Graphics,
      centre: (t: number) => number,
      half: (t: number) => number,
      color: number,
      a: number,
      lo0: number = lo,
      hi0: number = hi,
    ): void => {
      if (a <= 0.01) return;
      let m = 0;
      for (let s = 0; s <= STEPS; s++) {
        const t = lo0 + (s / STEPS) * (hi0 - lo0);
        bandAt(t, centre(t), half(t));
        at(t, 0, this.band.y, this.pale[m++]);
      }
      for (let s = STEPS; s >= 0; s--) {
        const t = lo0 + (s / STEPS) * (hi0 - lo0);
        bandAt(t, centre(t), half(t));
        at(t, 0, this.band.x, this.pale[m++]);
      }
      drawBlob(dg, this.pale, m);
      dg.fill({ color, alpha: Math.min(1, a) });
    };

    // ---------- Pectoral flipper ----------
    // Long, slender and pointed, rooted low on the flank behind the eye and
    // trailing down and back. There are two of them, out on either side, so
    // they are foreshortened almost to nothing at level roll and swing to their
    // full span — one up, one down — as the whale turns onto its side.
    const drawPectoral = (side: number): void => {
      if (detail <= 0.02) return;
      const near = side * cs >= 0;
      const pg = pick(near ? "nearPectoral" : "farPectoral");
      const t = 0.27;
      sect(t);
      pectoralAnchors(this.sec, t, side, cs, sn, featK, this.finPts);
      projectFinPts(6);
      const P = this.finProj;
      pg.moveTo(P[0].x, P[0].y);
      pg.quadraticCurveTo(P[1].x, P[1].y, P[2].x, P[2].y); // root → tip
      pg.quadraticCurveTo(P[3].x, P[3].y, P[4].x, P[4].y); // tip → root back
      pg.quadraticCurveTo(P[5].x, P[5].y, P[0].x, P[0].y); // root fillet, close
      pg.closePath();
      // the underside is pale, so a flipper seen from below lightens
      const under = clamp01(sn) * 0.42;
      pg.fill({
        color: mixColor(near ? this.cFin : this.cDark, belly, under),
        alpha: alpha * (near ? 1 : 0.9) * smoothstep(0.02, 0.35, detail),
      });
    };

    // ---------- Dorsal fin ----------
    // Small, blunt and falcate, set three-quarters of the way back. It is a
    // blade in the whale's mid-plane, so it stands tall at level roll, vanishes
    // into the body edge-on, and hangs the other way once the whale is inverted.
    const drawDorsal = (): void => {
      const near = sn < 0; // the back is the side facing the camera
      const dg = pick(near ? "dorsal" : "farDorsal");
      const t = 0.74;
      sect(t);
      dorsalAnchors(this.sec, t, juv, cs, featK, this.finPts);
      projectFinPts(6);
      const P = this.finProj;
      dg.moveTo(P[0].x, P[0].y);
      dg.quadraticCurveTo(P[1].x, P[1].y, P[2].x, P[2].y); // front root → tip
      dg.quadraticCurveTo(P[3].x, P[3].y, P[4].x, P[4].y); // tip → back root
      dg.quadraticCurveTo(P[5].x, P[5].y, P[0].x, P[0].y); // closing fillet
      dg.closePath();
      dg.fill({ color: near ? this.cFin : this.cDark, alpha });
    };

    if (cs >= 0) {
      drawPectoral(-1);
    } else {
      drawPectoral(1);
    }
    if (sn >= 0) drawDorsal(); // the fin has rolled behind the body

    // ---------- Fluke ----------
    // The blades lie in the whale's horizontal plane, so from the side they are
    // seen almost edge-on — a slim swept blade — and open to their full span as
    // the whale rolls. The tips droop a little and the whole tail pitches with
    // the stroke, which is what keeps an edge-on fluke from reading as flat.
    {
      const fg = pick("fluke");
      const rootT = BODY_END;
      // Angle of attack from the pose itself: how far the tail stock bows off
      // the chord through it. It peaks at the ends of each stroke, so the blade
      // flashes its face on every beat without any extra state to carry.
      frameAt(rootT);
      const jA = sp[last];
      const jB = sp[Math.max(0, last - 2)];
      const jC = sp[Math.max(0, last - 4)];
      const pitch = flukePitch(this.per, jA, jB, jC);
      flukeAnchors(rootT, cs, sn, pitch, featK, this.finPts);
      projectFinPts(8);
      const P = this.finProj;
      fg.moveTo(P[0].x, P[0].y);
      fg.quadraticCurveTo(P[1].x, P[1].y, P[2].x, P[2].y); // root → near tip
      fg.quadraticCurveTo(P[3].x, P[3].y, P[4].x, P[4].y); // near tip → notch
      fg.quadraticCurveTo(P[5].x, P[5].y, P[6].x, P[6].y); // notch → far tip
      fg.quadraticCurveTo(P[7].x, P[7].y, P[0].x, P[0].y); // far tip → root
      fg.closePath();
      // the flukes' undersides are pale like the belly
      fg.fill({
        color: mixColor(this.cFin, belly, clamp01(sn) * 0.32),
        alpha,
      });
    }

    // ---------- Main body hull ----------
    // Wound as one loop: top edge aft, bottom edge forward, then the head cap.
    // (The cap points come last so the outline never crosses itself at the
    // rostrum, which would confuse earcut and notch the snout — see
    // `geometry.buildHullOutline` and its self-intersection test.)
    {
      const hg = pick("hull");
      const n = buildHullOutline(
        sp,
        this.cum,
        this.tan,
        total,
        last,
        facing,
        scale,
        width,
        juv,
        cs,
        sn,
        STEPS,
        this.p,
        this.f,
        this.per,
        this.sec,
        this.outline,
      );
      for (let i = 0; i < n; i++) {
        this.outline[i].x = cam.sx(this.outline[i].x);
        this.outline[i].y = cam.sy(this.outline[i].y);
      }
      drawBlob(hg, this.outline, n);
      hg.fill({ color: skin, alpha });
      // buildHullOutline wrote straight into this.sec, bypassing sect()'s own
      // memo — invalidate it so the next sect(t) call can't skip a recompute
      // on a stale match.
      mt = NaN;
    }

    // ---------- Pale belly countershading ----------
    // Pigment, not light: the pale patch is painted on the skin around the
    // ventral keel and rides higher up the flanks through the throat. Because
    // it is anchored to cross-section angles it wraps the whole body as the
    // whale rolls belly-on, slides to the upper flank past a half roll, and
    // disappears entirely when the back comes round — all from one band.
    {
      const bg = pick("belly");
      // How high up the flank the pale reaches: highest at the pleated throat,
      // settling to the lower third along the body and running out before the
      // tail stock. Over the head it can never cross the gape.
      const reach = (t: number): number =>
        Math.min(
          (1.1 + 0.3 * smoothstep(0.42, 0.08, t)) *
            (1 - 0.8 * smoothstep(0.6, 0.9, t)),
          mouthPsi(t),
        );
      drawSurfBand(
        bg,
        () => 0,
        (t) => Math.min(reach(t) + 0.22, mouthPsi(t) + 0.1),
        this.cMid,
        alpha * 0.5,
      );
      drawSurfBand(bg, () => 0, reach, belly, alpha * 0.95);
    }

    // ---------- Ventral pleats ----------
    // The throat grooves. They fan out of the chin and run back to the navel,
    // and they are the fastest read that this is a rorqual.
    if (faceDetail > 0.05) {
      const pg = pick("pleats");
      const t0 = 0.03;
      const t1 = 0.36;
      const lines = 3 + Math.round(5 * faceDetail);
      for (let j = 0; j < lines; j++) {
        const psi = (0.16 + (j + 0.6) * (0.82 / lines)) * (1 - 0.1 * juv);
        for (let s2 = 0; s2 < 2; s2++) {
          const ps = s2 ? -psi : psi;
          const vis = clamp01(faceAt((t0 + t1) * 0.5, ps) * 1.4);
          if (vis <= 0.03) continue;
          let m = 0;
          const PS = 7;
          for (let s = 0; s <= PS; s++) {
            const t = t0 + (s / PS) * (t1 - t0);
            // the grooves converge at the chin and fade out at the navel
            const k =
              smoothstep(0.02, 0.15, t) * (1 - 0.3 * smoothstep(0.24, 0.36, t));
            at(t, 0, prpAt(t, ps * k), this.pale[m++]);
          }
          drawRibbon(pg, this.pale, m);
          pg.stroke({
            width: Math.max(0.6, 0.9 * px),
            color: this.cCrease,
            alpha: alpha * 0.22 * vis * faceDetail,
          });
        }
      }
    }

    // ---------- Dappled skin mottling ----------
    // Scattered pale flecks across the back — the blue whale's signature
    // marbling. Each fleck is pinned to a spot on the skin, so it slides round
    // the body with the roll and fades out as it reaches the silhouette.
    if (mottle > 0.02) {
      const mg = pick("mottle");
      const flecks = 5 + Math.round(11 * mottle);
      for (let k = 0; k < flecks; k++) {
        const r1 = hash01(k + 0.5, seed);
        const r2 = hash01(k * 2.7 + 1.3, seed);
        const r3 = hash01(k * 4.1 + 5.9, seed);
        const t = 0.1 + r1 * 0.78;
        // spread over the upper two-thirds of the girth, both flanks
        const psi = (0.34 + 0.66 * r2) * Math.PI * (r3 < 0.5 ? 1 : -1);
        const vis = faceAt(t, psi);
        if (vis <= 0.02) continue;
        at(t, (r3 - 0.5) * 14 * featK, prpAt(t, psi), this.w0);
        mg.circle(
          this.w0.x,
          this.w0.y,
          (1.5 + r3 * 3.6) * px * (0.4 + 0.6 * vis),
        );
        mg.fill({
          color: this.cBlotch,
          // fade each fleck in with the mottle ramp instead of popping on
          alpha:
            alpha *
            mottle *
            clamp01(11 * mottle - k) *
            vis *
            (0.14 + 0.17 * r2),
        });
      }
    }

    // ---------- Light from above ----------
    // Screen-space, not body-space: the sun stays overhead however the whale is
    // turned, so this wash keeps sitting on whichever surface is uppermost. Two
    // stacked tiers make a cheap gradient without a shader.
    {
      const sg = pick("sheen");
      const tiers = mottle > 0.4 ? 3 : 1;
      for (let i = 0; i < tiers; i++) {
        const d = 0.52 - i * 0.17; // how far down the body this tier reaches
        drawBand(
          sg,
          (t) => edgeTop(t) * 0.995,
          (t) => lerp(edgeTop(t), edgeBot(t), d),
          this.cSheen,
          alpha * (i === 0 ? 0.3 : 0.2) * (i === 0 ? 1 : mottle),
        );
      }
    }

    // ---------- Form shadow underneath ----------
    {
      const dg = pick("shade");
      const tiers = mottle > 0.4 ? 2 : 1;
      for (let i = 0; i < tiers; i++) {
        const d = 0.7 + i * 0.16;
        drawBand(
          dg,
          (t) => lerp(edgeTop(t), edgeBot(t), d),
          (t) => edgeBot(t) * 0.995,
          this.cShadow,
          alpha * (i === 0 ? 0.26 : 0.2) * (i === 0 ? 1 : mottle),
        );
      }
    }

    if (sn < 0) drawDorsal(); // the back is toward us, so the fin is in front
    if (cs >= 0) {
      drawPectoral(1);
    } else {
      drawPectoral(-1);
    }

    // ---------- Rim light ----------
    // A bright line along the top of the body and a darker one underneath, to
    // lift the silhouette off the water. Both follow the screen edges, so they
    // stay put through a roll.
    if (mottle > 0.03) {
      const rg = pick("rim");
      const RS = 14;
      let b = 0;
      for (let s = 0; s <= RS; s++) {
        const t = 0.035 + (s / RS) * 0.66;
        at(t, 0, edgeTop(t) * 0.96, this.outline[b++]);
      }
      drawRibbon(rg, this.outline, b);
      rg.stroke({
        width: Math.max(0.8, 1.4 * px),
        color: this.cRim,
        alpha: alpha * 0.4 * mottle,
      });

      b = 0;
      for (let s = 0; s <= RS; s++) {
        const t = 0.06 + (s / RS) * 0.8;
        at(t, 0, edgeBot(t) * 0.97, this.outline[b++]);
      }
      drawRibbon(rg, this.outline, b);
      rg.stroke({
        width: Math.max(0.7, 1.1 * px),
        color: this.cShadow,
        alpha: alpha * 0.3 * mottle,
      });
    }

    // ---------- Eye, mouth line & blowhole ----------
    // All three are pinned to the skin like the mottling, so they mirror onto
    // whichever flank is facing the camera and slip out of sight on their own.
    if (faceDetail > 0.02) {
      const fcg = pick("face");
      const eyeT = 0.215;
      const jawT = 0.2;

      for (let s2 = 0; s2 < 2; s2++) {
        const side = s2 ? -1 : 1;
        const vis = clamp01(faceAt(eyeT, side * 1.16) * 1.5);
        if (vis <= 0.03) continue;
        const fk = faceDetail * vis;

        // the long gape: out of the rostrum tip, back and down to the jaw
        // corner just ahead of the eye
        let m = 0;
        const MS = 8;
        for (let s = 0; s <= MS; s++) {
          const t = 0.004 + (s / MS) * (jawT - 0.004);
          const psi = side * mouthPsi(t);
          at(t, 0, prpAt(t, psi), this.pale[m++]);
        }
        drawRibbon(fcg, this.pale, m);
        fcg.stroke({
          width: Math.max(0.7, 1.15 * px),
          color: this.cCrease,
          alpha: alpha * 0.6 * fk,
        });

        // eye, low and just behind the corner of the mouth
        at(eyeT, -1.5 * featK, prpAt(eyeT, side * 1.16), this.w0);
        const er = Math.max(1.1, 1.9 * px);
        fcg.circle(this.w0.x, this.w0.y, er);
        fcg.fill({ color: this.cEye, alpha: alpha * fk });
        if (px > 0.8) {
          fcg.circle(this.w0.x - er * 0.3, this.w0.y - er * 0.3, er * 0.34);
          fcg.fill({ color: 0xdfeef5, alpha: alpha * fk * 0.65 });
        }
      }

      // blowhole, a paired slit on the dorsal ridge behind the splash guard.
      // It sits exactly on the top edge at level roll, which is where you see
      // it from the side, so it stays legible until the belly comes round.
      const blowT = 0.115;
      const bvis = clamp01(0.6 + faceAt(blowT, Math.PI));
      if (bvis > 0.03) {
        at(blowT, 2.5 * featK, prpAt(blowT, Math.PI) * 0.99, this.w0);
        at(blowT, -3.5 * featK, prpAt(blowT, Math.PI) * 0.99, this.w1);
        fcg.moveTo(this.w0.x, this.w0.y);
        fcg.lineTo(this.w1.x, this.w1.y);
        fcg.stroke({
          width: Math.max(0.9, 1.8 * px),
          color: this.cCrease,
          alpha: alpha * 0.7 * bvis * faceDetail,
        });
      }
    }
  }
}
