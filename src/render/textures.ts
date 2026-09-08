import { Texture } from "pixi.js";

export type GradientStop = [offset: number, color: string];

/** Bake a CSS gradient into a Pixi texture (linear vertical, or radial). */
export function gradientTexture(
  stops: GradientStop[],
  w: number,
  h: number,
  radial = false,
): Texture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d")!;
  const g = radial
    ? c.createRadialGradient(
        w / 2,
        h / 2,
        Math.min(w, h) * 0.16,
        w / 2,
        h / 2,
        Math.max(w, h) * 0.62,
      )
    : c.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) g.addColorStop(o, col);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  return Texture.from(cv);
}

export const hex = (v: number): string => "#" + v.toString(16).padStart(6, "0");
