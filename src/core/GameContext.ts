/**
 * The single object every system and renderer receives. It is a *registry of
 * references*, not logic — assembled once in `Game`. Systems reach shared state
 * and services through here and talk to each other only via `bus`.
 */
import type { Application } from "pixi.js";

import type { Heightfield } from "../world/Heightfield";
import type { Camera } from "./Camera";
import type { Clock } from "./Clock";
import type { EventBus } from "./EventBus";
import type { Input } from "./Input";
import type { Layers } from "./Layers";
import type { Rng } from "./rng";

import type { KrillStore, SchoolStore } from "../state/Fauna";
import type { ParticleStore, ShipStore, SongField } from "../state/Hazards";
import type { Pod } from "../state/Pod";
import type { PlayerWhale } from "../state/PlayerWhale";
import type { RunStats } from "../state/RunStats";

export interface GameContext {
  readonly app: Application;
  readonly bus: EventBus;
  readonly rng: Rng;
  readonly clock: Clock;
  readonly camera: Camera;
  readonly input: Input;
  readonly layers: Layers;
  readonly world: Heightfield;

  readonly whale: PlayerWhale;
  readonly pod: Pod;
  readonly krill: KrillStore;
  readonly schools: SchoolStore;
  readonly ships: ShipStore;
  readonly song: SongField;
  readonly particles: ParticleStore;
  readonly stats: RunStats;

  /** true once the player has taken the first breath; false again after game over */
  running: boolean;
}
