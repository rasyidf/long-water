/**
 * Declarative description of every spawn directive's editable scalar fields,
 * kept alongside `world/level/schema.ts`. `SpawnEditor.svelte` renders these
 * generically; anything not listed here (`items` arrays for `place` mode,
 * nested `reef` / `calf` objects) falls back to a JSON sub-editor.
 */
export type FieldKind = "num" | "range" | "tiles";

export interface FieldSpec {
  key: string;
  kind: FieldKind;
  optional?: boolean;
}

/** keyed by `"<kind>:<mode>"` (snow has no mode → just `"snow"`) */
export const SPAWN_FIELDS: Record<string, FieldSpec[]> = {
  "krill:scatter": [
    { key: "from", kind: "num" },
    { key: "to", kind: "num" },
    { key: "step", kind: "range" },
    { key: "yBand", kind: "range" },
    { key: "floorGap", kind: "num" },
    { key: "minY", kind: "num", optional: true },
    { key: "r", kind: "range" },
    { key: "skipTiles", kind: "tiles", optional: true },
  ],
  "krill:place": [],
  "school:scatter": [
    { key: "from", kind: "num" },
    { key: "to", kind: "num" },
    { key: "step", kind: "range" },
    { key: "count", kind: "num" },
    { key: "yTop", kind: "num" },
    { key: "floorGap", kind: "num" },
    { key: "yClamp", kind: "range" },
    { key: "spread", kind: "range", optional: true },
    { key: "vel", kind: "range", optional: true },
  ],
  "school:place": [],
  "whale:scatter": [
    { key: "from", kind: "num" },
    { key: "to", kind: "num" },
    { key: "step", kind: "range" },
    { key: "y", kind: "range" },
    { key: "age", kind: "range" },
    { key: "vx", kind: "range" },
    { key: "size", kind: "range" },
  ],
  "whale:place": [
    { key: "vx", kind: "range" },
    { key: "size", kind: "range" },
    { key: "age", kind: "range" },
  ],
  "ship:scatter": [
    { key: "from", kind: "num" },
    { key: "to", kind: "num" },
    { key: "step", kind: "range" },
    { key: "v", kind: "range" },
    { key: "len", kind: "range" },
  ],
  "ship:place": [],
  "coral:scatter": [
    { key: "from", kind: "num" },
    { key: "to", kind: "num" },
    { key: "onTiles", kind: "tiles" },
    { key: "maxFloor", kind: "num" },
    { key: "patchCount", kind: "range" },
    { key: "spacing", kind: "range" },
    { key: "patchDropFloor", kind: "num" },
    { key: "kinds", kind: "num" },
    { key: "scale", kind: "range" },
    { key: "gap", kind: "range" },
    { key: "skipGap", kind: "range" },
  ],
  "coral:place": [],
  "squid:scatter": [
    { key: "from", kind: "num" },
    { key: "to", kind: "num" },
    { key: "step", kind: "range" },
    { key: "yBand", kind: "range" },
    { key: "floorGap", kind: "num" },
    { key: "size", kind: "range" },
  ],
  "squid:place": [],
  snow: [
    { key: "count", kind: "num" },
    { key: "area", kind: "range", optional: true },
    { key: "s", kind: "range", optional: true },
    { key: "d", kind: "range", optional: true },
  ],
};

export const SPAWN_KINDS = [
  "krill",
  "school",
  "whale",
  "ship",
  "coral",
  "squid",
  "snow",
] as const;

/** a fresh directive of the given kind+mode with sensible defaults */
export function blankSpawn(kind: string, mode: "scatter" | "place"): unknown {
  if (kind === "snow") return { kind, count: 200, area: [4000, 4000] };
  if (mode === "place") return { kind, mode, items: [] };
  const base: Record<string, unknown> = {
    kind,
    mode,
    from: 2000,
    to: 100000,
    step: [5000, 9000],
  };
  const extra: Record<string, Record<string, unknown>> = {
    krill: { yBand: [1250, 2600], floorGap: 420, r: [300, 560] },
    school: { count: 30, yTop: 300, floorGap: 500, yClamp: [200, 3200] },
    whale: { y: [500, 1700], age: [0.8, 1], vx: [-30, 10], size: [0.9, 1.06] },
    ship: { v: [-70, 70], len: [900, 1900] },
    squid: { yBand: [2200, 3200], floorGap: 200, size: [0.9, 1.2] },
    coral: {
      onTiles: ["shelf"],
      maxFloor: 1150,
      patchCount: [2, 6],
      spacing: [60, 200],
      patchDropFloor: 1600,
      kinds: 7,
      scale: [0.75, 1.7],
      gap: [1600, 4800],
      skipGap: [400, 1100],
    },
  };
  if (kind === "coral") delete base.step;
  return { ...base, ...extra[kind] };
}
