/**
 * The squid state machine + steering. One `intent()` per squid per frame:
 * advances its FSM (lurk → stalk → strike → latched → flee → recover) and
 * returns a desired velocity plus a one-shot `fire` the system broadcasts and
 * scores. Movement only — `SquidSystem` owns the whale-coupling.
 *
 * Calm by design: it only wakes if the whale lingers deep and close, shadows
 * from the blind spot for several seconds, gives one slow lunge, and bolts if
 * the whale sings at it, climbs toward the light, or outruns it. After one
 * attempt it rests for the rest of the run.
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
  | { evaded: number }; // a lunge whiffed; 0..1 how close it came

export interface SquidOut {
  dvx: number;
  dvy: number;
  turnRate: number;
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

  /** closest the current lunge has come to the whale centre */
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
        this.lurk(sq, ctx, d);
        break;
      case "stalk":
        this.stalk(sq, ctx, d, dt);
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

    // shy from lit water (except mid-lunge / attached)
    if (sq.state !== "strike" && sq.state !== "latched" && sq.y < DARK_START) {
      o.dvy += (DARK_START - sq.y) * 1.4;
    }
    // keep clear of ship hulls
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

  private lurk(sq: Squid, ctx: GameContext, d: number): void {
    const o = this.out;
    const t = ctx.clock.t;
    sq.arousal = Math.max(0, sq.arousal - 0.5 * ctx.clock.dt);
    o.flare = 0.18;

    // a slow drift around the lair
    const tx = sq.homeX + Math.sin(t * 0.24 + sq.ph) * 380;
    const ty = sq.homeY + Math.sin(t * 0.17 + sq.ph * 1.7) * 170;
    o.dvx = clamp((tx - sq.x) * 1.4, -K.LURK_SPEED, K.LURK_SPEED);
    o.dvy = clamp((ty - sq.y) * 1.4, -K.LURK_SPEED, K.LURK_SPEED);

    if (sq.state === "recover") {
      // settle back home, then idle — the long cooldown keeps it dormant
      if (sq.age > 4 && sq.arousal < 0.12) {
        sq.state = "lurk";
        sq.age = 0;
      }
      return;
    }

    // wake up: whale deep, close, off cooldown, and actually alive
    const wb = ctx.whale.body;
    if (
      sq.cool <= 0 &&
      d < K.SENSE_RANGE &&
      wb.y > K.HUNT_MIN_Y &&
      ctx.whale.alive &&
      !ctx.whale.done
    ) {
      sq.state = "stalk";
      sq.age = 0;
      sq.linger = 0;
      sq.arousal = 0.3;
    }
  }

  private stalk(sq: Squid, ctx: GameContext, d: number, dt: number): void {
    const o = this.out;
    const wb = ctx.whale.body;
    sq.arousal = Math.min(1, sq.arousal + dt * K.AROUSAL_RATE);
    o.flare = 0.1; // streamlined, sneaking

    // spooked off by a song ring, the whale climbing to the light, distance,
    // or a stalk that has simply dragged on
    if (
      this.songNear(ctx, sq) ||
      d > K.LOSE_RANGE ||
      wb.y < K.HUNT_MIN_Y - 350 ||
      sq.age > K.STALK_TIMEOUT ||
      !ctx.whale.alive
    ) {
      sq.state = "flee";
      sq.age = 0;
      return;
    }

    // blind spot: behind the fluke, a little below, led by the whale's velocity
    const fx = wb.facing;
    const lead = Math.min(1.4, d / K.STALK_SPEED);
    const tx = wb.x - fx * 340 + wb.vx * lead * 0.6;
    const ty = wb.y + 150 + wb.vy * lead * 0.6;

    const tdx = tx - sq.x;
    const tdy = ty - sq.y;
    const td = dist(tdx, tdy) || 1;
    const sp = K.STALK_SPEED * clamp(td / 550, 0.14, 1);
    o.dvx = (tdx / td) * sp + wb.vx * 0.25;
    o.dvy = (tdy / td) * sp + wb.vy * 0.25;

    // time spent close and behind — the whale has to actually dawdle down here
    const ahead = ((sq.x - wb.x) * fx) / d; // >0 ahead of the whale, <0 behind
    if (d < K.STRIKE_RANGE && ahead < 0.3) sq.linger += dt;
    else sq.linger = Math.max(0, sq.linger - dt * 0.5);

    if (
      sq.linger > 2.5 &&
      sq.age > K.SHADOW_TIME &&
      sq.arousal > K.STRIKE_AROUSAL &&
      d < K.STRIKE_RANGE &&
      ahead < 0.3
    ) {
      sq.state = "strike";
      sq.age = 0;
      sq.linger = 0;
      this.strikeMin = d;
    }
  }

  private strike(sq: Squid, ctx: GameContext, d: number): void {
    const o = this.out;
    const wb = ctx.whale.body;
    sq.arousal = 1;
    o.flare = clamp01(sq.age / 0.35);
    o.turnRate = K.TURN_RATE_HUNT;
    this.strikeMin = Math.min(this.strikeMin, d);

    const lead = Math.min(0.5, d / K.STRIKE_SPEED);
    const tx = wb.x + wb.vx * lead;
    const ty = wb.y + wb.vy * lead;
    const tdx = tx - sq.x;
    const tdy = ty - sq.y;
    const td = dist(tdx, tdy) || 1;
    o.dvx = (tdx / td) * K.STRIKE_SPEED;
    o.dvy = (tdy / td) * K.STRIKE_SPEED;

    if (d < K.GRAB_DIST) {
      sq.state = "latched";
      sq.age = 0;
      sq.struggle = 0;
      const fx = wb.facing;
      sq.grip.x = (sq.x - wb.x) * fx;
      sq.grip.y = sq.y - wb.y;
      o.fire = "grab";
      return;
    }

    // whiff: dash spent, or sailed past and opening the gap
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

    const fx = wb.facing;
    const gx = wb.x + sq.grip.x * fx;
    const gy = wb.y + sq.grip.y;
    o.dvx = wb.vx + (gx - sq.x) * 9;
    o.dvy = wb.vy + (gy - sq.y) * 9;

    if (sq.struggle >= K.STRUGGLE_BREAK) {
      sq.state = "flee";
      sq.age = 0;
      sq.struggle = 0;
      sq.cool = K.COOLDOWN;
      o.fire = "broke";
    } else if (sq.age >= K.LATCH_MAX) {
      sq.state = "flee";
      sq.age = 0;
      sq.struggle = 0;
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

    o.dvx = (-wdx / d) * K.FLEE_SPEED * 0.7 + (sq.homeX - sq.x) * 0.35;
    o.dvy = (-wdy / d) * K.FLEE_SPEED * 0.4 + (sq.homeY - sq.y) * 0.3 + 160;
    const sp = dist(o.dvx, o.dvy) || 1;
    o.dvx = (o.dvx / sp) * K.FLEE_SPEED;
    o.dvy = (o.dvy / sp) * K.FLEE_SPEED;

    const home = dist(sq.x - sq.homeX, sq.y - sq.homeY) < 700;
    if (d > K.LOSE_RANGE || home || sq.age > 6) {
      sq.state = "recover";
      sq.age = 0;
    }
  }

  /** a friendly song ring washing over a stalking squid sends it running */
  private songNear(ctx: GameContext, sq: Squid): boolean {
    for (const p of ctx.song.pings) {
      if (!p.friendly || p.r >= p.maxR) continue;
      const dc = dist(p.x - sq.x, p.y - sq.y);
      // inside the expanding wavefront (with a margin), while the ring is live
      if (dc < p.r + K.SONG_SCARE_RANGE) return true;
    }
    return false;
  }
}
