/**
 * The cinematic camera model. `CameraSystem` feeds it events and steps it once
 * a frame; it writes the final `x / y / scale / shake / rot` onto the `Camera`.
 *
 * Three layers stack:
 *  - **always on** — a critically-damped follow spring with a velocity lead,
 *    a speed-aware zoom, a subtle bank into turns, trauma-based shake, and a
 *    handheld drift when the whale is nearly still.
 *  - **shots** — short event-driven framing changes (`breach`, `surface`,
 *    `splash`, `pod`, `intro`). One is engaged at a time via `hold`; when it
 *    lapses the targets relax back to neutral at the normal easing rate.
 *  - **impulses / slow-mo** — a decaying positional kick and a wall-clock
 *    slow-motion window, both punched in on the big beats (launch, splash-down).
 */
import type { GameContext } from "../../core/GameContext";
import { clamp, expApproach } from "../../core/math";
import { GRAVITY } from "../whale/locomotion";

type Shot = "none" | "intro" | "breach" | "surface" | "splash" | "pod";

const TUNE = {
  /** velocity → world-space lead, and its ceiling / easing */
  leadX: 0.5,
  leadY: 0.34,
  leadClampX: 950,
  leadClampY: 680,
  leadHz: 2.2,

  /** follow-spring response (per-axis), and the multiplier while a hard shot
   * is engaged so the whale stays framed through a flip */
  followHzX: 3.1,
  followHzY: 2.7,
  shotFollowBoost: 1.7,

  /** zoom = vw / (base + min(speedCap, speed * speedGain)) */
  zoomBase: 2200,
  zoomSpeedGain: 1.15,
  zoomSpeedCap: 760,
  zoomHz: 1.9,
  shotZoomHz: 6.5,
  introZoomHz: 1.2,

  /** framing-offset easing (offset is a fraction of the viewport) */
  offHz: 5,

  /** trauma → shake px, and trauma bleed-off per second */
  maxShake: 27,
  traumaDecay: 1.5,

  /** positional-kick decay */
  impulseHz: 7,

  /** heading-rate → bank angle */
  bankGain: 0.0085,
  maxBank: 0.02,
  bankHz: 3.5,
} as const;

export class CameraRig {
  private px = 0;
  private py = 0;
  private leadX = 0;
  private leadY = 0;
  private zoom = 1;

  private shot: Shot = "none";
  /** seconds the current shot stays engaged; ticks down in sim time */
  private hold = 0;
  private introT = 0;

  private zoomMulTarget = 1;
  private offXFrac = 0;
  private offYFrac = 0;
  private offXTarget = 0;
  private offYTarget = 0;

  private roll = 0;
  private rollShot = 0;
  private rollShotTarget = 0;
  private prevHeading = 0;

  private trauma = 0;
  private impX = 0;
  private impY = 0;

  private slowUntil = 0;
  private slowFloor = 1;

  /** snap every spring to the whale's current state (boot + `game:restart`) */
  reset(ctx: GameContext): void {
    const { whale, camera } = ctx;
    this.px = whale.x;
    this.py = whale.y;
    this.leadX = this.leadY = 0;
    this.zoom = camera.scale || 1;
    this.shot = "none";
    this.hold = 0;
    this.introT = 0;
    this.zoomMulTarget = 1;
    this.offXFrac = this.offYFrac = this.offXTarget = this.offYTarget = 0;
    this.roll = this.rollShot = this.rollShotTarget = 0;
    this.prevHeading = Math.atan2(whale.vy, whale.vx);
    this.trauma = this.impX = this.impY = 0;
    this.slowUntil = 0;
    this.slowFloor = 1;
    camera.rot = 0;
  }

  // --- events ---------------------------------------------------------------

  addTrauma(px: number): void {
    this.trauma = clamp(this.trauma + px / 32, 0, 1);
  }

  /** opening establishing move: hang a touch wide, then settle in */
  establish(): void {
    this.shot = "intro";
    this.introT = 1.7;
  }

  /** the whale somersaulted out of the water — pull wide, tilt into the spin,
   * and drop into brief slow motion for the airtime */
  breach(flips: number, up: number, now: number): void {
    const airT = clamp((2 * up) / GRAVITY, 0.35, 1.4);
    const big = flips >= 2;
    this.shot = "breach";
    this.hold = airT + 0.15;
    this.zoomMulTarget = big ? 0.6 : 0.72;
    this.offYTarget = -0.17; // drop the whale below centre, reveal the sky
    this.offXTarget = 0;
    this.rollShotTarget = big ? 0.024 : 0.017;
    this.impY = -Math.min(220, up * 0.05);
    this.slowUntil = now + Math.min(airT * 0.8, 0.75);
    this.slowFloor = big ? 0.45 : 0.62;
  }

  /** a plain surface-break (no flip): a small, quick pull-wide */
  surface(up: number): void {
    if (this.shot === "breach" && this.hold > 0) return;
    this.shot = "surface";
    this.hold = 0.45;
    this.zoomMulTarget = 0.9;
    this.offYTarget = -0.06;
    this.offXTarget = 0;
    this.impY = -Math.min(90, up * 0.03);
  }

  /** re-entry: punch back in and shove the frame down on the splash */
  splashDown(): void {
    const fromBreach = this.shot === "breach";
    this.shot = "splash";
    this.hold = 0.28;
    this.zoomMulTarget = fromBreach ? 1.06 : 1;
    this.offYTarget = 0.03;
    this.offXTarget = 0;
    this.rollShotTarget = -this.rollShot * 0.6;
    this.impY = fromBreach ? 150 : 90;
    this.trauma = clamp(this.trauma + (fromBreach ? 0.5 : 0.3), 0, 1);
  }

  /** a whale joined / the pod sang together — ease wide to take in the group */
  podMoment(): void {
    if (this.shot === "breach" || this.shot === "splash") return;
    this.shot = "pod";
    this.hold = Math.max(this.hold, 0.7);
    this.zoomMulTarget = 0.9;
  }

  // --- per-frame -----------------------------------------------------------

  step(dt: number, ctx: GameContext): void {
    const { whale, camera } = ctx;
    const now = ctx.clock.t;
    const vw = camera.vw;
    const vh = camera.vh;
    const sp = whale.speed;

    // slow-motion: wall-clock window, easing back to real time over the tail
    let ts = 1;
    if (now < this.slowUntil) {
      const ramp = clamp((this.slowUntil - now) / 0.25, 0, 1);
      ts = 1 - (1 - this.slowFloor) * ramp;
    }
    ctx.clock.timeScale = ts;

    // --- velocity lead, with a breach anticipation when rising near the top ---
    this.leadX = expApproach(
      this.leadX,
      clamp(whale.vx * TUNE.leadX, -TUNE.leadClampX, TUNE.leadClampX),
      TUNE.leadHz,
      dt,
    );
    let wantLeadY = clamp(
      whale.vy * TUNE.leadY,
      -TUNE.leadClampY,
      TUNE.leadClampY,
    );
    if (whale.y < 260 && whale.vy < -260) {
      wantLeadY -= Math.min(240, (-whale.vy - 260) * 0.4);
    }
    this.leadY = expApproach(this.leadY, wantLeadY, TUNE.leadHz, dt);

    // --- shot bookkeeping: tick the hold, relax to neutral when it lapses ---
    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0 && this.shot !== "intro") this.shot = "none";
    }
    if (this.hold <= 0) {
      this.zoomMulTarget = 1;
      this.offXTarget = 0;
      this.offYTarget = 0;
      this.rollShotTarget = 0;
    }

    // --- intro establishing shot: its own slow lift, independent of `hold` ---
    if (this.introT > 0) {
      this.introT -= dt;
      const k = clamp(this.introT / 1.7, 0, 1);
      this.zoomMulTarget = Math.min(this.zoomMulTarget, 1 - 0.16 * k * k);
      if (this.introT <= 0 && this.shot === "intro") this.shot = "none";
    }

    // --- ease the framing offset (fractions of the viewport) ---
    this.offXFrac = expApproach(this.offXFrac, this.offXTarget, TUNE.offHz, dt);
    this.offYFrac = expApproach(this.offYFrac, this.offYTarget, TUNE.offHz, dt);
    if (sp < 40 && this.shot === "none") {
      // handheld drift so a parked whale never sits dead-still in frame
      this.offXFrac += Math.sin(now * 0.31) * 0.004;
      this.offYFrac += Math.sin(now * 0.23 + 1.3) * 0.0035;
    }

    // --- bank into turns from the heading rate ---
    let bank = 0;
    if (sp > 60) {
      const h = Math.atan2(whale.vy, whale.vx);
      let dH = h - this.prevHeading;
      dH = ((dH + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.prevHeading = h;
      bank = clamp(
        (dH / Math.max(dt, 1 / 240)) * TUNE.bankGain,
        -TUNE.maxBank,
        TUNE.maxBank,
      );
    } else {
      this.prevHeading = Math.atan2(whale.vy, whale.vx);
    }
    this.roll = expApproach(this.roll, bank, TUNE.bankHz, dt);
    this.rollShot = expApproach(
      this.rollShot,
      this.rollShotTarget,
      TUNE.shotZoomHz,
      dt,
    );

    // --- decaying positional kick + trauma bleed ---
    this.impX = expApproach(this.impX, 0, TUNE.impulseHz, dt);
    this.impY = expApproach(this.impY, 0, TUNE.impulseHz, dt);
    this.trauma = Math.max(0, this.trauma - dt * TUNE.traumaDecay);

    // --- compose the transform ---
    const hardShot = this.shot === "breach" || this.shot === "splash";
    const boost = hardShot ? TUNE.shotFollowBoost : 1;
    this.px = expApproach(
      this.px,
      whale.x + this.leadX,
      TUNE.followHzX * boost,
      dt,
    );
    this.py = expApproach(
      this.py,
      whale.y + this.leadY,
      TUNE.followHzY * boost,
      dt,
    );

    const softShot = this.shot === "surface" || this.shot === "pod" || hardShot;
    const zHz = softShot
      ? TUNE.shotZoomHz
      : this.shot === "intro"
        ? TUNE.introZoomHz
        : TUNE.zoomHz;
    const baseZoom =
      vw /
      (TUNE.zoomBase + Math.min(TUNE.zoomSpeedCap, sp * TUNE.zoomSpeedGain));
    this.zoom = expApproach(this.zoom, baseZoom * this.zoomMulTarget, zHz, dt);

    camera.x = this.px + (this.offXFrac * vw) / this.zoom + this.impX;
    camera.y = this.py + (this.offYFrac * vh) / this.zoom + this.impY;
    camera.scale = this.zoom;
    camera.shake = TUNE.maxShake * this.trauma * this.trauma;
    camera.rot = this.roll + this.rollShot;
  }
}
