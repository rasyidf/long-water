/**
 * What the almanac can hold: every creature the player can come across and
 * every trophy they can earn. Pure data — `AlmanacSystem` owns the unlock
 * rules, `menu/Almanac.ts` renders the book, `state/Profile.ts` remembers what
 * has been found. Copy lives under `almanac.<id>.*` / `trophy.<id>.*` in the
 * i18n tables.
 *
 * Fish entries come straight from `SPECIES`, so a new species shows up here
 * (with art matched to its draw strategy) without touching this file — it only
 * needs its `almanac.<id>.*` strings.
 */
import { SPECIES } from "./species";

export type CreatureGroup =
  "whale" | "prey" | "fish" | "predator" | "reef" | "human";

export interface CreatureEntry {
  id: string;
  group: CreatureGroup;
}

/** `Coral.kind` index -> almanac id (see `state/Fauna.ts`) */
export const CORAL_IDS = [
  "sea-fan",
  "staghorn",
  "brain-coral",
  "tube-sponge",
  "sea-whip",
  "anemone",
  "table-coral",
] as const;

/** book order: the whales, what they eat, what swims past, what hunts, the
 *  reef, and the ships */
export const CREATURES: CreatureEntry[] = [
  { id: "blue-whale", group: "whale" },
  { id: "pod-whale", group: "whale" },
  { id: "krill", group: "prey" },
  ...SPECIES.map((s): CreatureEntry => ({ id: s.id, group: "fish" })),
  { id: "squid", group: "predator" },
  ...CORAL_IDS.map((id): CreatureEntry => ({ id, group: "reef" })),
  { id: "ship", group: "human" },
];

export type TrophyTier = "bronze" | "silver" | "gold";

export interface TrophyEntry {
  id: string;
  tier: TrophyTier;
}

/** book order, roughly in the order a new player earns them */
export const TROPHIES: TrophyEntry[] = [
  { id: "first-breath", tier: "bronze" },
  { id: "first-feast", tier: "bronze" },
  { id: "breach", tier: "bronze" },
  { id: "backflip", tier: "bronze" },
  { id: "belly-flop", tier: "bronze" },
  { id: "tail-slapper", tier: "bronze" },
  { id: "parasite-cleansed", tier: "bronze" },
  { id: "pod-begins", tier: "bronze" },
  { id: "growing-pod", tier: "bronze" },
  { id: "twilight-zone", tier: "bronze" },
  { id: "into-dark", tier: "bronze" },
  { id: "clean-entry", tier: "silver" },
  { id: "perfect-apex", tier: "silver" },
  { id: "chorus", tier: "silver" },
  { id: "slipstream-rider", tier: "silver" },
  { id: "close-pass", tier: "silver" },
  { id: "squid-dodge", tier: "silver" },
  { id: "predator-shaken", tier: "silver" },
  { id: "glutton", tier: "silver" },
  { id: "flow-master", tier: "silver" },
  { id: "grand-pod", tier: "silver" },
  { id: "abyssal-voyager", tier: "silver" },
  { id: "triple", tier: "gold" },
  { id: "kinetic-release", tier: "gold" },
  { id: "deep-water", tier: "gold" },
  { id: "full-pod", tier: "gold" },
  { id: "super-pod", tier: "gold" },
  { id: "hadal-descent", tier: "gold" },
  { id: "pod-defense", tier: "gold" },
  { id: "crossing", tier: "gold" },
  { id: "escort", tier: "gold" },
  { id: "high-score", tier: "gold" },
  { id: "naturalist", tier: "gold" },
];

/** swarms fed on in one run for `glutton` */
export const GLUTTON_SWARMS = 12;
/** whales still behind you at the finish for `escort` */
export const ESCORT_FOLLOWERS = 3;
/** points in one run for `high-score` */
export const HIGH_SCORE = 10000;
