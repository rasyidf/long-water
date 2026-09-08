/**
 * Placeholder for a Spine-rigged whale body.
 *
 * `@esotericsoftware/spine-pixi-v8` is already a dependency. To use it:
 *   1. drop `whale.skel` + `whale.atlas` + page png into `public/assets/whale/`
 *   2. `Assets.add` / `Assets.load` them in `Game.boot`
 *   3. in `draw`, keep one `Spine` instance per whale, set its root position to
 *      `spine[0]`, rotate it to the head tangent, and drive a "swim" track;
 *      optionally bind a few bones to `spine[i]` for the tail curve
 *   4. construct `WhaleRenderer` with this view instead of `ProceduralWhaleView`
 *
 * The simulation is untouched: `core/SpineChain` still produces the pose, this
 * class only skins it.
 */
import type { WhaleView } from "./WhaleView";

export class SpineWhaleView implements WhaleView {
  draw(): void {
    throw new Error(
      "SpineWhaleView is a stub — add whale Spine assets and implement draw(). " +
        "See the file header for the wiring steps.",
    );
  }
}
