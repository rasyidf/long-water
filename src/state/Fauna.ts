/** Non-whale life: krill swarms and fish schools. */

export interface KrillPart {
  /** offset from the swarm centre, world units */
  ox: number;
  oy: number;
  /** velocity relative to the swarm centre */
  vx: number;
  vy: number;
  /** per-mote phase for its wander heading and swim bursts */
  ph: number;
  /** world position, written by `KrillSystem` for the renderers */
  px: number;
  py: number;
}

export interface Swarm {
  x: number;
  y: number;
  baseY: number;
  /** current cohesion radius — shrinks from `r0` as the swarm balls up */
  r: number;
  r0: number;
  parts: KrillPart[];
  amount: number;
  lit: number;
  ph: number;
  panic: number;
}

export interface Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface School {
  x: number;
  y: number;
  ax: number;
  ay: number;
  fish: Fish[];
  lit: number;
  ph: number;
  /** reef schools shelter in a coral cluster when the whale bears down; the
   *  home anchor is the reef centre. Undefined for open-water schools. */
  homeX?: number;
  homeY?: number;
  /** 0..1 how deeply the school has taken cover right now */
  shelter: number;
  /** index into `SPECIES` (`config/species.ts`); assigned at spawn from the
   *  seeded rng, so it rebuilds deterministically and is never serialized. */
  species: number;
}

/** A static coral growth anchored to the seabed on the shallow shelf. */
export interface Coral {
  x: number;
  /** seabed y the coral is rooted at */
  y: number;
  /** 0 sea fan | 1 staghorn | 2 brain | 3 tube sponges | 4 sea whip |
   *  5 anemone | 6 table — see `render/coral/geometry.ts` `KIND_NAMES`;
   *  the renderer takes it modulo `KIND_COUNT` */
  kind: number;
  scale: number;
  /** sway phase */
  ph: number;
}

export class KrillStore {
  readonly swarms: Swarm[] = [];
}

export class SchoolStore {
  readonly schools: School[] = [];
}

export class CoralStore {
  readonly items: Coral[] = [];
}
