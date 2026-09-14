import { GamepadMapper } from "./GamepadMapper";
import { KeyboardMapper } from "./KeyboardMapper";

/**
 * Core input controller. Owns nothing gameplay — systems read `pressed()` /
 * `justPressed()` / `moveAxis()` / `surging`, unaware of which device an
 * action came from. Three sources write into this same key/edge/axis table:
 * `KeyboardMapper` (real keydown/keyup), `GamepadMapper` (polled once a
 * frame — the Gamepad API has no events of its own), and the on-screen
 * `VirtualJoystick` + buttons (see `hud/TouchControls`), which call
 * `setKey()` / `setTouchAxis()` directly since they're already DOM-driven.
 */
export class Input {
  private keys: Record<string, boolean> = {};
  /** codes whose keydown edge landed since the last frameEnd() */
  private edges = new Set<string>();
  private onRestart?: () => void;
  private onPause?: () => void;

  /** live analog deflection, `-1..1` per axis, from the on-screen stick or a
   *  connected gamepad. Touch wins if both are somehow live; each source
   *  only ever writes its own slot, so neither can stomp the other. */
  private touchAxis: { x: number; y: number } | null = null;
  private padAxis: { x: number; y: number } | null = null;

  private readonly keyboard = new KeyboardMapper(this);
  private readonly gamepad = new GamepadMapper(this);

  /** `onRestart` fires on every `R` keydown — callers (title/end screens) gate
   *  whether that means anything right now. `onPause` fires on every `Escape`
   *  keydown; the front-end and pause menu decide what it closes. */
  attach(opts: { onRestart: () => void; onPause: () => void }): void {
    this.onRestart = opts.onRestart;
    this.onPause = opts.onPause;
    this.keyboard.attach();
  }

  detach(): void {
    this.keyboard.detach();
  }

  /** poll device state that has no events of its own (gamepad sticks and
   *  buttons) — call once per frame, before systems read input. */
  poll(): void {
    this.gamepad.poll();
  }

  /** press/release a virtual key (touch button, gamepad button) as if it
   *  were `code` going down/up on the keyboard — same edge tracking. */
  setKey(code: string, down: boolean): void {
    if (down) {
      if (!this.keys[code]) this.edges.add(code);
      this.keys[code] = true;
    } else {
      this.keys[code] = false;
    }
  }

  /** set the on-screen stick's deflection, `-1..1` per axis, or `null` when
   *  the finger lifts (falls back to gamepad/keyboard axis) */
  setTouchAxis(axis: { x: number; y: number } | null): void {
    this.touchAxis = axis;
  }

  /** set a connected gamepad's stick deflection, `-1..1` per axis, or `null`
   *  once it's back inside the deadzone (falls back to keyboard axis) */
  setGamepadAxis(axis: { x: number; y: number } | null): void {
    this.padAxis = axis;
  }

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

  /** normalized WASD / arrows steering vector, or the live analog stick
   *  deflection while one is active */
  moveAxis(): { x: number; y: number } {
    if (this.touchAxis) return this.touchAxis;
    if (this.padAxis) return this.padAxis;
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

  /** touch controls and the gamepad mapper have no Escape key — same hook
   *  Escape uses */
  requestPause(): void {
    this.onPause?.();
  }

  /** same hook the keyboard's `R` uses, for sources with no keyboard */
  requestRestart(): void {
    this.onRestart?.();
  }
}
