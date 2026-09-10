/**
 * Discovers every `src/world/levels/*.json` at build time and resolves the one
 * the run should use (`?level=`, default `crossing`).
 */
import type { LevelDef } from "./schema";
import { parseLevel } from "./validate";

const RAW = import.meta.glob<unknown>("../levels/*.json", {
  eager: true,
  import: "default",
});

const byId: Record<string, unknown> = {};
for (const [path, mod] of Object.entries(RAW)) {
  const id = path.slice(path.lastIndexOf("/") + 1).replace(/\.json$/, "");
  byId[id] = mod;
}

export function levelIds(): string[] {
  return Object.keys(byId);
}

export function resolveLevelId(): string {
  return new URLSearchParams(location.search).get("level") || "crossing";
}

export function loadLevelDef(id: string): LevelDef {
  const raw = byId[id];
  if (raw === undefined)
    throw new Error(
      `unknown level "${id}" (have: ${levelIds().join(", ") || "none"})`,
    );
  return parseLevel(raw, id);
}
