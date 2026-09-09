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

    const b = w.body;
    const { whale, clock } = ctx;

    if (w.state === "following") {
      this.follow(w, ctx, crew, dt);
      return o;
    }

    // wild / answered / lost — a gentle vertical bob, plus homing when answered
    o.ay = Math.sin(clock.t * 0.5 + w.ph) * 6;
    if (w.state === "answered") {
      const dx = whale.x - b.x;
      const dy = whale.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      o.ax += (dx / d) * 60;
      o.ay += (dy / d) * 55;
    }
    return o;
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

    // formation anchor in the leader's wake, kept in the leader's depth band
    const lead = 420 + w.slot * 260;
    const side = (w.slot % 2 ? 1 : -1) * (120 + w.slot * 22);
    const a = whale.trail.pointBeside(lead, side);
    let tx = a.x;
    let ty = clamp(a.y, whale.y - 480, whale.y + 640);

    // fallen far behind → steer straight at a point just behind the leader
    const gap = Math.hypot(whale.x - b.x, whale.y - b.y);
    if (gap > 1500) {
      const catchUp = clamp01((gap - 1500) / 2500);
      tx += (whale.x - whale.facing * 300 - tx) * catchUp;
      ty += (whale.y - ty) * catchUp;
    }

    // hunger → divert to, and feed on, the nearest krill swarm
    w.hunger = Math.min(1, w.hunger + dt * 0.02);
    let feeding = false;
    if (w.hunger > 0.34 && gap < 1500) {
      let best: Swarm | null = null;
      let bestD = 2400;
      for (const s of krill.swarms) {
        if (s.amount <= 15) continue;
        if (Math.abs(s.y - whale.y) > 1000) continue; // don't abandon the pod
        const d = Math.hypot(s.x - b.x, s.y - b.y);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (best) {
        const pull = Math.min(0.55, w.hunger);
        tx += (best.x - tx) * pull;
        ty += (best.y - ty) * pull;
        if (Math.hypot(best.x - b.x, (best.y - b.y) * 1.4) < best.r0 + 150) {
          best.amount -= Math.min(best.amount, 24 * dt);
          best.lit = 1;
          best.panic = 1;
          w.hunger = Math.max(0, w.hunger - dt * 1.1);
          w.stress = Math.max(0, w.stress - dt);
          feeding = true;
          if (Math.random() < 0.2)
            bus.emit("fx:bubbles", { x: b.x, y: b.y, count: 1, splash: false });
          if (stats.once("pod-fed"))
            bus.emit("hint:show", {
              text: "The pod feeds as it travels — fed whales hold formation.",
              secs: 6,
            });
        }
      }
    }

    // desired velocity: seek the anchor + match the leader's travel
    const dx = tx - b.x;
    const dy = ty - b.y;
    const dist = Math.hypot(dx, dy) || 1;
    const leaderIdle = Math.hypot(whale.vx, whale.vy) < 45;
    const minSpeed = feeding ? 40 : leaderIdle && dist < 250 ? 15 : 90;
    const want = clamp(dist * 1.6, minSpeed, 620);
    des.x = (dx / dist) * want + whale.vx * 0.35;
    des.y = (dy / dist) * want + whale.vy * 0.35;

    // ambient fluidity while the leader is basically stopped
    if (leaderIdle) {
      des.x += whale.facing * 42;
      const swell = clamp01((900 - b.y) / 900);
      const sw = clock.t * 0.9 + b.x * 0.0012 + w.slot;
      des.x += Math.sin(sw) * 34 * swell;
      des.y += Math.cos(sw * 1.15) * 24 * swell;
      des.y += Math.sin(clock.t * 0.6 + w.slot * 1.3) * 16;
    }

    // separation from the other followers
    for (const o of crew) {
      if (o === w) continue;
      const ox = b.x - o.body.x;
      const oy = b.y - o.body.y;
      const od = Math.hypot(ox, oy);
      if (od > 0.001 && od < 150) {
        const p = (150 - od) / 150;
        des.x += (ox / od) * p * 260;
        des.y += (oy / od) * p * 260;
      }
    }

    // stay off the seabed, stay under the surface
    const floorHere = world.floorAt(b.x);
    if (b.y > floorHere - 320) des.y -= (b.y - (floorHere - 320)) * 2.4;
    if (b.y < 130) des.y += (130 - b.y) * 2.4;

    // dive away from ship noise
    let noisy = false;
    for (const s of ships.ships) {
      const sd = b.x - s.x;
      if (Math.abs(sd) < 2400 && b.y < 1600) {
        const p = 1 - Math.abs(sd) / 2400;
        des.x += Math.sign(sd || 1) * p * 220;
        des.y += p * 340;
        if (Math.abs(sd) < 1800 && b.y < 1200) noisy = true;
      }
    }

    // sustained ship noise breaks a whale off the pod
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

    this.out.ax = (des.x - b.vx) * APPROACH_GAIN;
    this.out.ay = (des.y - b.vy) * APPROACH_GAIN;
  }
}
