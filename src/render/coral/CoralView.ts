/**
 * How one coral growth is drawn, given its placed `Coral` item and the frame's
 * light. The seam between `CoralRenderer` (culling, ambient + sonar light) and
 * the procedural shapes in `ProceduralCoralView`; the designer drives the same
 * view with a per-section `layer` hook to isolate each draw block.
 */
import type { Coral } from "../../state/Fauna";
import type { CreatureDrawOptions, CreatureView } from "../CreatureView";
import type { CoralParams } from "./params";

/** the named draw sections of `ProceduralCoralView`, in draw / z order */
export const CORAL_SECTIONS = [
  "shadow",
  "holdfast",
  "body",
  "shade",
  "detail",
  "polyps",
  "rim",
] as const;

export type CoralSection = (typeof CORAL_SECTIONS)[number];

export interface CoralDrawOptions extends CreatureDrawOptions<CoralSection> {
  /** 0..1 master opacity (ambient light, lifted by a sonar sweep) */
  alpha: number;
  /** 0..1 ambient light at the root — sinks the hue toward the water */
  light: number;
  /** 0..1 sonar glow on the seabed under it — brightens the tips */
  sonar: number;
  /** clock time, seconds — drives the current and every polyp */
  t: number;
  params: CoralParams;
}

export type CoralView = CreatureView<Coral, CoralSection, CoralDrawOptions>;
