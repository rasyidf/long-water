import type { Input } from "./Input";

/** Maps a connected physical gamepad's left stick + d-pad + face buttons
 *  onto the core `Input` controller. The Gamepad API has no events of its
 *  own — state only updates when read — so `poll()` is called once a frame
 *  from `Input.poll()` rather than reacting to browser events the way the
 *  keyboard/touch sources do. Menu navigation stays keyboard/touch-only;
 *  this only drives gameplay (move, surge, sing, pause). */
const DEADZONE = 0.18;

const BTN_SING = 0; // A / Cross
const BTN_SURGE = 5; // right shoulder (R1 / RB)
const BTN_PAUSE = 9; // Start / Options
const BTN_DPAD_UP = 12;
const BTN_DPAD_DOWN = 13;
const BTN_DPAD_LEFT = 14;
const BTN_DPAD_RIGHT = 15;

export class GamepadMapper {
  constructor(private readonly input: Input) {}
  private padIndex: number | null = null;
  private pausePressed = false;

  poll(): void {
    const pad = this.activePad();
    if (!pad) {
      this.padIndex = null;
      return;
    }
    this.padIndex = pad.index;

    const dpadX =
      (pad.buttons[BTN_DPAD_RIGHT]?.pressed ? 1 : 0) -
      (pad.buttons[BTN_DPAD_LEFT]?.pressed ? 1 : 0);
    const dpadY =
      (pad.buttons[BTN_DPAD_DOWN]?.pressed ? 1 : 0) -
      (pad.buttons[BTN_DPAD_UP]?.pressed ? 1 : 0);
    const [x, y] =
      dpadX || dpadY ? [dpadX, dpadY] : [pad.axes[0] ?? 0, pad.axes[1] ?? 0];

    const m = Math.hypot(x, y);
    if (m < DEADZONE) {
      this.input.setGamepadAxis(null);
    } else {
      const scale = Math.min(1, m) / m;
      this.input.setGamepadAxis({ x: x * scale, y: y * scale });
    }

    this.input.setKey("ShiftLeft", !!pad.buttons[BTN_SURGE]?.pressed);
    this.input.setKey("Space", !!pad.buttons[BTN_SING]?.pressed);

    const pauseDown = !!pad.buttons[BTN_PAUSE]?.pressed;
    if (pauseDown && !this.pausePressed) this.input.requestPause();
    this.pausePressed = pauseDown;
  }

  private activePad(): Gamepad | null {
    const pads = navigator.getGamepads?.();
    if (!pads) return null;
    if (this.padIndex !== null) {
      const known = pads[this.padIndex];
      if (known?.connected) return known;
    }
    return pads.find((p): p is Gamepad => !!p?.connected) ?? null;
  }
}
