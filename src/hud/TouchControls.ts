/**
 * On-screen joystick + action buttons for touch devices. Feeds `Input` the
 * same axis/button state a keyboard would — every other system is unaware
 * touch exists. No-ops (and leaves the overlay `hidden`) on non-touch devices.
 */
import { isTouchDevice } from "../core/touch";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import { VirtualJoystick } from "./VirtualJoystick";

const $ = (id: string) => document.getElementById(id)!;

export class TouchControls implements System {
  readonly name = "hud:touch";
  private root = $("touchControls");
  private stickZone = $("stickZone");
  private stickBase = $("stickBase");
  private stickNub = $("stickNub");
  private btnSing = $("btnSing");
  private btnSurge = $("btnSurge");
  private btnPause = $("btnPause");

  private input!: GameContext["input"];
  /** the DOM nodes outlive every run, so each rebuild's instance must take
   *  its listeners with it — otherwise they stack up and one tap on Pause
   *  toggles it open and shut again */
  private listeners = new AbortController();

  init(ctx: GameContext): void {
    if (!isTouchDevice) return;
    this.input = ctx.input;
    document.body.classList.add("is-touch");
    this.root.hidden = false;

    new VirtualJoystick(
      this.stickZone,
      this.stickBase,
      this.stickNub,
      46,
      (axis) => this.input.setTouchAxis(axis),
      this.listeners.signal,
    );

    this.bindButton(
      this.btnSing,
      () => this.input.setKey("Space", true),
      () => this.input.setKey("Space", false),
    );
    this.bindButton(
      this.btnSurge,
      () => this.input.setKey("ShiftLeft", true),
      () => this.input.setKey("ShiftLeft", false),
    );
    // fires once on press, same capture mechanics as the hold buttons above
    // (no release action — a tap, not a hold)
    this.bindButton(this.btnPause, () => this.input.requestPause());
  }

  dispose(): void {
    this.listeners.abort();
  }

  /** shared tap/hold mechanics for every on-screen button: capture the
   *  pointer on the element it landed on (so a finger dragging off the
   *  button doesn't leave it stuck "active"), and drive it off the raw
   *  pointer event rather than `click`, which depends on the browser
   *  synthesizing one from the touch. */
  private bindButton(
    el: HTMLElement,
    onDown: () => void,
    onUp?: () => void,
  ): void {
    const { signal } = this.listeners;
    el.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add("active");
        onDown();
      },
      { passive: false, signal },
    );
    const release = (): void => {
      el.classList.remove("active");
      onUp?.();
    };
    el.addEventListener("pointerup", release, { signal });
    el.addEventListener("pointercancel", release, { signal });
  }
}
