/**
 * The shared whale pose step, run after a body has moved: (optionally) push the
 * wake trail, tail-chase the rigid backbone to the head, ease the tail-beat
 * amplitude toward the speed-driven target, and write the undulating display
 * copy. Was `SpineSystem` (player only); now every whale.
 */
import type { WhaleBody } from "../../state/WhaleBody";
import type { Trail } from "../../state/Trail";
import {
  applyUndulation,
  chaseChain,
  strokeAmpFor,
} from "../../core/SpineChain";

export function stepPose(b: WhaleBody, dt: number, trail?: Trail): void {
  if (trail) trail.push(b.x, b.y);
  chaseChain(b.spineBase, b.x, b.y, b.len);
  const target = strokeAmpFor(b.speed);
  b.strokeAmp += (target - b.strokeAmp) * Math.min(1, dt * 6);
  applyUndulation(b.spine, b.spineBase, b.wag * 2, b.strokeAmp);
}
