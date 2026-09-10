/**
 * The squid state machine + steering. One `intent()` per squid per frame:
 * advances its FSM (lurk → stalk → strike → latched → flee → recover) and
 * returns a desired velocity plus a one-shot `fire` the system broadcasts and
 * scores. Movement decisions only — `SquidSystem` owns the whale-coupling
 * (reserve drain, grip, struggle accrual) and the pool.
 *
 * The "smart" part is the stalk: it doesn't beeline the whale, it slides into
 * the blind spot behind the fluke, leads the target by relative velocity, keeps
 * out of lit water and away from ship noise, and only commits to a strike when
 * it is close, lined up, and worked up enough.
 */
import { DARK_START } from "../../config/constants";
import * as K from "../../config/squid";
import type { GameContext } from "../../core/GameContext";
import { clamp, clamp01 } from "../../core/math";
import type { Squid } from "../../state/Squid";

export type SquidFire =
  | null
  | "grab"
  | "released" // let go on its own (latch timed out)
  | "broke" // thrown off by struggle / the pod
  | { evaded: number }; // a strike whiffed; 0..1 how close it came

export interface SquidOut {
  /** desired velocity this frame */
  dvx: number;
  dvy: number;
  /** turn-rate limit for the integrator (rad/s) */
  turnRate: number;
  /** target arm spread 0..1 (eased by the system) */
  flare: number;
  fire: SquidFire;
}

const dist = (dx: number, dy: number): number => Math.sqrt(dx * dx + dy * dy);

export class SquidBrain {
  private readonly out: SquidOut = {
    dvx: 0,
    dvy: 0,
    turnRate: K.TURN_RATE,
    flare: 0.15,
    fire: null,
  };

  /** closest the current strike dash has come to the whale centre */
  private strikeMin = Infinity;

  intent(sq: Squid, ctx: GameContext, dt: number): SquidOut {
    const o = this.out;
    o.dvx = 0;
    o.dvy = 0;
    o.turnRate = sq.arousal > 0.3 ? K.TURN_RATE_HUNT : K.TURN_RATE;
    o.flare = 0.15;
    o.fire = null;

    const wb = ctx.whale.body;
    const wdx = wb.x - sq.x;
    const wdy = wb.y - sq.y;
    const d = dist(wdx, wdy) || 1;

    sq.age += dt;
    if (sq.cool > 0) sq.cool -= dt;

    switch (sq.state) {
      case "lurk":
      case "recover":
        this.lurk(sq, ctx, d, dt);
        break;
      case "stalk":
        this.stalk(sq, ctx, wdx, d, dt);
        break;
      case "strike":
        this.strike(sq, ctx, d);
        break;
      case "latched":
        this.latched(sq, ctx);
        break;
      case "flee":
        this.flee(sq, wdx, wdy, d, dt);
        break;
    }

    // dark-water preference: everything except a committed strike shies from light
    if (sq.state !== "strike" && sq.state !== "latched" && sq.y < DARK_START) {
      o.dvy += (DARK_START - sq.y) * 1.4;
    }
    // keep clear of ship hulls (surface noise the squid hates)
    if (sq.state !== "latched") {
      for (const s of ctx.ships.ships) {
        const sd = sq.x - s.x;
        if (sd > -1600 && sd < 1600 && sq.y < 1400) {
          const p = 1 - Math.abs(sd) / 1600;
          o.dvx += (sd >= 0 ? 1 : -1) * p * 260;
          o.dvy += p * 300;
        }
      }
    }

    return o;
  }

  // ── states ───────────────────────────────────────────────────────────────

  private lurk(sq: Squid, ctx: GameContext, d: number, dt: number): void {
    const o = this.out;
    const t = ctx.clock.t;
    sq.arousal = Math.max(0, sq.arousal - dt * 0.5);
    o.flare = 0.18;

    // drift a slow figure around the lair
    const tx = sq.homeX + Math.sin(t * 0.27 + sq.ph) * 460;
    const ty = sq.homeY + Math.sin(t * 0.19 + sq.ph * 1.7) * 200;
    o.dvx = clamp((tx - sq.x) * 1.4, -K.LURK_SPEED, K.LURK_SPEED);
    o.dvy = clamp((ty - sq.y) * 1.4, -K.LURK_SPEED, K.LURK_SPEED);

    if (sq.state === "recover" && sq.age > 3.5 && sq.arousal < 0.15) {
      sq.state = "lurk";
      sq.age = 0;
    }
    if (sq.state !== "lurk") return;

    // wake up: whale close, deep, and we're off cooldown
    const wb = ctx.whale.body;
    const showoff = ctx.score.comboStep >= K.SHOWOFF_STEP;
    const senseRange = K.SENSE_RANGE * (showoff ? 1.35 : 1);
    if (
      sq.cool <= 0 &&
      d < senseRange &&
      wb.y > K.HUNT_MIN_Y &&
      ctx.whale.alive &&
      !ctx.whale.done
    ) {
      sq.state = "stalk";
      sq.age = 0;
      sq.arousal = 0.35;
    }
  }

  private stalk(
    sq: Squid,
    ctx: GameContext,
    wdx: number,
    d: number,
    dt: number,
  ): void {
    const o = this.out;
    const wb = ctx.whale.body;
    const showoff = ctx.score.comboStep >= K.SHOWOFF_STEP;
    sq.arousal = Math.min(1, sq.arousal + dt * (showoff ? 0.85 : 0.5));
    o.flare = 0.1; // streamlined, sneaking

    // give up: whale bolted, climbed to the light, or the stalk has dragged on
    if (
      d > K.LOSE_RANGE ||
      wb.y < K.HUNT_MIN_Y - 350 ||
      sq.age > K.STALK_TIMEOUT ||
      !ctx.whale.alive
    ) {
      sq.state = "flee";
      sq.age = 0;
      return;
    }

    // aim for the blind spot: behind the fluke and a little below, led by the
    // whale's own velocity so we arrive where it's going, not where it was
    const fx = wb.facing;
    const lead = Math.min(1.4, d / K.STALK_SPEED);
    const tx = wb.x - fx * 340 + wb.vx * lead * 0.6;
    const ty = wb.y + 150 + wb.vy * lead * 0.6;

    const tdx = tx - sq.x;
    const tdy = ty - sq.y;
    const td = dist(tdx, tdy) || 1;
    // ease off as we settle into the pocket so we shadow rather than collide
    const sp = K.STALK_SPEED * clamp(td / 550, 0.14, 1);
    o.dvx = (tdx / td) * sp + wb.vx * 0.25;
    o.dvy = (tdy / td) * sp + wb.vy * 0.25;

    // commit: close, worked up, and actually behind the whale
    const behind = (-fx * wdx) / d > -0.15; // squid is at/behind the flank
    if (d < K.STRIKE_RANGE && behind && sq.arousal > 0.6) {
      sq.state = "strike";
      sq.age = 0;
      this.strikeMin = d;
    }
  }

  private strike(sq: Squid, ctx: GameContext, d: number): void {
    const o = this.out;
    const wb = ctx.whale.body;
    sq.arousal = 1;
    // arms open through the dash
    o.flare = clamp01(sq.age / 0.35);
    o.turnRate = K.TURN_RATE_HUNT;
    this.strikeMin = Math.min(this.strikeMin, d);

    // short-lead dash at the whale
    const lead = Math.min(0.5, d / K.STRIKE_SPEED);
    const tx = wb.x + wb.vx * lead;
    const ty = wb.y + wb.vy * lead;
    const tdx = tx - sq.x;
    const tdy = ty - sq.y;
    const td = dist(tdx, tdy) || 1;
    o.dvx = (tdx / td) * K.STRIKE_SPEED;
    o.dvy = (tdy / td) * K.STRIKE_SPEED;

    // connect
    if (d < K.GRAB_DIST) {
      sq.state = "latched";
      sq.age = 0;
      sq.struggle = 0;
      // remember where on the whale we caught, in its local frame
      const fx = wb.facing;
      sq.grip.x = (sq.x - wb.x) * fx; // along the body
      sq.grip.y = sq.y - wb.y; // across it
      o.fire = "grab";
      return;
    }

    // whiff: dash spent, or we've sailed past and are opening the gap
    const past = sq.age > 0.32 && d > this.strikeMin + 60;
    if (sq.age > 0.9 || past) {
      sq.state = "flee";
      sq.age = 0;
      sq.cool = K.COOLDOWN;
      o.fire = { evaded: clamp01(1 - this.strikeMin / K.STRIKE_RANGE) };
    }
  }

  private latched(sq: Squid, ctx: GameContext): void {
    const o = this.out;
    const wb = ctx.whale.body;
    sq.arousal = 1;
    o.flare = 1;
    o.turnRate = 12;

    // stick to the grip point, tracking the whale's motion
    const fx = wb.facing;
    const gx = wb.x + sq.grip.x * fx;
    const gy = wb.y + sq.grip.y;
    o.dvx = wb.vx + (gx - sq.x) * 9;
    o.dvy = wb.vy + (gy - sq.y) * 9;

    // thrown off, or lets go on its own
    if (sq.struggle >= K.STRUGGLE_BREAK) {
      sq.state = "flee";
      sq.age = 0;
      sq.cool = K.COOLDOWN;
      o.fire = "broke";
    } else if (sq.age >= K.LATCH_MAX) {
      sq.state = "flee";
      sq.age = 0;
      sq.cool = K.COOLDOWN;
      o.fire = "released";
    }
  }

  private flee(
    sq: Squid,
    wdx: number,
    wdy: number,
    d: number,
    dt: number,
  ): void {
    const o = this.out;
    sq.arousal = Math.max(0, sq.arousal - dt * 0.7);
    o.flare = 0.05; // streamlined jetting

    // away from the whale, downward, and back toward the lair
    o.dvx = (-wdx / d) * K.FLEE_SPEED * 0.7 + (sq.homeX - sq.x) * 0.35;
    o.dvy = (-wdy / d) * K.FLEE_SPEED * 0.4 + 220;
    const sp = dist(o.dvx, o.dvy) || 1;
    o.dvx = (o.dvx / sp) * K.FLEE_SPEED;
    o.dvy = (o.dvy / sp) * K.FLEE_SPEED;

    const home = Math.abs(sq.x - sq.homeX) < 900 && sq.y > K.LAIR_Y[0] - 400;
    if (d > K.LOSE_RANGE || home || sq.age > 6) {
      sq.state = "recover";
      sq.age = 0;
    }
  }
}
