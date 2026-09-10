/**
 * Humboldt-style pack squid — the deep-water harasser. Spawned procedurally by
 * `SquidSystem` from seed-derived lairs, steered by `systems/squid/SquidBrain`,
 * drawn by `render/SquidRenderer`. A plain data class like every `state/*`
 * store; all behaviour lives in the system/brain.
 *
 * Threat model: non-lethal. A latched squid drains the whale's reserves and
 * drags on it until the player shakes it (tail-kick / speed / surface) or the
 * pod mobs it off.
 */
import type { Vec2 } from "../core/math";

export type SquidState =
  /** hovering near its lair, unbothered */
  | "lurk"
  /** has noticed the whale, closing from its blind spot */
  | "stalk"
  /** committed jet-dash at the whale */
  | "strike"
  /** attached to the whale, draining it */
  | "latched"
  /** breaking off and jetting for the dark */
  | "flee"
  /** back at the lair, arousal bleeding off before it can hunt again */
  | "recover";

export interface Squid {
  x: number;
  y: number;
  vx: number;
  vy: number;

  /** eased heading (rad) — the view points the mantle along this, not `atan2(v)` */
  heading: number;
  /** mantle jet-pulse phase, advanced with thrust */
  jet: number;
  /** 0..1 arm spread: 0 streamlined for jetting, 1 flared to grasp */
  flare: number;

  state: SquidState;
  /** seconds in the current state (drives state-local timeouts) */
  age: number;
  /** 0..1 alarm: pulses the photophores, pales the skin, sharpens the turns */
  arousal: number;
  /** while latched: accumulated struggle; detaches at STRUGGLE_BREAK */
  struggle: number;
  /** attach point in the whale's local frame (along, across), set on grab */
  grip: Vec2;

  /** individual size ~0.8..1.3 and a per-squid phase for desync */
  size: number;
  ph: number;

  /** the lair it returns to, and a stable id so a lair spawns at most one */
  lair: number;
  homeX: number;
  homeY: number;
  /** seconds before it will hunt again (ticks in lurk/recover) */
  cool: number;
}

export class SquidStore {
  readonly squids: Squid[] = [];

  /** the currently latched squid, or null — cached each frame by SquidSystem */
  latched: Squid | null = null;
}
