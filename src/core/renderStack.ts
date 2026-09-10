/**
 * The renderer draw-order and the "animate in place" simulation systems, as
 * plain factories so both `Game` (the real run) and the dev tools
 * (`src/tools/SceneHost.ts`) build the exact same stack. Nothing here holds
 * state — each call returns fresh system instances.
 */
import { BackgroundRenderer } from "../render/BackgroundRenderer";
import { CoralRenderer } from "../render/CoralRenderer";
import { FaunaRenderer } from "../render/FaunaRenderer";
import { KrillRenderer } from "../render/fauna/KrillRenderer";
import { GlowRenderer } from "../render/GlowRenderer";
import { ShipRenderer } from "../render/ShipRenderer";
import { SquidRenderer } from "../render/SquidRenderer";
import { TerrainRenderer } from "../render/TerrainRenderer";
import { WhaleRenderer } from "../render/WhaleRenderer";

import { KrillSystem } from "../systems/KrillSystem";
import { ParticleSystem } from "../systems/ParticleSystem";
import { SchoolSystem } from "../systems/SchoolSystem";
import { SongSystem } from "../systems/SongSystem";
import { WhaleSystem } from "../systems/WhaleSystem";

import type { System } from "./System";

/** Every renderer, in back-to-front draw order. */
export function renderSystems(): System[] {
  return [
    new BackgroundRenderer(),
    new TerrainRenderer(),
    new CoralRenderer(),
    new FaunaRenderer(),
    new KrillRenderer(),
    new WhaleRenderer(),
    new SquidRenderer(),
    new ShipRenderer(),
    new GlowRenderer(),
  ];
}

/** The subset of sim systems that only animate entities in place — no player
 * input, vitals, feeding, pods, ships or camera control. Used by the preview
 * gallery and the dev-tool scenes. */
export function previewSimSystems(): System[] {
  return [
    new WhaleSystem(false),
    new SongSystem(),
    new KrillSystem(),
    new SchoolSystem(),
    new ParticleSystem(),
  ];
}
