/** Non-whale life: krill swarms and fish schools. */

export interface KrillPart {
  a: number;
  r: number;
  ph: number;
  px: number;
  py: number;
  kx: number;
  ky: number;
}

export interface Swarm {
  x: number;
  y: number;
  baseY: number;
  r: number;
  r0: number;
  parts: KrillPart[];
  amount: number;
  lit: number;
  spin: number;
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
  /** 0 sea fan | 1 staghorn | 2 brain | 3 tube sponges | 4 sea whip */
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
