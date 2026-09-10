/**
 * The shared seam for the procedural creature bodies. A `CreatureView` draws one
 * animal into a Pixi `Graphics`, split into named z-ordered sections so a
 * designer tool can isolate or highlight each one. It is a pure consumer of
 * whatever pose/params the caller already simulated (`State` — a spine chain, a
 * data object) and holds only pre-allocated scratch, so a crowd of them at
 * 60fps produces no per-frame geometry garbage.
 *
 * `render/whale/WhaleView` and `render/squid/SquidView` specialise this; the
 * matching `Procedural*View` is the swap point for a Spine
 * (`@esotericsoftware/spine-pixi-v8`) rig later.
 */
import type { Graphics } from "pixi.js";
import type { Camera } from "../core/Camera";

export interface CreatureDrawOptions<Section extends string> {
  /** designer hook: returns the `Graphics` a named draw section should render
   * into, so a tool can isolate / highlight each block. Undefined (the default,
   * and every in-game call) → the section draws into the shared `g`. */
  layer?: (section: Section) => Graphics | undefined;
}

export interface CreatureView<
  State,
  Section extends string,
  Opts extends CreatureDrawOptions<Section> = CreatureDrawOptions<Section>,
> {
  /** draw one animal into `g` from its already-simulated `state` */
  draw(g: Graphics, state: State, opts: Opts, cam: Camera): void;
}
