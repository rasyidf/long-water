/**
 * Song: emitting rings, propagating them through the water, lighting whatever
 * they sweep, and scheduling pod replies. The whole "sonar" mechanic lives
 * here; other systems only read `lit` fields and listen for `song:emitted`.
 */
import { NCOL, COL } from "../config/constants";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class SongSystem implements System {
  readonly name = "song";
  private lastPlayerSing = -9;
  private openingSung = false;

  init(ctx: GameContext): void {
    ctx.bus.on("game:restart", () => {
      this.lastPlayerSing = -9;
      this.openingSung = false;
    });
    // anyone can request a ring; near-ship attenuation is applied here
    ctx.bus.on("song:emitted", (p) => {
      let maxR = 2800 * p.strength;
      for (const s of ctx.ships.ships)
        if (Math.abs(s.x - p.x) < 6000) maxR *= 0.55;
      ctx.song.pings.push({
        x: p.x,
        y: p.y,
        r: 40,
        maxR,
        friendly: p.friendly,
        chorus: p.chorus,
      });
    });
  }

  private playerSing(ctx: GameContext): void {
    const { whale, pod, bus, stats, clock, rng } = ctx;
    const crew = pod
      .followers()
      .filter((w) => Math.hypot(w.body.x - whale.x, w.body.y - whale.y) < 1400);
    const n = crew.length;
    whale.breath -= 6;
    const strength = Math.min(2.6, 1 + n * 0.34); // voices stack
    bus.emit("song:emitted", {
      x: whale.x,
      y: whale.y,
      strength,
      friendly: true,
      chorus: n,
    });
    bus.emit("audio:call", { f0: 340, f1: 96, dur: 1.7, vol: 0.16 });
    crew.forEach((w, i) => {
      w.nextSong = clock.t + rng.range(5, 9);
      bus.emit("audio:call", {
        f0: rng.range(190, 270),
        f1: rng.range(52, 80),
        dur: 2.2,
        vol: 0.075,
        delay: 0.14 + i * 0.09,
      });
    });
    if (n > 0) {
      stats.chorus++;
      bus.emit("pod:chorus");
    }
  }

  update(dt: number, ctx: GameContext): void {
    const { whale, pod, song, krill, schools, world, input, clock, bus, rng } =
      ctx;

    if (!this.openingSung && clock.sinceStart > 0.9) {
      this.openingSung = true;
      this.playerSing(ctx);
      bus.emit("hint:show", {
        text: "Amber is krill. Silver is fish, and fish are not food.",
        secs: 7,
      });
    }

    const submerged = whale.y > 0;
    if (
      input.pressed("Space") &&
      submerged &&
      whale.breath > 8 &&
      clock.t - this.lastPlayerSing > 1.6
    ) {
      this.lastPlayerSing = clock.t;
      this.playerSing(ctx);
    }

    // propagate rings
    for (let i = song.pings.length - 1; i >= 0; i--) {
      const p = song.pings[i];
      const pr = p.r;
      p.r += 1250 * dt;
      if (p.r > p.maxR) {
        song.pings.splice(i, 1);
        continue;
      }
      const band = (ex: number, ey: number): boolean => {
        const d = Math.hypot(ex - p.x, ey - p.y);
        return d >= pr && d < p.r;
      };
      for (const s of krill.swarms)
        if (s.amount > 0 && band(s.x, s.y)) s.lit = 1;
      for (const sc of schools.schools) if (band(sc.ax, sc.ay)) sc.lit = 1;
      for (const w of pod.whales) {
        if (w.state === "following" || !band(w.body.x, w.body.y)) continue;
        w.lit = 1;
        if (p.friendly && w.replyAt <= 0 && clock.t > w.cool) {
          w.replyAt = clock.t + rng.range(0.7, 1.8);
          if (!w.heard) {
            w.heard = true;
            ctx.stats.answered++;
            bus.emit("pod:answered", { count: ctx.stats.answered });
          }
        }
      }
      const c0 = Math.max(0, Math.floor((p.x - p.r) / COL));
      const c1 = Math.min(NCOL - 1, Math.ceil((p.x + p.r) / COL));
      for (let c = c0; c <= c1; c++) {
        const d = Math.hypot(c * COL - p.x, world.floorY[c] - p.y);
        if (d >= pr && d < p.r) world.floorLit[c] = 1;
      }
    }

    // resolve scheduled replies
    for (const w of pod.whales) {
      if (w.replyAt > 0 && clock.t >= w.replyAt) {
        w.replyAt = -1;
        w.cool = clock.t + 9;
        if (w.state === "wild") {
          w.state = "answered";
          w.answeredUntil = clock.t + 26;
          if (ctx.stats.answered === 1)
            bus.emit("hint:show", {
              text: "It answered. Swim to it before the call fades.",
              secs: 6,
            });
        }
        bus.emit("song:emitted", {
          x: w.body.x,
          y: w.body.y,
          strength: 0.8,
          friendly: false,
          chorus: 0,
        });
        const d = Math.hypot(w.body.x - whale.x, w.body.y - whale.y);
        bus.emit("audio:call", {
          f0: rng.range(200, 260),
          f1: rng.range(58, 78),
          dur: 2.3,
          vol: 0.11 * Math.max(0.15, 1 - d / 6000),
        });
      }
    }

    // decay the sonar-lit seabed
    for (let c = 0; c < NCOL; c++)
      if (world.floorLit[c] > 0.002) world.floorLit[c] *= Math.exp(-dt / 2.6);
  }
}
