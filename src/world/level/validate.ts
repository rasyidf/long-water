/**
 * Turns untrusted JSON (hand-authored or emitted by the level builder) into a
 * `LevelDef`, or throws a readable error. Not exhaustive — it catches the
 * mistakes that would otherwise fail deep inside world-gen with a cryptic stack.
 */
import { TILES } from "../../config/tiles";
import type { LevelDef, LevelZone, Range, SpawnDirective } from "./schema";

const TILE_NAMES = new Set(TILES.map((t) => t.name));

class LevelError extends Error {
  constructor(where: string, msg: string) {
    super(`level "${where}": ${msg}`);
    this.name = "LevelError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function num(where: string, path: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new LevelError(where, `${path} must be a number`);
  return v;
}

/** accepts a number, "0x17546f" or "#17546f" → packed rgb int */
function color(where: string, path: string, v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/^#/, "0x"));
    if (Number.isFinite(n)) return n;
  }
  throw new LevelError(
    where,
    `${path} must be a colour (number, "0x..", "#..")`,
  );
}

function range(where: string, path: string, v: unknown): Range {
  if (
    !Array.isArray(v) ||
    v.length !== 2 ||
    typeof v[0] !== "number" ||
    typeof v[1] !== "number"
  )
    throw new LevelError(where, `${path} must be [min, max]`);
  return [v[0], v[1]];
}

function tileNames(where: string, path: string, v: unknown): string[] {
  if (!Array.isArray(v) || v.some((s) => typeof s !== "string"))
    throw new LevelError(where, `${path} must be a string[]`);
  for (const s of v as string[])
    if (!TILE_NAMES.has(s))
      throw new LevelError(where, `${path}: unknown tile "${s}"`);
  return v as string[];
}

function zones(where: string, v: unknown): LevelZone[] {
  if (!Array.isArray(v) || v.length === 0)
    throw new LevelError(where, "zones must be a non-empty array");
  let lastX = -Infinity;
  return v.map((z, i) => {
    if (!isObj(z)) throw new LevelError(where, `zones[${i}] must be an object`);
    const x = num(where, `zones[${i}].x`, z.x);
    if (i === 0 && x !== 0) throw new LevelError(where, "zones[0].x must be 0");
    if (x <= lastX && i > 0)
      throw new LevelError(where, `zones[${i}].x must increase`);
    lastX = x;
    if (typeof z.id !== "string" || !z.id)
      throw new LevelError(where, `zones[${i}].id must be a non-empty string`);
    return {
      x,
      id: z.id,
      shelf: color(where, `zones[${i}].shelf`, z.shelf),
      deep: color(where, `zones[${i}].deep`, z.deep),
      tempC: num(where, `zones[${i}].tempC`, z.tempC),
    };
  });
}

const KINDS = new Set(["krill", "school", "whale", "ship", "coral", "snow"]);

function spawn(where: string, i: number, v: unknown): SpawnDirective {
  if (!isObj(v)) throw new LevelError(where, `spawns[${i}] must be an object`);
  const at = `spawns[${i}]`;
  if (typeof v.kind !== "string" || !KINDS.has(v.kind))
    throw new LevelError(
      where,
      `${at}.kind must be one of ${[...KINDS].join(", ")}`,
    );
  if (v.kind === "snow") {
    num(where, `${at}.count`, v.count);
    if (v.area !== undefined) range(where, `${at}.area`, v.area);
    return v as unknown as SpawnDirective;
  }
  if (v.mode !== "scatter" && v.mode !== "place")
    throw new LevelError(where, `${at}.mode must be "scatter" or "place"`);
  if (v.mode === "place" && !Array.isArray(v.items))
    throw new LevelError(where, `${at}.items must be an array`);
  if (v.mode === "scatter") {
    num(where, `${at}.from`, v.from);
    num(where, `${at}.to`, v.to);
    if (v.kind !== "coral")
      range(where, `${at}.step`, (v as { step: unknown }).step);
    if (v.skipTiles !== undefined)
      tileNames(where, `${at}.skipTiles`, v.skipTiles);
    if (v.onTiles !== undefined) tileNames(where, `${at}.onTiles`, v.onTiles);
  }
  return v as unknown as SpawnDirective;
}

export function parseLevel(raw: unknown, id: string): LevelDef {
  if (!isObj(raw)) throw new LevelError(id, "file must be a JSON object");
  if (raw.id !== id)
    throw new LevelError(
      id,
      `id field is "${String(raw.id)}", expected "${id}"`,
    );
  if (raw.seed !== undefined) num(id, "seed", raw.seed);

  if (!isObj(raw.leg)) throw new LevelError(id, "leg must be an object");
  const leg = {
    startX: num(id, "leg.startX", raw.leg.startX),
    finishX: num(id, "leg.finishX", raw.leg.finishX),
  };
  if (leg.finishX <= leg.startX)
    throw new LevelError(id, "leg.finishX must be past leg.startX");

  const t = isObj(raw.terrain) ? raw.terrain : {};
  if (t.tileWeights !== undefined) {
    if (!isObj(t.tileWeights))
      throw new LevelError(id, "terrain.tileWeights must be an object");
    for (const k of Object.keys(t.tileWeights))
      if (!TILE_NAMES.has(k))
        throw new LevelError(id, `terrain.tileWeights: unknown tile "${k}"`);
  }
  const pins = (path: string, v: unknown): string[][] | undefined => {
    if (v === undefined) return undefined;
    if (!Array.isArray(v))
      throw new LevelError(id, `terrain.${path} must be string[][]`);
    return v.map((row, r) => tileNames(id, `terrain.${path}[${r}]`, row));
  };
  const terrain = {
    trenches: t.trenches === undefined ? true : t.trenches === true,
    pinnedStart: pins("pinnedStart", t.pinnedStart),
    pinnedEnd: pins("pinnedEnd", t.pinnedEnd),
    tileWeights: t.tileWeights as Record<string, number> | undefined,
  };

  if (!Array.isArray(raw.spawns))
    throw new LevelError(id, "spawns must be an array");
  const spawns = raw.spawns.map((s, i) => spawn(id, i, s));

  return {
    id,
    seed: raw.seed as number | undefined,
    leg,
    zones: zones(id, raw.zones),
    terrain,
    spawns,
  };
}
