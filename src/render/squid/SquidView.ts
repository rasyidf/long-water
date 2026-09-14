/**
 * How a deep-water squid is drawn, given its already-simulated state. The seam
 * for swapping the procedural body for a rigged one later: implement this and
 * hand it to `SquidRenderer` — no `SquidSystem` / `SquidBrain` changes, the
 * `Squid` data object stays the source of truth for pose.
 */
import type { Vec2 } from "../../core/math";
import type { Squid } from "../../state/Squid";
import type { CreatureDrawOptions, CreatureView } from "../CreatureView";
import type { SquidLook } from "./params";

export interface SquidDrawOptions extends CreatureDrawOptions<SquidSection> {
  /** 0..1 overall opacity — `SquidRenderer` derives it from the ambient light
   * at the squid's depth, so an animal in the true dark is a faint shape read
   * mostly by its photophores */
  alpha: number;
  /** the look to build from; defaults to the live `squidLook()` */
  look?: SquidLook;
  /** world point a latched squid is holding — the tentacle tips bend onto it */
  gripAt?: Vec2 | null;
}

/** the named draw sections of `ProceduralSquidView`, in draw / z order */
export type SquidSection =
  | "farArms"
  | "farFin"
  | "nearFin"
  | "mantle"
  | "stripe"
  | "mottle"
  | "photophores"
  | "sheen"
  | "shade"
  | "head"
  | "nearArms"
  | "rim"
  | "eye";

export type SquidView = CreatureView<Squid, SquidSection, SquidDrawOptions>;
