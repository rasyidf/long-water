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
  size: number;
  wag: number;
  /** rigid chain + display chain, created when it starts following */
  base: Vec2[] | null;
  spine: Vec2[] | null;
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
