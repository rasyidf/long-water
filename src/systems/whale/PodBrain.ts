/**
 * Produces a per-frame `Intent` for one pod whale from its social state.
 *
 *  - wild / lost: a slow vertical bob, whatever drift it spawned with.
 *  - answered: bob + a homing pull toward the player (speed-capped by `podCaps`).
 *  - following: the full follower stack — wake anchor + leader-velocity match +
 *    catch-up + idle-leader fluidity + separation + seabed/surface springs +
 *    ship-noise dive, plus hunger accrual / krill foraging / stress break-off.
 *
 * Everything is folded into a desired velocity, then handed to `stepLocomotion`
 * as a critically-damped approach force.
 */
import type { GameContext } from "../../core/GameContext";
import type { PodWhale } from "../../state/Pod";
import type { Swarm } from "../../state/Fauna";
import type { Vec2 } from "../../core/math";
import { clamp, clamp01 } from "../../core/math";
import type { Intent } from "./locomotion";

/** desired velocity → force gain; matches the old `v += (want-v)*min(1,dt*3)` */
const APPROACH_GAIN = 3;

/** Fast euclidean distance helper (Math.hypot is notoriously slow in V8) */
const dist = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy);

export class PodBrain {
  private readonly out: Intent = {
    ax: 0,
    ay: 0,
    impulseX: 0,
    impulseY: 0,
    faceDir: 1,
    levelOut: false,
    ease: 0,
  };
  private readonly des: Vec2 = { x: 0, y: 0 };

  intent(
    w: PodWhale,
    ctx: GameContext,
    crew: ReadonlyArray<PodWhale>,
    dt: number,
  ): Intent {
    const o = this.out;
    o.ax = 0;
    o.ay = 0;
    o.faceDir = 1; // the follow() path relies on the historical default

    if (w.state === "following") {
      this.follow(w, ctx, crew, dt);
      return o;
    }

    this.wander(w, ctx, dt);
    return o;
  }

  /**
   * Wild / answered / lost whales now live like real whales: they meander at a
   * cruising depth, burn breath while they're down, and climb to the surface to
   * blow when their lungs run low before sinking back to the deep. `answered`
   * layers a homing pull toward the player on top.
   */
  private wander(w: PodWhale, ctx: GameContext, dt: number): void {
    const o = this.out;
    const des = this.des;
    const b = w.body;
    const { whale, clock, bus } = ctx;

    // --- breath: same curve the player's VitalsSystem uses ---
    if (b.y < 60) {
      w.breath = Math.min(100, w.breath + 52 * dt);
    } else {
      w.breath -= (0.8 + Math.min(1, b.y / 3000) * 1.3) * dt;
      if (w.breath < 0) w.breath = 0;
    }
    if (!w.surfacing && w.breath < 30) w.surfacing = true;
    else if (w.surfacing && w.breath > 96) w.surfacing = false;

    // a soft spout while it hangs at the surface catching its breath (only
    // bother with FX for a whale that's actually on screen)
    const onScreen = Math.abs(b.x - ctx.camera.x) < 4000;
    if (onScreen && w.surfacing && b.y < 40 && Math.random() < dt * 2.4) {
      bus.emit("fx:bubbles", {
        x: b.x,
        y: 0,
        count: 3,
        splash: true,
        spread: 26,
      });
      bus.emit("audio:call", { f0: 90, f1: 60, dur: 0.4, vol: 0.03 });
    }

    // --- target: the surface on a breath run, else a bob around cruise depth ---
    const ty = w.surfacing
      ? 8
      : w.cruiseY + Math.sin(clock.t * 0.5 + w.ph) * 40;
    const dy = ty - b.y;

    const cruise = w.surfacing ? 28 : 44;
    des.x = b.facing * cruise + Math.sin(clock.t * 0.3 + w.ph) * 16;
    des.y = clamp(dy * (w.surfacing ? 1.7 : 0.9), -260, 260);

    if (w.state === "answered") {
      const dx = whale.x - b.x;
      const ody = whale.y - b.y;
      const d = dist(dx, ody) || 1;
      des.x += (dx / d) * 90;
      des.y += (ody / d) * 80;
    }

    o.ax = (des.x - b.vx) * APPROACH_GAIN;
    o.ay = (des.y - b.vy) * APPROACH_GAIN;
    o.faceDir = des.x < -8 ? -1 : des.x > 8 ? 1 : 0;
  }

  private follow(
    w: PodWhale,
    ctx: GameContext,
    crew: ReadonlyArray<PodWhale>,
    dt: number,
  ): void {
    const { whale, ships, world, krill, clock, bus, stats } = ctx;
    const b = w.body;
    const des = this.des;

    // 1. Formation Anchor (wake targeting)
    const lead = 420 + w.slot * 260;
    const side = (w.slot % 2 !== 0 ? 1 : -1) * (120 + w.slot * 22);
    const a = whale.trail.pointBeside(lead, side);
    let tx = a.x;
    let ty = clamp(a.y, whale.y - 480, whale.y + 640);

    // 2. Catch-up mechanics
    const wdx = whale.x - b.x;
    const wdy = whale.y - b.y;
    const gap = dist(wdx, wdy);

    if (gap > 1500) {
      const catchUp = clamp01((gap - 1500) / 2500);
      tx += (whale.x - whale.facing * 300 - tx) * catchUp;
      ty += (whale.y - ty) * catchUp;
    }

    // 3. Hunger & Feeding
    w.hunger = Math.min(1, w.hunger + dt * 0.02);
    let feeding = false;

    if (w.hunger > 0.34 && gap < 1500) {
      let best: Swarm | null = null;
      let bestD = 2400;

      for (const s of krill.swarms) {
        if (s.amount <= 15) continue;

        // Fast vertical check (replaces Math.abs)
        const dy = s.y - whale.y;
        if (dy > 1000 || dy < -1000) continue;

        const sdx = s.x - b.x;
        const sdy = s.y - b.y;

        // Manhattan bounding box early-out (avoids sqrt cost)
        if (sdx > bestD || sdx < -bestD || sdy > bestD || sdy < -bestD)
          continue;

        const d = dist(sdx, sdy);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }

      if (best) {
        const pull = Math.min(0.55, w.hunger);
        tx += (best.x - tx) * pull;
        ty += (best.y - ty) * pull;

        const bdx = best.x - b.x;
        const bdy = (best.y - b.y) * 1.4;

        if (dist(bdx, bdy) < best.r0 + 150) {
          best.amount -= Math.min(best.amount, 24 * dt);
          best.lit = 1;
          best.panic = 1;
          w.hunger = Math.max(0, w.hunger - dt * 1.1);
          w.stress = Math.max(0, w.stress - dt);
          feeding = true;

          if (Math.random() < 0.2) {
            bus.emit("fx:bubbles", { x: b.x, y: b.y, count: 1, splash: false });
          }
          if (stats.once("pod-fed")) {
            bus.emit("hint:show", {
              text: "The pod feeds as it travels — fed whales hold formation.",
              secs: 6,
            });
          }
        }
      }
    }

    // 4. Desired Velocity
    const dx = tx - b.x;
    const dy = ty - b.y;
    const distToTarget = dist(dx, dy) || 1;
    const leaderIdle = dist(whale.vx, whale.vy) < 45;

    const minSpeed = feeding ? 40 : leaderIdle && distToTarget < 250 ? 15 : 90;
    const want = clamp(distToTarget * 1.6, minSpeed, 620);

    des.x = (dx / distToTarget) * want + whale.vx * 0.35;
    des.y = (dy / distToTarget) * want + whale.vy * 0.35;

    // 5. Ambient Fluidity
    if (leaderIdle) {
      des.x += whale.facing * 42;
      const swell = clamp01((900 - b.y) / 900);
      const sw = clock.t * 0.9 + b.x * 0.0012 + w.slot;
      des.x += Math.sin(sw) * 34 * swell;
      des.y += Math.cos(sw * 1.15) * 24 * swell;
      des.y += Math.sin(clock.t * 0.6 + w.slot * 1.3) * 16;
    }

    // 6. Separation (Boids-like repel)
    for (const o of crew) {
      if (o === w) continue;

      const ox = b.x - o.body.x;
      // Early out limits sqrt processing
      if (ox > 150 || ox < -150) continue;

      const oy = b.y - o.body.y;
      if (oy > 150 || oy < -150) continue;

      const od = dist(ox, oy);
      if (od > 0.001 && od < 150) {
        const p = (150 - od) / 150;
        des.x += (ox / od) * p * 260;
        des.y += (oy / od) * p * 260;
      }
    }

    // 7. Environment Boundaries
    const floorHere = world.floorAt(b.x);
    if (b.y > floorHere - 320) des.y -= (b.y - (floorHere - 320)) * 2.4;
    if (b.y < 130) des.y += (130 - b.y) * 2.4;

    // 8. Ship Avoidance & Stress
    let noisy = false;
    for (const s of ships.ships) {
      const sd = b.x - s.x;
      if (sd > -2400 && sd < 2400 && b.y < 1600) {
        const absSd = sd >= 0 ? sd : -sd;
        const p = 1 - absSd / 2400;

        // Fast substitute for Math.sign(sd || 1)
        des.x += (sd >= 0 ? 1 : -1) * p * 220;
        des.y += p * 340;

        if (absSd < 1800 && b.y < 1200) noisy = true;
      }
    }

    // 9. Breaking off mechanics
    w.stress = noisy ? w.stress + dt : Math.max(0, w.stress - dt * 0.6);
    if (w.stress > 9) {
      w.state = "lost";
      w.slot = -1;
      b.vx = -40;
      b.vy = -20;
      stats.lost++;
      bus.emit("pod:lost", { count: stats.lost });
      bus.emit("hint:show", {
        text: "The ship noise broke one off. Take the pod deeper to keep them.",
        secs: 6,
      });
      this.out.ax = 0;
      this.out.ay = 0;
      return;
    }

    // 10. Apply Final Forces
    this.out.ax = (des.x - b.vx) * APPROACH_GAIN;
    this.out.ay = (des.y - b.vy) * APPROACH_GAIN;
  }
}
