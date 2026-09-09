/** The player whale: rigid state, plus its spine chains and wake trail. */
import type { Vec2 } from "../core/math";
import { makeChain } from "../core/SpineChain";
import { Trail } from "./Trail";

export class PlayerWhale {
  x = 700;
  y = 700;
  vx = 90;
  vy = 0;
  readonly len = 280;
  facing = 1;
  wag = 0;
  /** 0..1 surge momentum, written by WhaleMovementSystem */
  surge = 0;

  /** breach barrel roll (rotation about the long/nose-tail axis, faked in the
   * side view): `spin` is the accumulated roll angle in radians, `spinVel` its
   * speed, `spinBlend` 0..1 how strongly the roll distortion is applied. All 0
   * unless mid-breach. */
  spin = 0;
  spinVel = 0;
  spinBlend = 0;
  strokeAmp = 0;
  breath = 100;
  energy = 100;
  drowning = 0;
  alive = true;
  done = false;

  /** rigid backbone and its undulating display copy */
  readonly spineBase: Vec2[] = makeChain(this.x, this.y);
  readonly spine: Vec2[] = makeChain(this.x, this.y);
  readonly trail = new Trail(this.x, this.y);

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }
}
