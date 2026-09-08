/** Frame timing. `t` is seconds since page load; `dt` is the clamped step. */
export class Clock {
  t = 0;
  dt = 0;
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

  get started(): boolean {
    return this.startT >= 0;
  }

  tick(nowMs: number): void {
    this.t = nowMs / 1000;
    this.dt = Math.min(this.maxStep, this.t - this.prev);
    this.prev = this.t;
    this.sinceStart = this.startT < 0 ? 0 : this.t - this.startT;
  }
}
