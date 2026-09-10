/** World-space camera with lazy follow. Owns the world<->screen transform. */
import { clamp } from "./math";

export class Camera {
  x = 0;
  y = 0;
  scale = 1;
  /** current screen-shake amplitude in px, driven by CameraSystem */
  shake = 0;
  /** world-space roll in radians, applied to the world container by `Game`
   * (with a matching overscan so the corners never bleed). Driven by the
   * `CameraRig`: a subtle bank into turns plus the breach whip. */
  rot = 0;

  /** viewport size in CSS pixels, kept in sync by the Renderer each frame */
  vw = window.innerWidth;
  vh = window.innerHeight;

  sx(worldX: number): number {
    return (worldX - this.x) * this.scale + this.vw / 2;
  }

  sy(worldY: number): number {
    return (worldY - this.y) * this.scale + this.vh / 2;
  }

  /** world-x range currently visible, with margin */
  visibleX(margin = 0): [number, number] {
    const half = this.vw / 2 / this.scale + margin;
    return [this.x - half, this.x + half];
  }

  clampScale(min: number, max: number): void {
    this.scale = clamp(this.scale, min, max);
  }
}
