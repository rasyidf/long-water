/**
 * Tuning for the deep-water squid harasser. Numbers only — the state machine is
 * in `systems/squid/SquidBrain.ts`, the pool management in `systems/SquidSystem.ts`.
 */
import { DARK_FULL } from "./constants";

/* ── where they live ──────────────────────────────────────────────────────── */

/** no squid before this world x — the shelf stays safe */
export const FIRST_LAIR_X = 26_000;
/** average spacing between seed-derived lairs (jittered ±40%) */
export const LAIR_SPACING = 9_000;
/** a lair activates (spawns its squid) when the whale is this close in x */
export const ACTIVATE_DX = 3_200;
/** …and despawns once the whale is this far past it */
export const DESPAWN_DX = 4_200;
/** hard cap on simultaneously active squid */
export const MAX_ACTIVE = 3;

/** lurk depth band, clamped above the seabed by `LAIR_FLOOR_GAP` */
export const LAIR_Y: [number, number] = [2400, 6200];
export const LAIR_FLOOR_GAP = 360;

/* ── senses & aggression ─────────────────────────────────────────────────── */

/** the whale must be at least this deep for a squid to commit to hunting */
export const HUNT_MIN_Y = DARK_FULL; // 1800 — into the dark
/** it can sense the whale within this range (and starts stalking) */
export const SENSE_RANGE = 2600;
/** gives up the stalk / bails a strike beyond this range */
export const LOSE_RANGE = 3800;
/** close enough, and lined up, to launch a strike */
export const STRIKE_RANGE = 900;
/** a strike that passes within this of the whale's centre connects */
export const GRAB_DIST = 150;

/** seconds a stalk can run before the squid re-evaluates / rests */
export const STALK_TIMEOUT = 14;
/** cooldown after a strike (hit or miss) before it will hunt again */
export const COOLDOWN = 22;
/** flow-combo step at/above which the squid is drawn in faster and rests less
 *  — showing off in the dark gets you noticed */
export const SHOWOFF_STEP = 2;

/* ── speeds (u/s) ────────────────────────────────────────────────────────── */

export const LURK_SPEED = 70;
export const STALK_SPEED = 240;
export const STRIKE_SPEED = 900;
export const FLEE_SPEED = 620;
export const TURN_RATE = 3.2; // rad/s, fed to clampTurn
/** sharper turns when aroused */
export const TURN_RATE_HUNT = 5.0;

/* ── latched: the cost of a passenger ────────────────────────────────────── */

/** reserves drained per second while latched, never below `ENERGY_FLOOR` — the
 *  squid alone can't end the run, it just makes it expensive */
export const DRAIN_ENERGY = 3;
export const ENERGY_FLOOR = 6;
/** breath burned per second while latched — hard, so it pushes you to surface
 *  (which is also how you shake it) */
export const DRAIN_BREATH = 4.5;
/** 0..1 grip written to `whale.grip` while latched (thrust loss + backward tug) */
export const GRIP = 0.85;
/** camera shake pulse while latched */
export const LATCH_SHAKE = 4;

/** struggle needed to throw the squid off */
export const STRUGGLE_BREAK = 10;
/** struggle from a player tail-kick while latched */
export const STRUGGLE_KICK = 3.2;
/** struggle per second from raw whale speed, scaled by speed/500 */
export const STRUGGLE_SPEED = 2.4;
/** struggle per second while the whale's head is near the surface */
export const STRUGGLE_SURFACE = 3.5;
/** struggle per second per pod follower within RAM_RANGE, mobbing the squid */
export const STRUGGLE_POD = 2.8;
/** a latched squid lets go on its own after this long regardless */
export const LATCH_MAX = 9;

/* ── pod defence ─────────────────────────────────────────────────────────── */

/** followers within this of a latched squid pile on (see PodBrain) */
export const RAM_RANGE = 900;
/** how hard PodBrain pulls a mobbing follower toward the squid */
export const RAM_PULL = 220;
