/**
 * Pod behaviour state machine: wild → answered → following → lost.
 *
 * A follower steers toward a moving anchor in the leader's wake (it never traces
 * the path) while also: matching the leader's travel so it doesn't lag on a
 * cruise, holding separation from the other followers, staying off the seabed
 * and below the surface, diving away from ship noise, and — when hungry —
 * diverting to the nearest krill swarm to feed.
 */
import { clamp, clamp01, clampTurn } from "../core/math";
import {
  applyUndulation,
  chaseChain,
  SPINE_JOINTS,
  strokeAmpFor,
} from "../core/SpineChain";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { podBodyLen, type PodWhale } from "../state/Pod";
import type { Swarm } from "../state/Fauna";

export class PodSystem implements System {
  readonly name = "pod";

  update(dt: number, ctx: GameContext): void {
    const { whale, pod, world, clock, bus, rng, stats } = ctx;

    const crew = pod.whales.filter((w) => w.state === "following");
    crew.sort((a, b) => a.slot - b.slot);
    crew.forEach((w, i) => (w.slot = i));

    for (const w of pod.whales) {
      w.lit *= Math.exp(-dt / 3.2);

      if (w.state === "following") {
        this.stepFollower(w, crew, dt, ctx);
        continue;
      }

      // wild / lost / answered — light autonomous drift
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.vy += Math.sin(clock.t * 0.5 + w.ph) * 6 * dt;

      if (w.state === "answered") {
        // an answering whale closes some of the distance itself
        const dx = whale.x - w.x;
        const dy = whale.y - w.y;
        const d = Math.hypot(dx, dy) || 1;
        w.vx += (dx / d) * 60 * dt;
        w.vy += (dy / d) * 55 * dt;
        const sp = Math.hypot(w.vx, w.vy);
        if (sp > 150) {
          w.vx = (w.vx / sp) * 150;
          w.vy = (w.vy / sp) * 150;
        }
      }

      w.y = clamp(w.y, 220, world.floorAt(w.x) - 260);
      if (w.state === "lost" && Math.abs(w.x - whale.x) > 5000)
        w.state = "wild";

      if (w.state === "answered") {
        if (clock.t > w.answeredUntil) {
          w.state = "wild";
          continue;
        }
        if (Math.hypot(w.x - whale.x, w.y - whale.y) < 620) {
          w.state = "following";
          w.slot = pod.followers().length - 1;
          w.nextSong = clock.t + rng.range(3, 7);
          w.hunger = rng.range(0, 0.25);
          stats.joined++;
          bus.emit("pod:joined", { count: stats.joined });
          bus.emit("audio:call", { f0: 150, f1: 300, dur: 1.1, vol: 0.11 });
          bus.emit("audio:call", {
            f0: 226,
            f1: 452,
            dur: 1.1,
            vol: 0.07,
            delay: 0.1,
          });
          bus.emit("hint:show", {
            text:
              stats.joined === 1
                ? "It fell in behind you. Sing again and you sing together."
                : "Another one joined. The pod carries the call further.",
            secs: 6,
          });
        }
      }
    }
  }

  private stepFollower(
    w: PodWhale,
    crew: PodWhale[],
    dt: number,
    ctx: GameContext,
  ): void {
    const { whale, ships, world, krill, clock, bus, rng, stats } = ctx;

    // --- formation anchor in the leader's wake ---
    const lead = 420 + w.slot * 260;
    const side = (w.slot % 2 ? 1 : -1) * (120 + w.slot * 22);
    let tx: number;
    let ty: number;
    {
      const a = whale.trail.pointBeside(lead, side);
      tx = a.x;
      ty = a.y;
    }
    // keep the formation anchor in the leader's own depth band — followers must
    // not sit hundreds of metres deeper than the leader just because the wake
    // used to run that deep
    ty = clamp(ty, whale.y - 480, whale.y + 640);

    // if a follower has fallen a long way behind, steer straight at a point
    // just behind the leader to close the gap before resuming station
    const gap = Math.hypot(whale.x - w.x, whale.y - w.y);
    if (gap > 1500) {
      const catchUp = clamp01((gap - 1500) / 2500);
      tx += (whale.x - whale.facing * 300 - tx) * catchUp;
      ty += (whale.y - ty) * catchUp;
    }

    // --- hunger: divert to, and feed on, nearby krill ---
    w.hunger = Math.min(1, w.hunger + dt * 0.02);
    let feeding = false;
    if (w.hunger > 0.34 && gap < 1500) {
      let best: Swarm | null = null;
      let bestD = 2400;
      for (const s of krill.swarms) {
        if (s.amount <= 15) continue;
        if (Math.abs(s.y - whale.y) > 1000) continue; // don't abandon the pod to dive
        const d = Math.hypot(s.x - w.x, s.y - w.y);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      if (best) {
        const pull = Math.min(0.55, w.hunger);
        tx += (best.x - tx) * pull;
        ty += (best.y - ty) * pull;
        if (Math.hypot(best.x - w.x, (best.y - w.y) * 1.4) < best.r0 + 150) {
          const take = Math.min(best.amount, 24 * dt);
          best.amount -= take;
          best.lit = 1;
          best.panic = 1;
          w.hunger = Math.max(0, w.hunger - dt * 1.1);
          w.stress = Math.max(0, w.stress - dt);
          feeding = true;
          if (Math.random() < 0.2)
            bus.emit("fx:bubbles", { x: w.x, y: w.y, count: 1, splash: false });
          if (stats.once("pod-fed"))
            bus.emit("hint:show", {
              text: "The pod feeds as it travels — fed whales hold formation.",
              secs: 6,
            });
        }
      }
    }

    // --- desired velocity: seek the anchor + match the leader's travel ---
    const dx = tx - w.x;
    const dy = ty - w.y;
    const dist = Math.hypot(dx, dy) || 1;

    // 1. Detect if the leader is basically stopped
    const leaderSpeed = Math.hypot(whale.vx, whale.vy);
    const isLeaderIdle = leaderSpeed < 45;

    // 2. Drop the minimum speed if the leader is idle and we've reached the anchor.
    // This stops them from aggressively overshooting a stationary target.
    const minSpeed = feeding ? 40 : isLeaderIdle && dist < 250 ? 15 : 90;
    const want = clamp(dist * 1.6, minSpeed, 620);

    let vx = (dx / dist) * want + whale.vx * 0.35;
    let vy = (dy / dist) * want + whale.vy * 0.35;

    // 3. Inject ambient fluidity when the leader is idle
    if (isLeaderIdle) {
      // Gentle forward glide keeps their bodies horizontal, matching the player whale
      vx += whale.facing * 42;

      // Orbital swell near the surface (offset by w.slot so they don't sync perfectly)
      const swell = clamp01((900 - w.y) / 900);
      const sw = clock.t * 0.9 + w.x * 0.0012 + w.slot;
      vx += Math.sin(sw) * 34 * swell;
      vy += Math.cos(sw * 1.15) * 24 * swell;

      // Deep water organic bobbing
      vy += Math.sin(clock.t * 0.6 + w.slot * 1.3) * 16;
    }

    // --- separation from the other followers ---
    for (const o of crew) {
      if (o === w) continue;
      const ox = w.x - o.x;
      const oy = w.y - o.y;
      const od = Math.hypot(ox, oy);
      if (od > 0.001 && od < 150) {
        const p = (150 - od) / 150;
        vx += (ox / od) * p * 260;
        vy += (oy / od) * p * 260;
      }
    }

    // --- stay off the seabed, stay under the surface ---
    const floorHere = world.floorAt(w.x);
    if (w.y > floorHere - 320) vy -= (w.y - (floorHere - 320)) * 2.4;
    if (w.y < 130) vy += (130 - w.y) * 2.4;

    // --- dive away from ship noise ---
    let noisy = false;
    for (const s of ships.ships) {
      const sd = w.x - s.x;
      if (Math.abs(sd) < 2400 && w.y < 1600) {
        const p = 1 - Math.abs(sd) / 2400;
        vx += Math.sign(sd || 1) * p * 220;
        vy += p * 340;
        if (Math.abs(sd) < 1800 && w.y < 1200) noisy = true;
      }
    }

    // --- integrate, cap the turn rate and the speed ---
    const preVx = w.vx;
    const preVy = w.vy;
    const k = Math.min(1, dt * 3.0);
    w.vx += (vx - w.vx) * k;
    w.vy += (vy - w.vy) * k;
    const t = clampTurn(preVx, preVy, w.vx, w.vy, 3.0, dt);
    w.vx = t.x;
    w.vy = t.y;
    const sp = Math.hypot(w.vx, w.vy);
    if (sp > 560) {
      w.vx = (w.vx / sp) * 560;
      w.vy = (w.vy / sp) * 560;
    }

    w.x += w.vx * dt;
    w.y += w.vy * dt;
    // hard guards: never breach, never clip the seabed
    w.y = clamp(w.y, 45, Math.max(60, floorHere - 90));

    // --- body chain --- (sized to this whale, not the leader: a calf is shorter)
    const bodyLen = podBodyLen(w);
    if (!w.base) {
      w.base = [];
      for (let i = 0; i < SPINE_JOINTS; i++)
        w.base.push(whale.trail.pointBeside(lead + i * (bodyLen / 15), side));
      w.spine = w.base.map((p) => ({ x: p.x, y: p.y }));
    }
    w.wag += dt * (1.6 + Math.min(want, 500) / 140);
    chaseChain(w.base, w.x, w.y, bodyLen);
    applyUndulation(w.spine!, w.base, w.wag * 2.0, strokeAmpFor(want));

    // --- sustained ship noise breaks a whale off ---
    w.stress = noisy ? w.stress + dt : Math.max(0, w.stress - dt * 0.6);
    if (w.stress > 9) {
      w.state = "lost";
      w.slot = -1;
      w.spine = null;
      w.base = null;
      w.vx = -40;
      w.vy = -20;
      stats.lost++;
      bus.emit("pod:lost", { count: stats.lost });
      bus.emit("hint:show", {
        text: "The ship noise broke one off. Take the pod deeper to keep them.",
        secs: 6,
      });
      return;
    }

    // --- periodic call ---
    if (clock.t > w.nextSong) {
      w.nextSong = clock.t + rng.range(6, 10);
      bus.emit("song:emitted", {
        x: w.x,
        y: w.y,
        strength: 0.75,
        friendly: true,
        chorus: 0,
      });
      bus.emit("audio:call", {
        f0: rng.range(190, 250),
        f1: rng.range(56, 78),
        dur: 2.1,
        vol: 0.06,
      });
    }
  }
}
