/** World-space camera with lazy follow. Owns the world<->screen transform. */
import { clamp } from "./math";

export class Camera {
  x = 0;
  y = 0;
  scale = 1;
  /** current screen-shake amplitude in px, driven by CameraSystem */
  shake = 0;

  /** viewport size in CSS pixels, kept in sync by the Renderer each frame */
  vw = window.innerWidth;
  vh = window.innerHeight;

  follow(
    targetX: number,
    targetY: number,
    leadX: number,
    leadY: number,
    speed: number,
    dt: number,
  ): void {
    this.x += (targetX + leadX - this.x) * Math.min(1, dt * 3.1);
    this.y += (targetY + leadY - this.y) * Math.min(1, dt * 2.6);
    const want = this.vw / (2200 + Math.min(700, speed * 1.2));
    this.scale += (want - this.scale) * Math.min(1, dt * 1.8);
  }

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
