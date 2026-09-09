/** Named stretches of the route. Each supplies its own water gradient colours.
 *  `id` is the stable key: used for water textures and the `zone.<id>` i18n
 *  lookup that produces the on-screen name. */
export interface Zone {
  x: number;
  id: string;
  shelf: number;
  deep: number;
}

export const ZONES: Zone[] = [
  { x: 0, id: "shelf", shelf: 0x17546f, deep: 0x0b2a3d },
  { x: 30_000, id: "open-blue", shelf: 0x10405a, deep: 0x08192a },
  { x: 62_000, id: "lane", shelf: 0x173f4c, deep: 0x0a1a22 },
  { x: 88_000, id: "seamount", shelf: 0x134a5e, deep: 0x09182a },
  { x: 110_000, id: "warm", shelf: 0x1c6272, deep: 0x102438 },
];

export function zoneAt(x: number): Zone {
  let z = ZONES[0];
  for (const c of ZONES) if (x >= c.x) z = c;
  return z;
}
