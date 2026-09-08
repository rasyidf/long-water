/** Keyboard state. Owns nothing gameplay — systems read `pressed()` / axes. */
export class Input {
  private keys: Record<string, boolean> = {};
  private onFirstKey?: () => void;
  private onRestart?: () => void;
  private onPause?: () => void;

  attach(opts: {
    onFirstKey: () => void;
    onRestart: () => void;
    onPause: () => void;
  }): void {
    this.onFirstKey = opts.onFirstKey;
    this.onRestart = opts.onRestart;
    this.onPause = opts.onPause;
    addEventListener("keydown", this.handleDown);
    addEventListener("keyup", this.handleUp);
  }

  detach(): void {
    removeEventListener("keydown", this.handleDown);
    removeEventListener("keyup", this.handleUp);
  }

  private handleDown = (e: KeyboardEvent): void => {
    if (e.code === "Escape") {
      this.onPause?.();
      return;
    }
    this.onFirstKey?.();
    this.keys[e.code] = true;
    if (e.code === "Space") e.preventDefault();
    if (e.code === "KeyR") this.onRestart?.();
  };

  private handleUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };

  pressed(code: string): boolean {
    return !!this.keys[code];
  }

  /** normalized WASD / arrows steering vector */
  moveAxis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.pressed("KeyA") || this.pressed("ArrowLeft")) x -= 1;
    if (this.pressed("KeyD") || this.pressed("ArrowRight")) x += 1;
    if (this.pressed("KeyW") || this.pressed("ArrowUp")) y -= 1;
    if (this.pressed("KeyS") || this.pressed("ArrowDown")) y += 1;
    const m = Math.hypot(x, y);
    if (m > 0) {
      x /= m;
      y /= m;
    }
    return { x, y };
  }

  get surging(): boolean {
    return this.pressed("ShiftLeft") || this.pressed("ShiftRight");
  }
}
