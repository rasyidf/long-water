/**
 * A floating on-screen joystick: the base recentres on wherever a finger
 * first lands inside `zone`, clamped so its ring stays inside the zone.
 * Reports deflection as `-1..1` per axis via `onChange`; `null` once the
 * finger lifts. Pure pointer-events + DOM — `TouchControls` owns wiring it
 * into `Input`.
 */
export class VirtualJoystick {
  private pointerId: number | null = null;
  private center = { x: 0, y: 0 };

  constructor(
    private readonly zone: HTMLElement,
    private readonly base: HTMLElement,
    private readonly nub: HTMLElement,
    private readonly radius: number,
    private readonly onChange: (axis: { x: number; y: number } | null) => void,
    signal?: AbortSignal,
  ) {
    zone.addEventListener("pointerdown", this.onDown, {
      passive: false,
      signal,
    });
    zone.addEventListener("pointermove", this.onMove, {
      passive: false,
      signal,
    });
    zone.addEventListener("pointerup", this.onUp, { signal });
    zone.addEventListener("pointercancel", this.onUp, { signal });
  }

  private onDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return; // one finger drives the stick
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.zone.setPointerCapture(e.pointerId);

    const rect = this.zone.getBoundingClientRect();
    const cx = Math.min(
      Math.max(e.clientX, rect.left + this.radius),
      rect.right - this.radius,
    );
    const cy = Math.min(
      Math.max(e.clientY, rect.top + this.radius),
      rect.bottom - this.radius,
    );
    this.center = { x: cx, y: cy };
    this.base.style.left = `${cx - rect.left}px`;
    this.base.style.top = `${cy - rect.top}px`;
    this.base.classList.add("show");
    this.update(e.clientX, e.clientY);
  };

  private onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this.update(e.clientX, e.clientY);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.base.classList.remove("show");
    this.nub.style.transform = "translate(-50%, -50%)";
    this.onChange(null);
  };

  private update(clientX: number, clientY: number): void {
    let dx = clientX - this.center.x;
    let dy = clientY - this.center.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.radius) {
      dx = (dx / dist) * this.radius;
      dy = (dy / dist) * this.radius;
    }
    this.nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.onChange({ x: dx / this.radius, y: dy / this.radius });
  }
}
