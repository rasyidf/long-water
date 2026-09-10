/** The player whale: its shared movement `body`, wake trail, and the resource
 * state (breath/energy) that the vitals/feeding systems own. */
import type { Vec2 } from "../core/math";
import { Trail } from "./Trail";
import { WhaleBody } from "./WhaleBody";

export class PlayerWhale {
  /** movement + pose state, stepped by the shared locomotion/pose code */
  readonly body = new WhaleBody(700, 700, 280, 90, 0);
  /** the swum path — pod whales steer off points sampled from it */
  readonly trail = new Trail(700, 700);

  /** 0..1 surge momentum, written by the player brain */
  surge = 0;
  /** 0..1 grapple: a latched squid drags on the whale and steals its thrust.
   * Written by `SquidSystem`, read by `PlayerBrain`. */
  grip = 0;
  breath = 100;
  energy = 100;
  drowning = 0;
  alive = true;
  done = false;

  /** read-only facades so non-movement systems keep reading `whale.x` etc. */
  get x(): number {
    return this.body.x;
  }
  get y(): number {
    return this.body.y;
  }
  get vx(): number {
    return this.body.vx;
  }
  get vy(): number {
    return this.body.vy;
  }
  get facing(): number {
    return this.body.facing;
  }
  get speed(): number {
    return this.body.speed;
  }
  get spine(): Vec2[] {
    return this.body.spine;
  }
}
