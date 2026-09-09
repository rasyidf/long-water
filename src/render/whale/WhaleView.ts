/**
 * How a whale body is drawn, given its already-simulated spine. This is the
 * seam for swapping the procedural body for a Spine (`@esotericsoftware/
 * spine-pixi-v8`) rig later: implement this interface and hand it to
 * `WhaleRenderer` — no simulation code changes, because the spine chain in
 * `core/SpineChain` stays the source of truth for pose.
 */
import type { Graphics } from "pixi.js";
import type { Camera } from "../../core/Camera";
import type { Vec2 } from "../../core/math";

export interface WhaleDrawOptions {
  scale: number;
  facing: number;
  skin: number;
  belly: number;
  alpha: number;
  /** body half-width in world units before `scale` (girth). Defaults per view. */
  width?: number;
}

export interface WhaleView {
  /** draw one whale into `g`; `spine` is the undulating display chain */
  draw(g: Graphics, spine: Vec2[], opts: WhaleDrawOptions, cam: Camera): void;
}
