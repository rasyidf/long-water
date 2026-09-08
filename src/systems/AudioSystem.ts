/**
 * All sound. Owns the WebAudio graph; other systems only emit `audio:call`.
 * Starts the ambient bed on `game:start` (needs a user gesture to resume).
 * Master volume is set via `audio:volume` (0..1) and read from options.
 */
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

export class AudioSystem implements System {
  readonly name = "audio";
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 1;

  init(ctx: GameContext): void {
    ctx.bus.on("game:start", () => this.start());
    ctx.bus.on("audio:call", (c) =>
      this.call(c.f0, c.f1, c.dur, c.vol, c.delay ?? 0),
    );
    ctx.bus.on("audio:volume", (v) => {
      this.volume = Math.max(0, Math.min(1, v));
      if (this.master && this.ac)
        this.master.gain.setTargetAtTime(
          this.volume,
          this.ac.currentTime,
          0.05,
        );
    });
    ctx.bus.on("game:pause", () => void this.ac?.suspend());
    ctx.bus.on("game:resume", () => void this.ac?.resume());
  }

  private start(): void {
    if (this.ac) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ac = new Ctor();
    } catch {
      return;
    }
    const ac = this.ac;
    this.master = ac.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ac.destination);

    const bus = ac.createGain();
    bus.gain.value = 0;
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 260;
    bus.connect(lp);
    lp.connect(this.master);
    for (const f of [46, 49.5, 92]) {
      const o = ac.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ac.createGain();
      g.gain.value = f > 60 ? 0.05 : 0.14;
      o.connect(g);
      g.connect(bus);
      o.start();
    }
    bus.gain.linearRampToValueAtTime(0.5, ac.currentTime + 3);
  }

  private call(
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    delay: number,
  ): void {
    const ac = this.ac;
    const out = this.master;
    if (!ac || !out) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const dl = ac.createDelay(1.2);
    dl.delayTime.value = 0.42;
    const fb = ac.createGain();
    fb.gain.value = 0.34;
    dl.connect(fb);
    fb.connect(dl);
    const wet = ac.createGain();
    wet.gain.value = 0.5;
    o.connect(g);
    g.connect(lp);
    lp.connect(out);
    lp.connect(dl);
    dl.connect(wet);
    wet.connect(out);
    o.start(t);
    o.stop(t + dur + 0.1);
  }
}
