/** Ships (noise hazards) and the transient particle pools. */

export interface Ship {
  x: number;
  v: number;
  len: number;
}

export interface Ping {
  x: number;
  y: number;
  r: number;
  maxR: number;
  friendly: boolean;
  chorus: number;
}

export interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  splash: boolean;
}

export interface Snow {
  x: number;
  y: number;
  s: number;
  d: number;
}

export class ShipStore {
  readonly ships: Ship[] = [];
}

export class SongField {
  readonly pings: Ping[] = [];
}

export class ParticleStore {
  readonly bubbles: Bubble[] = [];
  readonly snow: Snow[] = [];
}
