/**
 * Pod behaviour state machine: wild -> answered -> following -> lost. Followers
 * steer toward a moving anchor in the leader's wake (never trace the path), keep
 * a formation slot, and break off under sustained ship noise.
 */
import { clamp, clampTurn } from "../core/math";
import {
  applyUndulation,
  chaseChain,
  SPINE_JOINTS,
  strokeAmpFor,
} from "../core/SpineChain";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class PodSystem implements System {
  readonly name = "pod";

  update(dt: number, ctx: GameContext): void {
    const { whale, pod, ships, world, clock, bus, rng, stats } = ctx;

    // renumber formation slots by current order
    const slots = pod.whales.filter((w) => w.state === "following");
    slots.sort((a, b) => a.slot - b.slot);
    slots.forEach((w, i) => (w.slot = i));

    for (const w of pod.whales) {
      w.lit *= Math.exp(-dt / 3.2);

      if (w.state === "following") {
        const lead = 460 + w.slot * 300;
        const side = (w.slot % 2 ? 1 : -1) * (110 + w.slot * 18);
        const target = whale.trail.pointBeside(lead, side);
        const tdx = target.x - w.x;
        const tdy = target.y - w.y;
        const tdist = Math.hypot(tdx, tdy);
        const want = clamp(tdist * 1.7, 0, 640);
        const ux = tdx / (tdist || 1);
        const uy = tdy / (tdist || 1);
        const preVx = w.vx;
        const preVy = w.vy;
        w.vx += (ux * want - w.vx) * Math.min(1, dt * 3.0);
        w.vy += (uy * want - w.vy) * Math.min(1, dt * 3.0);
        const wt = clampTurn(preVx, preVy, w.vx, w.vy, 2.9, dt);
        w.vx = wt.x;
        w.vy = wt.y;
        w.x += w.vx * dt;
        w.y += w.vy * dt;

        if (!w.base) {
          w.base = [];
          for (let i = 0; i < SPINE_JOINTS; i++)
            w.base.push(
              whale.trail.pointBeside(lead + i * (whale.len / 15), side),
            );
          w.spine = w.base.map((p) => ({ x: p.x, y: p.y }));
        }
        w.wag += dt * (1.6 + Math.min(want, 500) / 140);
        chaseChain(w.base, w.x, w.y, whale.len);
        applyUndulation(w.spine!, w.base, w.wag * 2.0, strokeAmpFor(want));

        let noisy = false;
        for (const s of ships.ships)
          if (Math.abs(s.x - w.x) < 1800 && w.y < 1200) noisy = true;
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
        }
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
        continue;
      }

      // wild + lost drift on their own
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.vy += Math.sin(clock.t * 0.5 + w.ph) * 6 * dt;
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
}
