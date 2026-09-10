/**
 * Deep-water squid — a rare, calm atmospheric threat. Placed by the level's
 * `squid` spawn directive (`world/level/emitters.ts`), steered by
 * `systems/squid/SquidBrain`, drawn by `render/SquidRenderer`, stepped by
 * `systems/SquidSystem`. A plain data class; all behaviour lives in the
 * system/brain.
 *
 * It lurks where it's placed, takes an interest only if the whale lingers deep
 * and close, gives one slow telegraphed lunge, and is easily seen off (song,
 * speed, light, the pod). Non-lethal: a latched squid drains a little and drags
 * briefly, then lets go.
 */
import type { Vec2 } from "../core/math";

export type SquidState =
  /** hovering near its lair, unbothered */
  | "lurk"
  /** has noticed the whale, shadowing it from the blind spot */
  | "stalk"
  /** committed lunge */
  | "strike"
  /** attached to the whale */
  | "latched"
  /** breaking off and jetting for the dark */
  | "flee"
  /** back at the lair, settling — won't hunt again (long cooldown) */
  | "recover";

export interface Squid {
  x: number;
  y: number;
  vx: number;
  vy: number;

  /** eased heading (rad) — the view points the mantle along this */
  heading: number;
  /** mantle jet-pulse phase, advanced with thrust */
  jet: number;
  /** 0..1 arm spread: 0 streamlined for jetting, 1 flared to grasp */
  flare: number;

  state: SquidState;
  /** seconds in the current state */
  age: number;
  /** seconds the whale has been inside `STRIKE_RANGE` this stalk */
  linger: number;
  /** 0..1 alarm: pulses the photophores, pales the skin, sharpens the turns */
  arousal: number;
  /** while latched: accumulated struggle; detaches at STRUGGLE_BREAK */
  struggle: number;
  /** attach point in the whale's local frame (along, across), set on grab */
  grip: Vec2;

  /** individual size ~0.85..1.2 and a per-squid phase for desync */
  size: number;
  ph: number;

  /** the lair it returns to */
  homeX: number;
  homeY: number;
  /** seconds before it will hunt again; set huge after one attempt */
  cool: number;
}

export interface SquidInit {
  x: number;
  y: number;
  size?: number;
  ph?: number;
}

export function makeSquid(o: SquidInit): Squid {
  return {
    x: o.x,
    y: o.y,
    vx: 0,
    vy: 0,
    heading: Math.PI,
    jet: (o.ph ?? 0) * 3,
    flare: 0.18,
    state: "lurk",
    age: 0,
    linger: 0,
    arousal: 0,
    struggle: 0,
    grip: { x: 0, y: 0 },
    size: o.size ?? 1,
    ph: o.ph ?? 0,
    homeX: o.x,
    homeY: o.y,
    cool: 0,
  };
}

export class SquidStore {
  readonly squids: Squid[] = [];

  /** the currently latched squid, or null — cached each frame by SquidSystem */
  latched: Squid | null = null;

  /** reset every squid to a dormant lurk at its lair (used on load) */
  rest(): void {
    this.latched = null;
    for (const s of this.squids) {
      s.x = s.homeX;
      s.y = s.homeY;
      s.vx = s.vy = 0;
      s.state = "lurk";
      s.age = s.linger = s.arousal = s.struggle = s.cool = 0;
      s.flare = 0.18;
    }
  }
}
