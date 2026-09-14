/**
 * Fish-school vocabulary. Each profile is the *blueprint* a school hands to
 * `FaunaRenderer`: body size, palette, LOD ramp, and which draw strategy paints
 * one fish. The renderer knows none of this — it resolves `SPECIES[school.species]`
 * and runs `FISH_STRATEGIES[profile.draw]`.
 *
 * Add a fish species by adding a profile here and, if it needs a new body
 * shape, a strategy in `render/fauna/strategies.ts`. `SchoolSystem` (boids) and
 * `Snapshot` consume this unchanged — a school's `species` is assigned once at
 * spawn from the seeded rng, so it rebuilds deterministically and is never
 * serialized.
 *
 * Palette stays near-monochrome per the art direction: desaturated blue-greens
 * plus the one warm amber accent.
 */
import { C } from "./constants";

export interface SpeciesProfile {
  /** stable key; reserved for a future `fauna.<id>` codex/i18n lookup, same
   *  role as `Zone.id` / `Tile.name`. Not shown to the player yet. */
  id: string;
  /** key into `FISH_STRATEGIES` (`render/fauna/strategies.ts`) */
  draw: string;
  /** packed 0xRRGGBB — the single batched fill per school */
  baseColor: number;
  /** colour for the additive sonar-glow pass; defaults to `baseColor` */
  glowColor?: number;
  /** 0..1 per-school hue jitter toward `jitterColor`, keyed off the school x */
  jitter?: number;
  jitterColor?: number;
  /** body half-length / half-width in world units, before `cam.scale` */
  length: number;
  width: number;
  /** LOD ramp: `detail = smoothstep(lodLo, lodHi, cam.scale)`, 0 far → 1 near */
  lodLo: number;
  lodHi: number;
  /** which spawn pool this species is drawn from */
  habitat: "open" | "reef" | "deep" | "both";
  /** relative selection weight within its pool */
  weight: number;
  /** optional preferred depth band (world units); spawn skips a candidate
   *  school whose anchor falls outside. Omit = anywhere. */
  depth?: [number, number];
}

export const SPECIES: SpeciesProfile[] = [
  {
    id: "silver-baitball",
    draw: "forkedTail",
    baseColor: C.silver,
    jitter: 0.16,
    jitterColor: 0x8aa7b2,
    length: 8,
    width: 2.7,
    lodLo: 0.22,
    lodHi: 0.5,
    habitat: "both",
    weight: 3,
  },
  {
    id: "blue-dart",
    draw: "dart",
    baseColor: 0x8fb8d8,
    glowColor: 0x9fd0ea,
    length: 5,
    width: 1.6,
    lodLo: 0.3,
    lodHi: 0.7,
    habitat: "open",
    weight: 1.6,
  },
  {
    id: "reef-tang",
    draw: "forkedTail",
    baseColor: 0xe0b45c,
    glowColor: 0xffd27a,
    jitter: 0.22,
    jitterColor: 0xd98f4e,
    length: 7,
    width: 3,
    lodLo: 0.2,
    lodHi: 0.5,
    habitat: "reef",
    weight: 1.5,
    depth: [200, 1400],
  },
  {
    id: "ribbon-eel",
    draw: "eelRibbon",
    baseColor: 0x7ea8a0,
    glowColor: 0x9fd0c6,
    length: 9,
    width: 1.3,
    lodLo: 0.24,
    lodHi: 0.55,
    habitat: "reef",
    weight: 0.5,
  },
  {
    id: "eagle-ray",
    draw: "rayGlide",
    baseColor: 0x4a6b78,
    glowColor: 0x7fb0bd,
    length: 6,
    width: 5.5,
    lodLo: 0.16,
    lodHi: 0.42,
    habitat: "open",
    weight: 0.5,
  },
  {
    id: "moon-jelly",
    draw: "jellyBell",
    baseColor: 0xbcd8d6,
    glowColor: 0xd6efec,
    length: 4,
    width: 3.4,
    lodLo: 0.26,
    lodHi: 0.6,
    habitat: "open",
    weight: 0.6,
  },
  {
    id: "manta-giant",
    draw: "rayGlide",
    baseColor: 0x2c3e50,
    glowColor: 0x34495e,
    length: 14,
    width: 18, // wide wingspan
    lodLo: 0.1,
    lodHi: 0.35,
    habitat: "open",
    weight: 0.15, // rare, majestic
    depth: [50, 600],
  },
  {
    id: "parrotfish-green",
    draw: "bulkyFinned",
    baseColor: 0x1abc9c,
    glowColor: 0x16a085,
    jitter: 0.4,
    jitterColor: 0xf1c40f,
    length: 8.5,
    width: 4,
    lodLo: 0.2,
    lodHi: 0.6,
    habitat: "reef",
    weight: 1.2,
    depth: [50, 800],
  },
  {
    id: "abyssal-lantern",
    draw: "dart",
    baseColor: 0x111111,
    glowColor: 0xf39c12, // high-contrast glow for the dark zone
    length: 4,
    width: 1.2,
    lodLo: 0.35,
    lodHi: 0.8,
    habitat: "deep",
    weight: 2.0,
    depth: [3500, 9000],
  },
  {
    id: "vampire-squid",
    draw: "jellyBell", // umbrella-like drift, close enough to the jelly rig
    baseColor: 0x641e16,
    glowColor: 0xe74c3c,
    length: 7,
    width: 5,
    lodLo: 0.2,
    lodHi: 0.5,
    habitat: "deep",
    weight: 0.3,
    depth: [6000, 11000],
  },
];

/** id -> index, mirrors `TI` in `config/tiles.ts` */
export const SI: Record<string, number> = {};
SPECIES.forEach((s, i) => (SI[s.id] = i));

/** spawn pools by habitat (`"both"` species appear in both) */
export const OPEN_POOL: number[] = SPECIES.flatMap((s, i) =>
  s.habitat === "open" || s.habitat === "both" ? [i] : [],
);
export const REEF_POOL: number[] = SPECIES.flatMap((s, i) =>
  s.habitat === "reef" || s.habitat === "both" ? [i] : [],
);
/** deep-water species, spawned separately once the route passes the dark line */
export const DEEP_POOL: number[] = SPECIES.flatMap((s, i) =>
  s.habitat === "deep" ? [i] : [],
);
