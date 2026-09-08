/**
 * Player whale locomotion: thrust, buoyancy, drag, turn-rate limiting, terrain
 * collision, and surface crossings. Emits events for the effects it triggers
 * rather than reaching into particle/audio/camera state directly.
 */
import { clampTurn } from "../core/math";
import { noise1 } from "../core/rng";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class WhaleMovementSystem implements System {
  readonly name = "whale-movement";

  update(dt: number, ctx: GameContext): void {
    const { whale, world, input, clock, bus } = ctx;
    if (whale.done || !whale.alive) return;

    const submerged = whale.y > 0;
    const surging = input.surging && whale.breath > 0;
    const acc = surging ? 780 : 430;
    const move = input.moveAxis();

    const preVx = whale.vx;
    const preVy = whale.vy;

    if (submerged) {
      whale.vx += move.x * acc * dt;
      whale.vy += move.y * acc * dt;
      whale.vx += noise1(whale.x * 0.00007 + clock.t * 0.02) * 46 * dt;
      whale.vy += noise1(whale.y * 0.0004 + 11.3 + clock.t * 0.03) * 34 * dt;
      whale.vy -= Math.max(0, 1 - whale.y / 900) * 40 * dt; // buoyancy near surface
      const drag = 1 - 1.15 * dt;
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
  }
}
