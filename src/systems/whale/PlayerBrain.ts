/**
 * Turns player input + abilities into a per-frame `Intent` for the shared
 * locomotion step. Owns only the surge charge and the tail-kick cooldown;
 * emits the tail-kick / wake FX directly on the bus.
 */
import type { GameContext } from "../../core/GameContext";
import type { Intent } from "./locomotion";

export class PlayerBrain {
  private surgeCharge = 0;
  private kickCooldown = 0;
  private readonly out: Intent = {
    ax: 0,
    ay: 0,
    impulseX: 0,
    impulseY: 0,
    faceDir: 0,
    levelOut: false,
    ease: 0,
  };

  reset(): void {
    this.surgeCharge = 0;
    this.kickCooldown = 0;
  }

  intent(ctx: GameContext, dt: number): Intent {
    const { whale, input, bus } = ctx;
    const b = whale.body;
    const o = this.out;
    o.ax = 0;
    o.ay = 0;
    o.impulseX = 0;
    o.impulseY = 0;
    o.faceDir = 0;
    o.levelOut = false;

    const submerged = b.y > 0;
    const surging = input.surging && whale.breath > 0;
    const move = input.moveAxis();

    this.kickCooldown = Math.max(0, this.kickCooldown - dt);
    this.surgeCharge = surging
      ? Math.min(1, this.surgeCharge + dt / 1.6)
      : Math.max(0, this.surgeCharge - dt / 0.8);
    whale.surge = this.surgeCharge;
    o.ease = this.surgeCharge;

    // a latched squid steals thrust (see the backward / down tug below)
    const grip = whale.grip;
    const acc =
      (surging ? 780 : 430) * (1 + 0.5 * this.surgeCharge) * (1 - 0.55 * grip);

    // tail-kick burst — fires on the Shift keydown edge
    if (
      submerged &&
      whale.breath > 5 &&
      this.kickCooldown <= 0 &&
      input.justPressed("ShiftLeft", "ShiftRight")
    ) {
      this.kickCooldown = 0.85;
      whale.breath -= 4;
      b.wag += 1.5;
      let dx = move.x;
      let dy = move.y;
      if (dx === 0 && dy === 0) {
        const sp = b.speed;
        if (sp > 6) {
          dx = b.vx / sp;
          dy = b.vy / sp;
        } else {
          dx = b.facing;
          dy = 0;
        }
      }
      o.impulseX = dx * 320;
      o.impulseY = dy * 320;
      bus.emit("fx:shake", 5);
      bus.emit("fx:bubbles", {
        x: b.x,
        y: b.y,
        count: 14,
        splash: false,
        spread: 42,
      });
      bus.emit("audio:call", { f0: 220, f1: 90, dur: 0.5, vol: 0.06 });
    }

    if (submerged) {
      o.ax = move.x * acc;
      o.ay = move.y * acc;
      // a cruising whale is never truly still — a gentle idle glide keeps it level
      if (move.x === 0 && !surging) o.ax += b.facing * 42;
      if (move.x === 0 && move.y === 0 && !surging && grip < 0.01)
        o.levelOut = true;
    }

    // latched-squid drag: hauls the whale back and down until it's shaken
    if (grip > 0.01) {
      o.ax -= b.facing * 300 * grip;
      o.ay += 160 * grip;
    }

    // wake streak while driving hard
    if (surging && b.speed > 230 && Math.random() < 0.35) {
      bus.emit("fx:bubbles", {
        x: b.x - b.facing * 120,
        y: b.y,
        count: 1,
        splash: false,
        spread: 20,
      });
    }

    return o;
  }
}
