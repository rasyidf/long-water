/**
 * The pod's social state machine: answered → following (recruit), the
 * answered / lost timeouts back to wild, and a follower's periodic call.
 *
 * All movement + steering now lives in `WhaleSystem` / `whale/PodBrain`; this
 * system only flips `state` and emits the pod events.
 */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class PodSystem implements System {
  readonly name = "pod";

  update(dt: number, ctx: GameContext): void {
    const { whale, pod, clock, bus, rng, stats } = ctx;

    for (const w of pod.whales) {
      w.lit *= Math.exp(-dt / 3.2);
      const b = w.body;

      if (w.state === "lost") {
        if (Math.abs(b.x - whale.x) > 5000) w.state = "wild";
        continue;
      }

      if (w.state === "answered") {
        if (clock.t > w.answeredUntil) {
          w.state = "wild";
          continue;
        }
        if (Math.hypot(b.x - whale.x, b.y - whale.y) < 620) {
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
        continue;
      }

      // periodic call from a settled follower
      if (w.state === "following" && clock.t > w.nextSong) {
        w.nextSong = clock.t + rng.range(6, 10);
        bus.emit("song:emitted", {
          x: b.x,
          y: b.y,
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
}
