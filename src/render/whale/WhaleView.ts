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
  /** 0..1 juvenile morph: shorter blunt head, fuller forebody, less tail taper.
   * 0 (default) is an adult. */
  juv?: number;
  /** barrel-roll angle in radians about the long axis (faked in the side view):
   * girth squashes, the belly patch / dorsal fin / flipper swing to the other
   * side as it passes 90°. 0 (default) is level. */
  roll?: number;
  /** 0..1 strength of the `roll` distortion, for easing it in and out. */
  rollK?: number;
}

export interface WhaleView {
  /** draw one whale into `g`; `spine` is the undulating display chain */
  draw(
    g: Graphics,
    spine: ReadonlyArray<Vec2>,
    opts: WhaleDrawOptions,
    cam: Camera,
  ): void;
}
