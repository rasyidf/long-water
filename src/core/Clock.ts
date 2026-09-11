/** Frame timing. `t` is seconds since page load; `dt` is the clamped step. */
export class Clock {
  t = 0;
  dt = 0;
  /** the clamped step *before* `timeScale` — real wall-clock seconds */
  rawDt = 0;
  /** cinematic slow-motion factor, driven by `CameraSystem`; 1 = real time.
   * Scales `dt` (the simulation step) only — `t` and `sinceStart` stay real. */
  timeScale = 1;
  /** seconds since the player started the run (0 until started) */
  sinceStart = 0;

  private prev = 0;
  private startT = -1;
  private maxStep: number;

  constructor(maxStep = 0.05) {
    this.maxStep = maxStep;
  }

  markStarted(): void {
    if (this.startT < 0) this.startT = this.t;
  }

  /** a fresh run reusing the same clock: `t` keeps ticking (it's wall-clock
   *  since page load, and other page-lifetime systems may read it), but
   *  `sinceStart`/`started` and any cinematic slow-mo reset */
  reset(): void {
    this.startT = -1;
    this.timeScale = 1;
  }

  get started(): boolean {
    return this.startT >= 0;
  }

  tick(nowMs: number): void {
    this.t = nowMs / 1000;
    this.rawDt = Math.min(this.maxStep, this.t - this.prev);
    this.dt = this.rawDt * this.timeScale;
    this.prev = this.t;
    this.sinceStart = this.startT < 0 ? 0 : this.t - this.startT;
  }
}
