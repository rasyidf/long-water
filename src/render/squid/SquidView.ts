/**
 * How a deep-water squid is drawn, given its already-simulated state. The seam
 * for swapping the procedural body for a rigged one later: implement this and
 * hand it to `SquidRenderer` — no `SquidSystem` / `SquidBrain` changes, the
 * `Squid` data object stays the source of truth for pose.
 */
import type { CreatureView } from "../CreatureView";
import type { Squid } from "../../state/Squid";

/** the named draw sections of `ProceduralSquidView`, in draw / z order */
export type SquidSection =
  "arms" | "fins" | "mantle" | "stripe" | "head" | "eye";

export type SquidView = CreatureView<Squid, SquidSection>;
