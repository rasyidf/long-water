/**
 * Procedural deep-water squid — one filled body per animal, built from the
 * pure shapes in `./geometry` and projected here. Everything is laid out in
 * the squid's local frame (`+along` is the mantle tip; the head and the arms
 * hang off the other end), rotated by `sq.heading` and pushed through the
 * camera.
 *
 * The animal breathes: the mantle squeezes fast and refills slowly on each jet
 * stroke (and lengthens as it squeezes), the two lateral fins ripple with a
 * wave travelling root → tip, and every arm carries its own travelling sway
 * that closes into a curl toward the centre as `sq.flare` opens the fan for a
 * grab. The skin flushes from deep maroon to a pale ghost with `sq.arousal`,
 * and the chromatophore flecks contract away as it pales.
 *
 * Light is split the same way as the whale: markings (ventral stripe, flecks,
 * photophores) live on the skin, while the sheen / shadow / rim are screen-
 * space — they sit on whichever flank is uppermost, however the squid is
 * turned, so the sun stays overhead. The photophore bloom is the additive pass
 * in `GlowRenderer`, which reads the same anchors from `./geometry`.
 */
import type { Graphics } from "pixi.js";

import type { Camera } from "../../core/Camera";
import { clamp01, smoothstep, type Vec2 } from "../../core/math";
import type { Squid } from "../../state/Squid";
import { mixColor } from "../color";
import {
  buildFin,
  buildMantleOutline,
  eyeLocal,
  eyeRadius,
  FIN_SAMPLES,
  hash01,
  headLocal,
  headRadius,
  individual,
  type Individual,
  jetGirth,
  jetLength,
  limbPoints,
  LIMBS,
  mantleHalf,
  PHOTOPHORES,
  photophoreLocal,
  pulseWave,
  worldToLocal,
} from "./geometry";
import { squidLook, type SquidLook } from "./params";
import type { SquidDrawOptions, SquidSection, SquidView } from "./SquidView";

/** mantle edge samples per side at full detail; the pools are sized for this */
const MAX_STEPS = 24;
/** centre-line samples per limb at full detail */
const MAX_S = 8;

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

/** open smooth polyline through `pts[0..count)`, for the rim thread */
function drawRibbon(g: Graphics, pts: Vec2[], count: number): void {
  if (count < 2) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < count; i++) {
    const c = pts[i - 1];
    const d = pts[i];
    g.quadraticCurveTo(c.x, c.y, (c.x + d.x) / 2, (c.y + d.y) / 2);
  }
}

export class ProceduralSquidView implements SquidView {
  // Pre-allocated point pools + scratch — draw() touches no `new`, so even a
  // scene tab full of squid produces no per-frame geometry garbage.
  private readonly outline: Vec2[] = ProceduralSquidView.pool(
    MAX_STEPS * 2 + 4,
  );
  private readonly band: Vec2[] = ProceduralSquidView.pool(MAX_STEPS * 2 + 4);
  private readonly limbLocal: Vec2[] = ProceduralSquidView.pool(
    (MAX_S + 1) * 2,
  );
  private readonly limbScreen: Vec2[] = ProceduralSquidView.pool(
    (MAX_S + 1) * 2,
  );
  private readonly fin: Vec2[] = ProceduralSquidView.pool(FIN_SAMPLES + 3);
  private readonly ind: Individual = {
    mantleK: 1,
    girthK: 1,
    finK: 1,
    armK: 1,
    tentK: 1,
    seed: 0,
  };
  private readonly root: Vec2 = { x: 0, y: 0 };
  private readonly grip: Vec2 = { x: 0, y: 0 };
  private readonly w0: Vec2 = { x: 0, y: 0 };
  private readonly w1: Vec2 = { x: 0, y: 0 };

  // the local → screen frame for the squid being drawn, set once per draw()
  private ox = 0;
  private oy = 0;
  private k = 1;
  private ca = 1;
  private sa = 0;

  // Palette, rebuilt only when the (quantised) arousal changes, so a resting
  // squid costs no `mixColor` sweeps at all.
  private ckArousal = -1;
  private cSkin = 0;
  private cFin = 0;
  private cFarFin = 0;
  private cArm = 0;
  private cFar = 0;
  private cStripe = 0;
  private cSheen = 0;
  private cShadow = 0;
  private cRim = 0;
  private cFleck = 0;
  private cFleckPale = 0;
  private cEye = 0;
  private cPhoto = 0;

  private static pool(n: number): Vec2[] {
    return Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  }

  private palette(arousal: number): void {
    const q = Math.round(arousal * 32);
    if (q === this.ckArousal) return;
    this.ckArousal = q;
    const a = q / 32;
    const skin = mixColor(0x5c2733, 0xdcc4cb, clamp01(0.12 + a * 0.7));
    this.cSkin = skin;
    this.cFin = mixColor(skin, 0x000000, 0.24);
    this.cFarFin = mixColor(skin, 0x000000, 0.4);
    this.cArm = mixColor(skin, 0x000000, 0.12);
    this.cFar = mixColor(skin, 0x000000, 0.36);
    this.cStripe = mixColor(skin, 0xffffff, 0.3);
    this.cSheen = mixColor(skin, 0xe6d8de, 0.4);
    this.cShadow = mixColor(skin, 0x02030a, 0.5);
    this.cRim = mixColor(skin, 0xffffff, 0.62);
    this.cFleck = mixColor(skin, 0x1a0509, 0.55);
    this.cFleckPale = mixColor(skin, 0xffe9ee, 0.5);
    this.cEye = 0x05070b;
    this.cPhoto = mixColor(0x7fd7e6, skin, 0.25);
  }

  /** screen-space point from local (`al`, `pe`) */
  private proj(al: number, pe: number, out: Vec2): Vec2 {
    out.x = this.ox + (al * this.ca - pe * this.sa) * this.k;
    out.y = this.oy + (al * this.sa + pe * this.ca) * this.k;
    return out;
  }

  /** project `n` local points in `src` into `dst` */
  private projAll(src: Vec2[], dst: Vec2[], n: number): void {
    for (let i = 0; i < n; i++) this.proj(src[i].x, src[i].y, dst[i]);
  }

  /**
   * Fill the region of the mantle on flank `side` between `inner` and `outer`
   * (fractions of the local half-width) over `u0..u1` of the length — the
   * building block for the stripe, the sheen and the form shadow.
   */
  private mantleBand(
    dg: Graphics,
    ml: number,
    mw: number,
    side: number,
    inner: number,
    outer: number,
    u0: number,
    u1: number,
    steps: number,
    color: number,
    a: number,
  ): void {
    if (a <= 0.01) return;
    let m = 0;
    for (let s = 0; s <= steps; s++) {
      const u = u0 + (s / steps) * (u1 - u0);
      this.proj(u * ml, side * mantleHalf(u, mw) * outer, this.band[m++]);
    }
    for (let s = steps; s >= 0; s--) {
      const u = u0 + (s / steps) * (u1 - u0);
      this.proj(u * ml, side * mantleHalf(u, mw) * inner, this.band[m++]);
    }
    drawBlob(dg, this.band, m);
    dg.fill({ color, alpha: Math.min(1, a) });
  }

  /** one limb (arm or tentacle), projected and filled */
  private limb(
    lg: Graphics,
    i: number,
    look: SquidLook,
    flare: number,
    sq: Squid,
    ml: number,
    mw: number,
    grip: Vec2 | null,
    S: number,
    color: number,
    alpha: number,
  ): void {
    const n = limbPoints(
      i,
      look,
      this.ind,
      flare,
      sq.jet,
      sq.ph,
      ml,
      mw,
      grip,
      S,
      this.limbLocal,
      this.root,
    );
    this.projAll(this.limbLocal, this.limbScreen, n);
    drawBlob(lg, this.limbScreen, n);
    lg.fill({ color, alpha });
  }

  /** one lateral fin lobe on `side`, projected and filled */
  private finLobe(
    fg: Graphics,
    side: number,
    look: SquidLook,
    jet: number,
    ml: number,
    mw: number,
    color: number,
    alpha: number,
  ): void {
    const n = buildFin(ml, mw, look, this.ind, side, jet, this.fin);
    this.projAll(this.fin, this.fin, n);
    drawBlob(fg, this.fin, n);
    fg.fill({ color, alpha: alpha * 0.92 });
  }

  draw(g: Graphics, sq: Squid, opts: SquidDrawOptions, cam: Camera): void {
    const look: SquidLook = opts.look ?? squidLook();
    const alpha = opts.alpha;
    if (alpha <= 0.01) return;
    const pick = (s: SquidSection): Graphics => opts.layer?.(s) ?? g;

    this.ox = cam.sx(sq.x);
    this.oy = cam.sy(sq.y);
    this.k = cam.scale * sq.size;
    this.ca = Math.cos(sq.heading);
    this.sa = Math.sin(sq.heading);
    const k = this.k;
    const ca = this.ca;
    const sa = this.sa;

    const arousal = clamp01(sq.arousal);
    const flare = clamp01(sq.flare);
    this.palette(arousal);
    individual(sq.ph, look.variety, this.ind);
    const ind = this.ind;

    // smooth LOD ramps on the on-screen size so nothing pops as the camera
    // scale drifts; `k` is pixels per local unit
    const detail = smoothstep(0.06, 0.28, k); // limb samples, hull steps
    const fine = smoothstep(0.22, 0.5, k); // flecks, rim, eye highlight
    const STEPS = Math.max(
      12,
      Math.min(MAX_STEPS, Math.round((12 + 12 * detail) / 4) * 4),
    );
    const S = Math.max(4, Math.min(MAX_S, 4 + Math.round(4 * detail)));

    // the breathing mantle: fast squeeze, slow refill, longer when squeezed.
    // The head and eye are sized off `look.headR` and never see this.
    const w = pulseWave(sq.jet);
    const mw = look.mantleW * ind.girthK * jetGirth(sq.jet, look.pulseDepth);
    const ml =
      look.mantleLen * ind.mantleK * jetLength(sq.jet, look.pulseDepth);

    // Which local flank faces up-screen. Local +across maps to the screen
    // vector (-sin h, cos h), so it points down-screen when cos h > 0. The
    // up-flank carries the sheen / rim / eye; the down-flank the shadow and
    // the pale ventral stripe. `upK` is how squarely the flanks face up/down
    // at all (they don't when the squid points straight up or down), and
    // `tipUp` how much the mantle tip itself is the uppermost surface.
    const up = ca >= 0 ? -1 : 1;
    const upK = Math.abs(ca);
    const tipUp = clamp01(-sa);
    const headUp = clamp01(sa);

    // grip target into the local frame, for the tentacle bend
    let grip: Vec2 | null = null;
    if (opts.gripAt) {
      grip = worldToLocal(
        sq.x,
        sq.y,
        sq.heading,
        sq.size,
        opts.gripAt.x,
        opts.gripAt.y,
        this.grip,
      );
    }

    // ---------- Far arms ----------
    // Half the fan sits on the far side of the head. Alternating slots go
    // behind, so both flanks read as having depth rather than one side being
    // wholly in front of the other. The far tentacle is the first of the pair.
    {
      const ag = pick("farArms");
      for (let i = 0; i < LIMBS; i++) {
        if (i % 2 !== 0) continue;
        this.limb(ag, i, look, flare, sq, ml, mw, grip, S, this.cFar, alpha);
      }
    }

    // ---------- Paired lateral fins ----------
    // Two lobes, one on each flank, rooted along the back half of the mantle.
    // Both are drawn before the mantle so its fill hides their roots; the
    // down-screen lobe is the far one and goes first, slightly darker.
    {
      this.finLobe(
        pick("farFin"),
        -up,
        look,
        sq.jet,
        ml,
        mw,
        this.cFarFin,
        alpha,
      );
      this.finLobe(pick("nearFin"), up, look, sq.jet, ml, mw, this.cFin, alpha);
    }

    // ---------- Mantle ----------
    {
      const mg = pick("mantle");
      const n = buildMantleOutline(ml, mw, STEPS, this.outline);
      this.projAll(this.outline, this.outline, n);
      drawBlob(mg, this.outline, n);
      mg.fill({ color: this.cSkin, alpha: alpha * 0.96 });
    }

    // ---------- Pale ventral stripe ----------
    // Countershading on the skin: the belly flank is the one hanging
    // down-screen, so the stripe rides the down-flank and slides toward the
    // centre line as the squid turns to point straight up or down.
    this.mantleBand(
      pick("stripe"),
      ml,
      mw,
      -up,
      0.15,
      0.72,
      0.03,
      0.9,
      STEPS,
      this.cStripe,
      alpha * 0.3 * (0.4 + 0.6 * upK),
    );

    // ---------- Chromatophore flecks ----------
    // Dark pigment cells scattered over the mantle, each pinned to a spot on
    // the skin. They contract as the animal pales with arousal, which is what
    // a real squid's flash-to-white looks like.
    if (fine > 0.02 && look.mottle > 0.02) {
      const mg = pick("mottle");
      const flecks = Math.round((6 + 14 * fine) * look.mottle);
      const shrink = 1 - 0.7 * arousal;
      for (let i = 0; i < flecks; i++) {
        const r1 = hash01(i * 2.3 + 0.7, ind.seed);
        const r2 = hash01(i * 3.7 + 1.9, ind.seed);
        const r3 = hash01(i * 5.1 + 4.2, ind.seed);
        const u = 0.05 + r1 * 0.88;
        const v = (r2 * 2 - 1) * 0.86;
        this.proj(u * ml, v * mantleHalf(u, mw), this.w0);
        const pale = r3 > 0.78;
        mg.circle(
          this.w0.x,
          this.w0.y,
          (1.2 + r3 * 2.4) * k * (pale ? 0.8 : shrink) * mantleHalf(u, 1),
        );
        mg.fill({
          color: pale ? this.cFleckPale : this.cFleck,
          alpha:
            alpha *
            fine *
            clamp01(14 * fine - i * 0.7) *
            (pale ? 0.22 : 0.3 * shrink + 0.05),
        });
      }
    }

    // ---------- Photophores ----------
    // The base dots of the light organs down each flank; the bloom around them
    // is `GlowRenderer`'s additive pass, reading the same anchors.
    if (detail > 0.05) {
      const pg = pick("photophores");
      const lit = 0.25 + 0.75 * arousal;
      const pulse = 0.7 + 0.3 * (0.5 - 0.5 * w);
      for (let n = 0; n < PHOTOPHORES; n++) {
        photophoreLocal(n, ml, mw, this.w0);
        this.proj(this.w0.x, this.w0.y, this.w1);
        pg.circle(
          this.w1.x,
          this.w1.y,
          (1.4 + n * 0.15) * k * (0.5 + 0.5 * detail),
        );
        pg.fill({ color: this.cPhoto, alpha: alpha * lit * pulse * 0.8 });
      }
    }

    // ---------- Light from above ----------
    // Screen-space, not body-space: a wash along whichever flank is uppermost,
    // fading as the squid turns to point straight up (when the mantle tip
    // takes the light instead) or straight down (when the head does).
    {
      const sg = pick("sheen");
      const tiers = fine > 0.4 ? 2 : 1;
      for (let i = 0; i < tiers; i++) {
        this.mantleBand(
          sg,
          ml,
          mw,
          up,
          0.5 - i * 0.22,
          0.995,
          0.02,
          0.96,
          STEPS,
          this.cSheen,
          alpha * upK * (i === 0 ? 0.3 : 0.18),
        );
      }
      // the mantle tip catches the light when it points up
      this.mantleBand(
        sg,
        ml,
        mw,
        1,
        -1,
        1,
        0.62,
        0.99,
        STEPS,
        this.cSheen,
        alpha * tipUp * 0.28,
      );
      // ...and the head's crown when the head does
      if (headUp > 0.02) {
        headLocal(look, this.w0);
        this.proj(this.w0.x - headRadius(look) * 0.28, this.w0.y, this.w1);
        sg.circle(this.w1.x, this.w1.y, headRadius(look) * 0.72 * k);
        sg.fill({ color: this.cSheen, alpha: alpha * headUp * 0.26 });
      }
    }

    // ---------- Form shadow underneath ----------
    {
      const dg = pick("shade");
      this.mantleBand(
        dg,
        ml,
        mw,
        -up,
        0.6,
        0.995,
        0.02,
        0.96,
        STEPS,
        this.cShadow,
        alpha * upK * 0.3,
      );
      this.mantleBand(
        dg,
        ml,
        mw,
        1,
        -1,
        1,
        0.66,
        0.99,
        STEPS,
        this.cShadow,
        alpha * headUp * 0.26,
      );
    }

    // ---------- Head ----------
    // Sized off `look.headR`, deliberately outside the jet pulse: only the
    // mantle contracts to jet, the head just rides along.
    {
      const hg = pick("head");
      headLocal(look, this.w0);
      this.proj(this.w0.x, this.w0.y, this.w1);
      hg.circle(this.w1.x, this.w1.y, headRadius(look) * k);
      hg.fill({ color: this.cSkin, alpha: alpha * 0.96 });
      // its own bit of overhead light / underside shadow
      if (upK > 0.05) {
        const r = headRadius(look) * k;
        hg.circle(this.w1.x, this.w1.y - r * 0.3, r * 0.62);
        hg.fill({ color: this.cSheen, alpha: alpha * upK * 0.18 });
      }
    }

    // ---------- Near arms ----------
    {
      const ag = pick("nearArms");
      for (let i = 0; i < LIMBS; i++) {
        if (i % 2 === 0) continue;
        this.limb(ag, i, look, flare, sq, ml, mw, grip, S, this.cArm, alpha);
      }
    }

    // ---------- Rim light ----------
    // A bright thread along the upper mantle edge to lift the silhouette off
    // the dark; it follows the screen-up flank, so it stays put through a turn.
    if (fine > 0.03 && upK > 0.05) {
      const rg = pick("rim");
      const RS = 12;
      let b = 0;
      for (let s = 0; s <= RS; s++) {
        const u = 0.03 + (s / RS) * 0.9;
        this.proj(u * ml, up * mantleHalf(u, mw) * 0.97, this.band[b++]);
      }
      drawRibbon(rg, this.band, b);
      rg.stroke({
        width: Math.max(0.8, 1.3 * k),
        color: this.cRim,
        alpha: alpha * 0.38 * fine * upK,
      });
    }

    // ---------- Eye ----------
    // On the up-screen flank of the head, sliding to the centre line as the
    // squid points straight up or down; it flares an amber ring with arousal.
    {
      const eg = pick("eye");
      eyeLocal(look, ca, this.w0);
      this.proj(this.w0.x, this.w0.y, this.w1);
      const er = eyeRadius(look) * k;
      eg.circle(this.w1.x, this.w1.y, er);
      eg.fill({ color: this.cEye, alpha: alpha * 0.95 });
      if (fine > 0.1) {
        eg.circle(this.w1.x - er * 0.3, this.w1.y - er * 0.3, er * 0.3);
        eg.fill({ color: 0xcfe3ec, alpha: alpha * fine * 0.55 });
      }
      if (arousal > 0.15) {
        eg.circle(this.w1.x, this.w1.y, er);
        eg.stroke({
          width: Math.max(0.8, 1.4 * k),
          color: mixColor(0xd9603f, 0xffd27a, arousal),
          alpha: alpha * 0.5 * arousal,
        });
      }
    }
  }
}
