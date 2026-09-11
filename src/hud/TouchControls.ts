/**
 * On-screen joystick + action buttons for touch devices. Feeds `Input` the
 * same axis/button state a keyboard would — every other system is unaware
 * touch exists. No-ops (and leaves the overlay `hidden`) on non-touch devices.
 */
import { isTouchDevice } from "../core/touch";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";

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
  /** the stick base recentres on wherever the thumb first lands ("floating"
   *  joystick), clamped so its ring stays inside the touch zone */
  private readonly radius = 46;
  private stickPointerId: number | null = null;
  private center = { x: 0, y: 0 };

  init(ctx: GameContext): void {
    if (!isTouchDevice) return;
    this.input = ctx.input;
    document.body.classList.add("is-touch");
    this.root.hidden = false;

    this.stickZone.addEventListener("pointerdown", this.onStickDown, {
      passive: false,
    });
    this.stickZone.addEventListener("pointermove", this.onStickMove, {
      passive: false,
    });
    this.stickZone.addEventListener("pointerup", this.onStickUp);
    this.stickZone.addEventListener("pointercancel", this.onStickUp);

    this.bindButton(this.btnSing, "Space");
    this.bindButton(this.btnSurge, "ShiftLeft");

    this.btnPause.addEventListener("click", () => this.input.requestPause());

    // the full-screen title/end card sits above the touch controls (it has
    // to, for the keyboard flow) and would otherwise swallow every tap.
    // There's no keyboard on touch, so tapping the card substitutes for
    // "press any key" (title) / "R" (end card) — same guards Input applies.
    document.getElementById("card")!.addEventListener("pointerdown", () => {
      if (!ctx.clock.started) ctx.bus.emit("game:start");
      else if (!ctx.whale.alive || ctx.whale.done) location.reload();
    });
  }

  private bindButton(el: HTMLElement, code: string): void {
    el.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add("active");
        this.input.touchButton(code, true);
      },
      { passive: false },
    );
    const release = (): void => {
      el.classList.remove("active");
      this.input.touchButton(code, false);
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
  }

  private onStickDown = (e: PointerEvent): void => {
    if (this.stickPointerId !== null) return; // one finger drives the stick
    e.preventDefault();
    this.stickPointerId = e.pointerId;
    this.stickZone.setPointerCapture(e.pointerId);

    const rect = this.stickZone.getBoundingClientRect();
    const cx = Math.min(
      Math.max(e.clientX, rect.left + this.radius),
      rect.right - this.radius,
    );
    const cy = Math.min(
      Math.max(e.clientY, rect.top + this.radius),
      rect.bottom - this.radius,
    );
    this.center = { x: cx, y: cy };
    this.stickBase.style.left = `${cx - rect.left}px`;
    this.stickBase.style.top = `${cy - rect.top}px`;
    this.stickBase.classList.add("show");
    this.updateStick(e.clientX, e.clientY);
  };

  private onStickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointerId) return;
    e.preventDefault();
    this.updateStick(e.clientX, e.clientY);
  };

  private onStickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointerId) return;
    this.stickPointerId = null;
    this.stickBase.classList.remove("show");
    this.stickNub.style.transform = "translate(-50%, -50%)";
    this.input.setTouchAxis(null);
  };

  private updateStick(clientX: number, clientY: number): void {
    let dx = clientX - this.center.x;
    let dy = clientY - this.center.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.radius) {
      dx = (dx / dist) * this.radius;
      dy = (dy / dist) * this.radius;
    }
    this.stickNub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.input.setTouchAxis({ x: dx / this.radius, y: dy / this.radius });
  }
}
