/** Keyboard state. Owns nothing gameplay — systems read `pressed()` / axes. */
export class Input {
  private keys: Record<string, boolean> = {};
  /** codes whose keydown edge landed since the last frameEnd() */
  private edges = new Set<string>();
  private onRestart?: () => void;
  private onPause?: () => void;

  /** `onRestart` fires on every `R` keydown — callers (title/end screens) gate
   *  whether that means anything right now. `onPause` fires on every `Escape`
   *  keydown; the front-end and pause menu decide what it closes. */
  attach(opts: { onRestart: () => void; onPause: () => void }): void {
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
    if (!this.keys[e.code] && !e.repeat) this.edges.add(e.code);
    this.keys[e.code] = true;
    // a focused menu button owns Space as its own click — don't eat the
    // keystroke, or Space can never activate "New Game" et al.
    if (e.code === "Space" && document.activeElement === document.body)
      e.preventDefault();
    if (e.code === "KeyR") this.onRestart?.();
  };

  private handleUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };

  pressed(code: string): boolean {
    return !!this.keys[code];
  }

  /** true only on the frame the key went down — consume with frameEnd() */
  justPressed(...codes: string[]): boolean {
    return codes.some((c) => this.edges.has(c));
  }

  /** call once per frame after all systems have read input */
  frameEnd(): void {
    this.edges.clear();
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
