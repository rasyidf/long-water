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
 * `simulate: false` (the preview gallery) skips brains + physics and only poses
 * the bodies in place.
 */
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

export class WhaleSystem implements System {
  readonly name = "whale";

  private readonly playerBrain = new PlayerBrain();
  private readonly podBrain = new PodBrain();

  constructor(private readonly simulate = true) {}

  init(ctx: GameContext): void {
    ctx.bus.on("game:restart", () => {
      this.playerBrain.reset();
      const b = ctx.whale.body;
      b.roll = 0;
      b.rollVel = 0;
      b.rollBlend = 0;
    });
  }

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
      this.emitSurface(ctx, out, whale.body.x);
      stepPose(whale.body, dt, whale.trail);
    }

    // compact follower slots before anyone steers off them
    const crew = pod.whales.filter((w) => w.state === "following");
    crew.sort((a, b) => a.slot - b.slot);
    crew.forEach((w, i) => (w.slot = i));

    for (const w of pod.whales) {
      if (this.simulate) {
        const intent = this.podBrain.intent(w, ctx, crew, dt);
        stepLocomotion(w.body, intent, podCaps(w), ctx.world, ctx.clock, dt);
      } else {
        w.body.wag += dt * 1.6; // idle breathe so gallery bodies still undulate
      }
      stepPose(w.body, dt);
    }
  }

  private emitSurface(ctx: GameContext, out: LocoOut, x: number): void {
    const { bus } = ctx;
    if (out.crossedUp > 0) {
      const p = Math.min(1, out.crossedUp / 420);
      bus.emit("fx:shake", p * 16);
      bus.emit("fx:bubbles", {
        x,
        y: 0,
        count: 40 * p + 8,
        splash: true,
        spread: 150,
      });
      bus.emit("audio:call", { f0: 300, f1: 190, dur: 0.35, vol: 0.05 });
      bus.emit("whale:surfaced", {
        impactVy: -out.crossedUp,
        pos: { x, y: 0 },
      });
      if (out.breachTurns > 0) {
        bus.emit("fx:shake", 6);
        bus.emit("whale:breach", { flips: out.breachTurns, pos: { x, y: 0 } });
      }
    }
    if (out.crossedDown) {
      bus.emit("fx:shake", 10);
      bus.emit("fx:bubbles", { x, y: 0, count: 30, splash: true, spread: 160 });
      bus.emit("whale:submerged", { pos: { x, y: 0 } });
    }
  }
}
