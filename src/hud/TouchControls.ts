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
    );

    this.bindButton(this.btnSing, "Space");
    this.bindButton(this.btnSurge, "ShiftLeft");

    this.btnPause.addEventListener("click", () => this.input.requestPause());
  }

  private bindButton(el: HTMLElement, code: string): void {
    el.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add("active");
        this.input.setKey(code, true);
      },
      { passive: false },
    );
    const release = (): void => {
      el.classList.remove("active");
      this.input.setKey(code, false);
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
  }
}
