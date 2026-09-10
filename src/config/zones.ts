/** Named stretches of the route. Owned by the active level file
 *  (`src/world/levels/<id>.json`); this module is the read-through renderers and
 *  the HUD use. Each zone supplies its own water gradient colours and a surface
 *  temperature anchor. `id` is the stable key: water textures + the `zone.<id>`
 *  i18n lookup that produces the on-screen name. */
import { getLevel } from "../world/level/active";
import type { LevelZone } from "../world/level/schema";

export type Zone = LevelZone;

/** every zone on the active route, in order */
export const zones = (): LevelZone[] => getLevel().zones;

export function zoneAt(x: number): Zone {
  const zs = getLevel().zones;
  let z = zs[0];
  for (const c of zs) if (x >= c.x) z = c;
  return z;
}

/** Water temperature (°C) at world `x` and `depthM` metres down: the zone
 *  surface temperature interpolated along the route, then cooled with depth
 *  (a sharper drop below the ~30 m mixed layer). */
export function waterTempC(x: number, depthM: number): number {
  const zs = getLevel().zones;
  let i = 0;
  for (let k = 0; k < zs.length; k++) if (x >= zs[k].x) i = k;
  const a = zs[i];
  const b = zs[Math.min(zs.length - 1, i + 1)];
  const f = b.x === a.x ? 0 : Math.min(1, Math.max(0, (x - a.x) / (b.x - a.x)));
  const surf = a.tempC + (b.tempC - a.tempC) * f;
  const drop = depthM * 0.045 + Math.max(0, depthM - 30) * 0.03;
  return Math.max(4, surf - drop);
}
