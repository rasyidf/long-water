/**
 * Drives every whale's movement and pose from one place: the player and each
 * pod whale run the same pipeline —
 *
 *   brain.intent(...)  →  stepLocomotion(body, intent, caps)  →  stepPose(body)
 *
 * The player brain reads input + abilities; the pod brain runs the social
 * state machine's steering. Locomotion integrates; pose advances the backbone.
 * Replaces `WhaleMovementSystem` + `SpineSystem` and the motion half of the old
 * `PodSystem`.
 *
 * Also owns three telemetry checks that ride along with the player's
 * locomotion output: apex-stall / tail-slap trick detection, seabed scrapes,
 * and pod-drafting (sustained close escort).
 *
 * `simulate: false` (the preview gallery) skips brains + physics and only poses
 * the bodies in place.
 */
import * as SQUID from "../config/squid";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import {
  PLAYER_CAPS,
  podCaps,
  stepLocomotion,
  type LocoOut,
} from "./whale/locomotion";
import { stepPose } from "./whale/pose";
import { PlayerBrain } from "./whale/PlayerBrain";
import { PodBrain } from "./whale/PodBrain";

/** min crew within `DRAFT_RANGE` of the player to count as drafting */
const DRAFT_COMPANIONS = 3;
/** distance (u) to a following whale that counts as riding its slipstream */
const DRAFT_RANGE = 260;
/** seconds of sustained drafting between `pod:drafting` awards */
const DRAFT_TICK = 3;
/** min seconds between scrape awards, so dragging along the floor doesn't spam */
const SCRAPE_COOLDOWN = 2;
/** min speed to count a floor hit as a scrape rather than resting on the bottom */
const SCRAPE_SPEED = 80;
/** exit speed a breach needs to be able to shake a latched squid loose */
const LOCK_BREAK_VY = 250;

export class WhaleSystem implements System {
  readonly name = "whale";

  private readonly playerBrain = new PlayerBrain();
  private readonly podBrain = new PodBrain();

  /** `clock.t` the player last cleared the surface going up, or -1 when in the
   *  water; `airTurns` the breach roll count for that hop (0 = a plain hop) */
  private airAt = -1;
  private airTurns = 0;
  /** true if the player's speed bled to near-zero while still airborne */
  private apexStalled = false;

  private lastScrapeAt = -Infinity;
  private draftTime = 0;

  constructor(private readonly simulate = true) {}

  update(dt: number, ctx: GameContext): void {
    const { whale, pod } = ctx;

    if (!this.simulate) {
      stepPose(whale.body, dt, whale.trail);
    } else if (whale.alive && !whale.done) {
      const intent = this.playerBrain.intent(ctx, dt);
      const out = stepLocomotion(
        whale.body,
        intent,
        PLAYER_CAPS,
        ctx.world,
        ctx.clock,
        dt,
      );

      // apex stall: speed bottoms out while still in the air
      if (
        this.airAt >= 0 &&
        Math.abs(whale.body.vy) < 15 &&
        whale.body.speed < 40
      ) {
        this.apexStalled = true;
      }

      this.checkScrape(ctx, out, whale.body.x, whale.body.speed);
      this.emitSurface(ctx, out, whale.body.x);
      stepPose(whale.body, dt, whale.trail);
      this.checkDrafting(ctx, dt);
    }

    // compact follower slots before anyone steers off them
    const crew = pod.whales.filter((w) => w.state === "following");
    crew.sort((a, b) => a.slot - b.slot);
    crew.forEach((w, i) => (w.slot = i));

    for (const w of pod.whales) {
      if (this.simulate) {
        const intent = this.podBrain.intent(w, ctx, crew, dt);
        const out = stepLocomotion(
          w.body,
          intent,
          podCaps(w),
          ctx.world,
          ctx.clock,
          dt,
        );
        this.emitPodSurface(ctx, out, w.body.x);
      } else {
        w.body.wag += dt * 1.6; // idle breathe so gallery bodies still undulate
      }
      stepPose(w.body, dt);
    }
  }

  /** a pod whale's own breach — visible/audible, but no score or camera shot;
   *  those are reserved for the player's tricks */
  private emitPodSurface(ctx: GameContext, out: LocoOut, x: number): void {
    if (!out.crossedUp && !out.crossedDown) return;
    if (Math.abs(x - ctx.camera.x) > 4000) return; // off-screen, skip the fx

    const { bus } = ctx;
    if (out.crossedUp > 140) {
      bus.emit("fx:bubbles", {
        x,
        y: 0,
        count: 26,
        splash: true,
        spread: 130,
        power: 0.35,
      });
      bus.emit("audio:call", { f0: 260, f1: 170, dur: 0.3, vol: 0.03 });
    }
    if (out.crossedDown) {
      bus.emit("fx:bubbles", {
        x,
        y: 0,
        count: 20,
        splash: true,
        spread: 140,
        power: 0.35,
      });
    }
  }

  /** the whale dragged along the seabed fast enough for it to count as a scrape */
  private checkScrape(
    ctx: GameContext,
    out: LocoOut,
    x: number,
    speed: number,
  ): void {
    if (!out.hitFloor || speed < SCRAPE_SPEED) return;
    if (ctx.clock.t < this.lastScrapeAt + SCRAPE_COOLDOWN) return;
    this.lastScrapeAt = ctx.clock.t;

    const { bus, whale } = ctx;
    bus.emit("fx:bubbles", { x, y: whale.body.y, count: 15, splash: false });
    bus.emit("whale:scrape", { pos: { x, y: whale.body.y } });
  }

  /** sustained escort by a crowd of followers earns a drafting tick */
  private checkDrafting(ctx: GameContext, dt: number): void {
    const { whale, pod, bus } = ctx;
    const wb = whale.body;

    let companions = 0;
    for (const w of pod.followers()) {
      const dx = w.body.x - wb.x;
      const dy = w.body.y - wb.y;
      if (dx * dx + dy * dy < DRAFT_RANGE * DRAFT_RANGE) companions++;
    }

    if (companions < DRAFT_COMPANIONS) {
      this.draftTime = 0;
      return;
    }
    this.draftTime += dt;
    if (this.draftTime < DRAFT_TICK) return;
    this.draftTime -= DRAFT_TICK;
    bus.emit("pod:drafting", {
      duration: DRAFT_TICK,
      companionCount: companions,
    });
  }

  private emitSurface(ctx: GameContext, out: LocoOut, x: number): void {
    const { bus } = ctx;
    if (out.crossedUp > 0) {
      // remember the launch so the re-entry can be scored as one maneuver
      if (out.crossedUp > 140 && this.airAt < 0) {
        this.airAt = ctx.clock.t;
        this.airTurns = 0;
        this.apexStalled = false;
      }

      // a strong-enough breach shakes a latched squid loose
      const latched = ctx.squid.latched;
      if (latched && out.crossedUp > LOCK_BREAK_VY) {
        latched.state = "flee";
        latched.age = 0;
        latched.struggle = 0;
        latched.cool = SQUID.COOLDOWN;
        bus.emit("squid:lockBroken", {
          pos: { x, y: 0 },
          impactVelocity: out.crossedUp,
        });
      }

      const p = Math.min(1, out.crossedUp / 420);
      bus.emit("fx:shake", p * 16);
      bus.emit("fx:bubbles", {
        x,
        y: 0,
        count: 40 * p + 8,
        splash: true,
        spread: 150,
        power: p,
      });
      bus.emit("audio:call", {
        f0: 300 - p * 60,
        f1: 190 - p * 40,
        dur: 0.35 + p * 0.25,
        vol: 0.05 + p * 0.05,
      });
      bus.emit("whale:surfaced", {
        impactVy: -out.crossedUp,
        pos: { x, y: 0 },
      });
      if (out.breachTurns > 0) {
        this.airTurns = out.breachTurns;
        bus.emit("fx:shake", 6);
        bus.emit("whale:breach", {
          flips: out.breachTurns,
          up: out.crossedUp,
          pos: { x, y: 0 },
        });
      }
    }
    if (out.crossedDown) {
      const ep = Math.min(1, ctx.whale.body.speed / 500);
      bus.emit("fx:shake", 10);
      bus.emit("fx:bubbles", {
        x,
        y: 0,
        count: 30 + 20 * ep,
        splash: true,
        spread: 160,
        power: ep,
      });
      bus.emit("whale:submerged", { pos: { x, y: 0 } });

      if (this.airAt >= 0) {
        const b = ctx.whale.body;
        // clean entry = came down steep and nose-first; belly-flop = came down
        // flat. Blend the dive steepness with how square the barrel roll landed
        // to a whole number of turns.
        const steep = b.speed > 1 ? Math.min(1, Math.abs(b.vy) / b.speed) : 1;
        const frac = b.roll / (Math.PI * 2);
        const rollOff = Math.abs(frac - Math.round(frac)); // 0..0.5
        // tail slap = came down flat and hard with no rotation at all
        const tailSlap = steep < 0.3 && b.vy > 100 && rollOff < 0.1;

        bus.emit("whale:reentry", {
          airtime: ctx.clock.t - this.airAt,
          entryVy: b.vy,
          entrySpeed: b.speed,
          turns: this.airTurns,
          cleanArc: 0.6 * steep + 0.4 * (1 - 2 * rollOff),
          apexStall: this.apexStalled,
          tailSlap,
          pos: { x, y: 0 },
        });
        this.airAt = -1;
        this.airTurns = 0;
        this.apexStalled = false;
      }
    }
  }
}
