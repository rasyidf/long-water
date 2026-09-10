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

/** approx surface water temperature (°C) at each zone anchor — the leg trends
 *  warm as the whale works south, which is the whole point of the crossing. */
const ZONE_TEMP: Record<string, number> = {
  shelf: 12,
  "open-blue": 11,
  lane: 13,
  seamount: 16,
  warm: 25,
};

/** Water temperature (°C) at world `x` and `depthM` metres down: the zone
 *  surface temperature interpolated along the route, then cooled with depth
 *  (a sharper drop below the ~30 m mixed layer). */
export function waterTempC(x: number, depthM: number): number {
  let i = 0;
  for (let k = 0; k < ZONES.length; k++) if (x >= ZONES[k].x) i = k;
  const a = ZONES[i];
  const b = ZONES[Math.min(ZONES.length - 1, i + 1)];
  const f = b.x === a.x ? 0 : Math.min(1, Math.max(0, (x - a.x) / (b.x - a.x)));
  const surf = ZONE_TEMP[a.id] + (ZONE_TEMP[b.id] - ZONE_TEMP[a.id]) * f;
  const drop = depthM * 0.045 + Math.max(0, depthM - 30) * 0.03;
  return Math.max(4, surf - drop);
}
