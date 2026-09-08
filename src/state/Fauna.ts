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
}

export class KrillStore {
  readonly swarms: Swarm[] = [];
}

export class SchoolStore {
  readonly schools: School[] = [];
}
