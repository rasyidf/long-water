/** Named stretches of the route. Each supplies its own water gradient colours. */
export interface Zone {
  x: number;
  name: string;
  shelf: number;
  deep: number;
}

export const ZONES: Zone[] = [
  { x: 0, name: "Continental shelf", shelf: 0x17546f, deep: 0x0b2a3d },
  { x: 30_000, name: "The open blue", shelf: 0x10405a, deep: 0x08192a },
  { x: 62_000, name: "Shipping lane", shelf: 0x173f4c, deep: 0x0a1a22 },
  { x: 88_000, name: "Seamount chain", shelf: 0x134a5e, deep: 0x09182a },
  { x: 110_000, name: "Warm water", shelf: 0x1c6272, deep: 0x102438 },
];

export function zoneAt(x: number): Zone {
  let z = ZONES[0];
  for (const c of ZONES) if (x >= c.x) z = c;
  return z;
}
