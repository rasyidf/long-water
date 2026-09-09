/**
 * The movement + pose state shared by every whale — the player and each pod
 * whale own one. Domain state (breath/energy for the player, the social state
 * machine for pods) stays on the outer object.
 *
 * Written only by the shared locomotion / pose code in `systems/whale/`.
 * `state/*` classes hold no behaviour, so the stepping lives in the systems.
 */
import type { Vec2 } from "../core/math";
import { SPINE_JOINTS, makeChain } from "../core/SpineChain";

export class WhaleBody {
  x: number;
  y: number;
  vx: number;
  vy: number;

  /** eased heading, ±1 */
  facing = 1;
  /** swim-wave phase accumulator, advanced with speed */
  wag = 0;
  /** smoothed tail-beat amplitude (eased toward `strokeAmpFor(speed)`) */
  strokeAmp = 3;

  /** breach barrel roll about the long axis, faked in the side view:
   * `roll` accumulated angle (rad), `rollVel` its speed, `rollBlend` 0..1 how
   * strongly the roll distortion is applied. All 0 unless mid-breach. */
  roll = 0;
  rollVel = 0;
  rollBlend = 0;

  /** nose→tail body length in world units */
  readonly len: number;
  /** rigid backbone (chased to the head) and its undulating display copy */
  readonly spineBase: Vec2[];
  readonly spine: Vec2[];

  constructor(x: number, y: number, len: number, vx = 0, vy = 0) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.len = len;
    this.spineBase = makeChain(x, y);
    this.spine = makeChain(x, y);
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  /** collapse both chains to a straight stub at the current head — used on load */
  resetChains(): void {
    const straight = makeChain(this.x, this.y);
    for (let i = 0; i < SPINE_JOINTS; i++) {
      this.spineBase[i].x = straight[i].x;
      this.spineBase[i].y = straight[i].y;
      this.spine[i].x = straight[i].x;
      this.spine[i].y = straight[i].y;
    }
  }
}

/** the fields Snapshot persists / restores for a whale body */
export interface WhaleBodySave {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  wag: number;
}

export function saveBody(b: WhaleBody): WhaleBodySave {
  return { x: b.x, y: b.y, vx: b.vx, vy: b.vy, facing: b.facing, wag: b.wag };
}
