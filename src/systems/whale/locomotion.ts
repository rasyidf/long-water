/**
 * The shared whale physics step. Given a per-frame `Intent` (forces + impulses,
 * produced by a brain) and a `LocoCaps` (the per-agent capability/tuning set),
 * it integrates one `WhaleBody`: applied forces, ambient drift, buoyancy /
 * airborne gravity, drag, turn-rate limiting, speed cap, Euler integration,
 * surface-cross detection, the breach barrel roll, and terrain / ceiling /
 * world-edge clamps.
 *
 * Locomotion decides *nothing* — it only integrates. Brains decide.
 */
import type { WhaleBody } from "../../state/WhaleBody";
import type { PodWhale } from "../../state/Pod";
import type { Heightfield } from "../../world/Heightfield";
import type { Clock } from "../../core/Clock";
import { clamp01, clampTurn } from "../../core/math";
import { noise1 } from "../../core/rng";

/** downward acceleration on an airborne whale (u/s²) */
export const GRAVITY = 1400;

export interface Intent {
  /** summed steering / thrust force this frame (u/s², applied as `*dt`) */
  ax: number;
  ay: number;
  /** instantaneous velocity add this frame (tail-kick) */
  impulseX: number;
  impulseY: number;
  /** desired heading: -1 / +1, or 0 to derive it from horizontal velocity */
  faceDir: number;
  /** ease vertical velocity toward 0 (a fully idle whale levels out) */
  levelOut: boolean;
  /** 0..1, reduces drag (the player's surge charge); 0 for a pod */
  ease: number;
}

export interface LocoCaps {
  /** hard speed ceiling, or null to leave top speed to thrust-vs-drag */
  maxSpeed: number | null;
  /** turn-rate limit fed to `clampTurn` (rad/s) */
  turnRate: number;
  /** per-second drag: `v *= 1 - (drag - dragEase*ease)*dt` */
  drag: number;
  dragEase: number;
  /** near-surface orbital swell amplitude (0 disables) */
  ambientSwell: number;
  /** ambient noise-wander amplitude (0 disables) */
  ambientNoise: number;
  /** buoyancy pull toward `restY`, strong near the surface; null = none */
  buoyancy: { restY: number; range: number; k: number } | null;
  /** true = this whale falls when it leaves the water (and can breach) */
  airborne: boolean;
  canBreach: boolean;
  /** upward speed at the surface that triggers a breach roll */
  breachVy: number;
  /** collision: body stays `floorClear` above the seabed, never above `floorMinY` screen-down */
  floorClear: number;
  floorMinY: number;
  /** downward velocity is clamped to this on a floor hit (Infinity = untouched) */
  floorBounceVy: number;
  /** hard minimum depth (a pod can't breach); -Infinity for the player */
  ceilingY: number;
  /** left world edge; -Infinity to disable */
  worldMinX: number;
}

export interface LocoOut {
  /** >0 when the body broke the surface going up this frame (= upward speed) */
  crossedUp: number;
  /** true when the body re-entered the water this frame */
  crossedDown: boolean;
  hitFloor: boolean;
  /** >0 when a breach roll started this frame (number of turns) */
  breachTurns: number;
}

/** Advance / unwind the breach barrel roll. Returns turns if one just started. */
function advanceRoll(
  b: WhaleBody,
  crossedUp: number,
  breachVy: number,
  dt: number,
): number {
  let turns = 0;
  if (crossedUp > breachVy && b.rollVel === 0 && b.rollBlend < 0.01) {
    const airT = (2 * crossedUp) / GRAVITY;
    turns = Math.max(1, Math.min(3, Math.round((crossedUp - 250) / 300)));
    b.roll = 0;
    b.rollVel = (turns * Math.PI * 2) / airT; // + = belly toward camera first
  }
  if (b.y <= 0 && b.rollVel !== 0) {
    b.roll += b.rollVel * dt;
    b.rollBlend = Math.min(1, b.rollBlend + dt / 0.1);
  } else if (b.rollBlend > 0) {
    b.roll += b.rollVel * dt;
    b.rollVel *= Math.max(0, 1 - 6 * dt);
    b.rollBlend = Math.max(0, b.rollBlend - dt / 0.3);
    if (b.rollBlend === 0) {
      b.roll = 0;
      b.rollVel = 0;
    }
  }
  return turns;
}

export function stepLocomotion(
  b: WhaleBody,
  intent: Intent,
  caps: LocoCaps,
  world: Heightfield,
  clock: Clock,
  dt: number,
): LocoOut {
  const preVx = b.vx;
  const preVy = b.vy;

  b.vx += intent.impulseX;
  b.vy += intent.impulseY;
  b.vx += intent.ax * dt;
  b.vy += intent.ay * dt;

  const submerged = b.y > 0;

  if (submerged) {
    if (caps.ambientSwell > 0 || caps.ambientNoise > 0) {
      const swell = clamp01((900 - b.y) / 900);
      const sw = clock.t * 0.9 + b.x * 0.0012;
      b.vx += Math.sin(sw) * caps.ambientSwell * swell * dt;
      b.vy += Math.cos(sw * 1.15) * caps.ambientSwell * 0.7 * swell * dt;
      b.vx += noise1(b.x * 0.00007 + clock.t * 0.02) * caps.ambientNoise * dt;
      b.vy +=
        noise1(b.y * 0.0004 + 11.3 + clock.t * 0.03) *
        caps.ambientNoise *
        0.75 *
        dt;
    }
    if (caps.buoyancy) {
      const zone = clamp01((caps.buoyancy.range - b.y) / caps.buoyancy.range);
      b.vy += (caps.buoyancy.restY - b.y) * caps.buoyancy.k * zone * dt;
    }
    const d = 1 - (caps.drag - caps.dragEase * intent.ease) * dt;
    b.vx *= d;
    b.vy *= d;
    const t = clampTurn(preVx, preVy, b.vx, b.vy, caps.turnRate, dt);
    b.vx = t.x;
    b.vy = t.y;
    if (intent.levelOut) b.vy *= 1 - 0.8 * dt;
  } else if (caps.airborne) {
    const apex = Math.abs(b.vy) < 200 ? 0.75 : 1;
    b.vy += GRAVITY * apex * dt;
  }

  if (caps.maxSpeed != null) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > caps.maxSpeed) {
      b.vx = (b.vx / sp) * caps.maxSpeed;
      b.vy = (b.vy / sp) * caps.maxSpeed;
    }
  }

  const wasUnder = b.y > 0;
  b.x += b.vx * dt;
  b.y += b.vy * dt;

  const out: LocoOut = {
    crossedUp: 0,
    crossedDown: false,
    hitFloor: false,
    breachTurns: 0,
  };
  if (wasUnder && b.y <= 0) out.crossedUp = -b.vy; // vy is negative going up
  if (!wasUnder && b.y > 0) out.crossedDown = true;

  if (caps.canBreach) {
    out.breachTurns = advanceRoll(b, out.crossedUp, caps.breachVy, dt);
  }

  const fy = world.floorAt(b.x);
  const floorY = Math.max(caps.floorMinY, fy - caps.floorClear);
  if (b.y > floorY) {
    b.y = floorY;
    if (Number.isFinite(caps.floorBounceVy)) {
      b.vy = Math.min(b.vy, caps.floorBounceVy);
    }
    out.hitFloor = true;
  }
  if (b.y < caps.ceilingY) {
    b.y = caps.ceilingY;
    if (b.vy < 0) b.vy = 0;
  }
  if (b.x < caps.worldMinX) {
    b.x = caps.worldMinX;
    b.vx = Math.abs(b.vx);
  }

  const want =
    intent.faceDir !== 0
      ? intent.faceDir
      : Math.abs(b.vx) > 25
        ? Math.sign(b.vx)
        : 0;
  if (want !== 0) b.facing += (want - b.facing) * Math.min(1, dt * 3);

  b.wag += dt * (1.6 + Math.min(b.speed, 500) / 140);

  return out;
}

/** the player: uncapped top speed, real drag, buoyancy, breaches. */
export const PLAYER_CAPS: LocoCaps = {
  maxSpeed: null,
  turnRate: 2.4,
  drag: 1.15,
  dragEase: 0.35,
  ambientSwell: 34,
  ambientNoise: 24,
  buoyancy: { restY: 70, range: 450, k: 0.9 },
  airborne: true,
  canBreach: true,
  breachVy: 470,
  floorClear: 60,
  floorMinY: -Infinity,
  floorBounceVy: -20,
  ceilingY: -Infinity,
  worldMinX: 100,
};

/**
 * A pod whale. The brain approaches a *desired velocity* (so drag is 0 — the
 * approach force plus turn-rate limiting shape the motion). Followers get a
 * gentle buoyancy and, because the hard "never breach" ceiling is lifted, the
 * same airborne roll the player has (a brain has to actually launch them for it
 * to fire). Wild / answered whales keep their calmer depth band and stay under.
 */
export function podCaps(w: PodWhale): LocoCaps {
  const following = w.state === "following";
  return {
    maxSpeed: following ? 560 : w.state === "answered" ? 150 : 560,
    turnRate: 3.0,
    drag: 0,
    dragEase: 0,
    ambientSwell: 0,
    ambientNoise: 0,
    buoyancy: following ? { restY: 220, range: 650, k: 0.12 } : null,
    airborne: following,
    canBreach: following,
    breachVy: 470,
    floorClear: following ? 90 : 260,
    floorMinY: following ? 60 : -Infinity,
    floorBounceVy: Infinity,
    ceilingY: following ? -Infinity : 220,
    worldMinX: -Infinity,
  };
}
