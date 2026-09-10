/** Wild / answering / following whales. Populated by `WorldSpawner`. */
import { WhaleBody } from "./WhaleBody";

export type PodState = "wild" | "answered" | "following" | "lost";

export interface PodWhale {
  /** movement + pose state, stepped by the shared locomotion/pose code */
  body: WhaleBody;

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
  /** lungs, 0..100 — depletes at depth, refills at the surface (same as the
   * player). A wild whale climbs to breathe when this runs low. */
  breath: number;
  /** true while a wild/lost whale is on a breath run up to the surface */
  surfacing: boolean;
  /** the depth it meanders around between breaths */
  cruiseY: number;
  nextSong: number;
  ph: number;
  size: number;
  /** 0..1 maturity: 0 a newborn calf, 1 a full-grown adult */
  age: number;
}

/** Reference body length: the player whale, in world units. */
const ADULT_LEN = 280;

/** Body length (world units) from maturity + individual size. A calf comes out
 * around 55% of an adult. */
export function bodyLenFor(size: number, age: number): number {
  return ADULT_LEN * size * (0.5 + 0.5 * age);
}

/** Body half-width (girth) for `WhaleView`. Calves carry a higher
 * girth-to-length ratio, so they read as stubby rather than as a small adult. */
export function podGirth(w: PodWhale): number {
  const juv = 1 - w.age;
  const wobble = 1 + Math.sin((w.ph || 0) * 1.7) * 0.05;
  return 30 * (1 + 0.34 * juv) * wobble;
}

/** options for `makePodWhale`; movement fields go to the `WhaleBody`. */
export interface PodWhaleInit {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  state?: PodState;
  lit?: number;
  replyAt?: number;
  cool?: number;
  heard?: boolean;
  answeredUntil?: number;
  slot?: number;
  stress?: number;
  hunger?: number;
  breath?: number;
  surfacing?: boolean;
  cruiseY?: number;
  nextSong?: number;
  ph?: number;
  size?: number;
  age?: number;
}

export function makePodWhale(o: PodWhaleInit): PodWhale {
  const size = o.size ?? 1;
  const age = o.age ?? 1;
  return {
    body: new WhaleBody(o.x, o.y, bodyLenFor(size, age), o.vx ?? 0, o.vy ?? 0),
    state: o.state ?? "wild",
    lit: o.lit ?? 0,
    replyAt: o.replyAt ?? 0,
    cool: o.cool ?? 0,
    heard: o.heard ?? false,
    answeredUntil: o.answeredUntil ?? 0,
    slot: o.slot ?? -1,
    stress: o.stress ?? 0,
    hunger: o.hunger ?? 0,
    breath: o.breath ?? 100,
    surfacing: o.surfacing ?? false,
    cruiseY: o.cruiseY ?? o.y,
    nextSong: o.nextSong ?? 0,
    ph: o.ph ?? 0,
    size,
    age,
  };
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
