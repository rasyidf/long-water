import type { Graphics } from "pixi.js";

/**
 * Draws ONE fish body as a path into `g` — no `fill()`, because `FaunaRenderer`
 * batches a single fill per school. Everything is screen space; the camera
 * transform is already applied.
 *
 *   px, py   fish centre, screen px
 *   ca, sa   cos/sin of the heading; local `+along` = nose, `+perp` = right flank
 *   l, w     half-length / half-width, screen px (`profile.length/width * cam.scale`)
 *   detail   0..1 smooth LOD ramp — simplify the silhouette as it falls toward 0
 *   t        `clock.t` seconds, for body flex (eel / ray / jelly)
 *
 * Local -> screen: `x = px + ca*along - sa*perp`, `y = py + sa*along + ca*perp`.
 */
export type FishStrategy = (
  g: Graphics,
  px: number,
  py: number,
  ca: number,
  sa: number,
  l: number,
  w: number,
  detail: number,
  t: number,
) => void;
