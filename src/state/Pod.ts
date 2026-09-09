/** Wild / answering / following whales. Populated by `WorldSpawner`. */
import type { Vec2 } from "../core/math";

export type PodState = "wild" | "answered" | "following" | "lost";

export interface PodWhale {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: PodState;
  /** 0..1 sonar-lit glow, decays */
  lit: number;
  /** time it will reply to a heard song, or <=0 for none */
  replyAt: number;
  /** earliest time it will answer again */
  cool: number;
  heard: boolean;
  answeredUntil: number;
  /** formation slot while following, else -1 */
  slot: number;
  stress: number;
  /** 0..1 appetite; a hungry follower diverts to nearby krill */
  hunger: number;
  nextSong: number;
  ph: number;
  /** individual size variance, ~1.0. Multiplies the age-derived body length. */
  size: number;
  /** maturity 0..1: 0 a newborn calf, 1 a full-grown adult. Drives body length
   * and proportions (calves are shorter, stubbier and bigger-headed). */
  age: number;
  wag: number;
  /** rigid chain + display chain, created when it starts following */
  base: Vec2[] | null;
  spine: Vec2[] | null;
}

/** Reference body length: the player whale, in world units. */
const ADULT_LEN = 280;

/** Body length (world units) of a pod whale, from its maturity and individual
 * size. A calf comes out around 55% of an adult; used for both the spine chain
 * in `PodSystem` and the drawn body in `WhaleRenderer` so they never disagree. */
export function podBodyLen(w: PodWhale): number {
  return ADULT_LEN * w.size * (0.5 + 0.5 * w.age);
}

/** Body half-width (girth) parameter for `WhaleView`. Calves carry a higher
 * girth-to-length ratio, so they read as stubby rather than as a small adult. */
export function podGirth(w: PodWhale): number {
  const juv = 1 - w.age;
  const wobble = 1 + Math.sin((w.ph || 0) * 1.7) * 0.05;
  return 30 * (1 + 0.34 * juv) * wobble;
}

export class Pod {
  readonly whales: PodWhale[] = [];

  add(w: PodWhale): void {
    this.whales.push(w);
  }

  followers(): PodWhale[] {
    return this.whales.filter((w) => w.state === "following");
  }
}
