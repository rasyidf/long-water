/**
 * Player whale locomotion: thrust, buoyancy, drag, turn-rate limiting, terrain
 * collision, surface crossings, and the speed mechanics —
 *
 *   Shift (hold)  sustained surge; thrust and top speed ramp up over ~1.6 s as
 *                 the whale builds momentum (`surge` 0..1).
 *   Shift (tap)   a tail-kick: an instant burst in the steer direction, on an
 *                 0.85 s cooldown, costing a little breath.
 *
 * Emits events for the effects it triggers rather than touching particle/audio
 * /camera state directly.
 */
import { clamp01, clampTurn } from "../core/math";
import { noise1 } from "../core/rng";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

const REST_Y = 70; // depth a drifting whale settles to — it does not bob out

export class WhaleMovementSystem implements System {
  readonly name = "whale-movement";

  private surgeCharge = 0;
  private kickCooldown = 0;

  init(ctx: GameContext): void {
    ctx.bus.on("game:restart", () => {
      this.surgeCharge = 0;
      this.kickCooldown = 0;
    });
  }

  update(dt: number, ctx: GameContext): void {
    const { whale, world, input, clock, bus } = ctx;
    if (whale.done || !whale.alive) return;

    const submerged = whale.y > 0;
    const surging = input.surging && whale.breath > 0;
    const move = input.moveAxis();

    // momentum: thrust and top speed build while surging, bleed off when not
    this.kickCooldown = Math.max(0, this.kickCooldown - dt);
    this.surgeCharge = surging
      ? Math.min(1, this.surgeCharge + dt / 1.6)
      : Math.max(0, this.surgeCharge - dt / 0.8);
    whale.surge = this.surgeCharge;

    const acc = (surging ? 780 : 430) * (1 + 0.5 * this.surgeCharge);

    const preVx = whale.vx;
    const preVy = whale.vy;

    // tail-kick burst — fires on the Shift keydown edge
    if (
      submerged &&
      whale.breath > 5 &&
      this.kickCooldown <= 0 &&
      input.justPressed("ShiftLeft", "ShiftRight")
    ) {
      this.kickCooldown = 0.85;
      whale.breath -= 4;
      let dx = move.x;
      let dy = move.y;
      if (dx === 0 && dy === 0) {
        const sp = whale.speed;
        if (sp > 6) {
          dx = whale.vx / sp;
          dy = whale.vy / sp;
        } else {
          dx = whale.facing;
          dy = 0;
        }
      }
      whale.vx += dx * 320;
      whale.vy += dy * 320;
      bus.emit("fx:shake", 5);
      bus.emit("fx:bubbles", {
        x: whale.x,
        y: whale.y,
        count: 14,
        splash: false,
        spread: 42,
      });
      bus.emit("audio:call", { f0: 220, f1: 90, dur: 0.5, vol: 0.06 });
    }

    if (submerged) {
      whale.vx += move.x * acc * dt;
      whale.vy += move.y * acc * dt;

      // a cruising whale is never truly still — a gentle idle glide in the
      // facing direction keeps the body level instead of hanging nose-up
      if (move.x === 0 && !surging) whale.vx += whale.facing * 42 * dt;

      // orbital swell near the surface, fading to a slow deep drift
      const swell = clamp01((900 - whale.y) / 900);
      const sw = clock.t * 0.9 + whale.x * 0.0012;
      whale.vx += Math.sin(sw) * 34 * swell * dt;
      whale.vy += Math.cos(sw * 1.15) * 24 * swell * dt;
      whale.vx += noise1(whale.x * 0.00007 + clock.t * 0.02) * 24 * dt;
      whale.vy += noise1(whale.y * 0.0004 + 11.3 + clock.t * 0.03) * 18 * dt;

      // buoyancy: a soft pull toward REST_Y, strong near the surface, gone by
      // ~45 m — deep water is near-neutral so the whale can hover
      const buoyZone = clamp01((450 - whale.y) / 450);
      whale.vy += (REST_Y - whale.y) * 0.9 * buoyZone * dt;

      const drag = 1 - (1.15 - 0.35 * this.surgeCharge) * dt;
      whale.vx *= drag;
      whale.vy *= drag;
      const t = clampTurn(preVx, preVy, whale.vx, whale.vy, 2.4, dt);
      whale.vx = t.x;
      whale.vy = t.y;
    } else {
      whale.vy += 1400 * dt; // out of water: gravity
    }

    const wasUnder = whale.y > 0;
    whale.x += whale.vx * dt;
    whale.y += whale.vy * dt;

    if (wasUnder && whale.y <= 0) {
      const p = Math.min(1, Math.abs(whale.vy) / 420);
      bus.emit("fx:shake", p * 16);
      bus.emit("fx:bubbles", {
        x: whale.x,
        y: 0,
        count: 40 * p + 8,
        splash: true,
        spread: 150,
      });
      bus.emit("audio:call", { f0: 300, f1: 190, dur: 0.35, vol: 0.05 });
      bus.emit("whale:surfaced", {
        impactVy: whale.vy,
        pos: { x: whale.x, y: whale.y },
      });
    }
    if (!wasUnder && whale.y > 0) {
      bus.emit("fx:shake", 10);
      bus.emit("fx:bubbles", {
        x: whale.x,
        y: 0,
        count: 30,
        splash: true,
        spread: 160,
      });
      bus.emit("whale:submerged", { pos: { x: whale.x, y: whale.y } });
    }

    const fy = world.floorAt(whale.x);
    if (whale.y > fy - 60) {
      whale.y = fy - 60;
      whale.vy = Math.min(whale.vy, -20);
    }
    if (whale.x < 100) {
      whale.x = 100;
      whale.vx = Math.abs(whale.vx);
    }

    // heading / tail
    if (Math.abs(whale.vx) > 25) {
      const want = whale.vx > 0 ? 1 : -1;
      whale.facing += (want - whale.facing) * Math.min(1, dt * 3);
    }
    whale.wag += dt * (1.6 + Math.min(whale.speed, 500) / 140);

    // wake streak while driving hard
    if (surging && whale.speed > 230 && Math.random() < 0.35) {
      bus.emit("fx:bubbles", {
        x: whale.x - whale.facing * 120,
        y: whale.y,
        count: 1,
        splash: false,
        spread: 20,
      });
    }
  }
}
