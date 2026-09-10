/**
 * Tuning for the deep-water squid. Numbers only — the state machine is in
 * `systems/squid/SquidBrain.ts`, the store stepping in `systems/SquidSystem.ts`.
 *
 * Design intent: this is a calm game. A squid is a rare, atmospheric deep-water
 * moment, not a fight. It lurks where the level puts it (`squid` spawn
 * directive), only takes an interest if the whale lingers deep and close, gives
 * one slow telegraphed lunge, and is easily seen off — by singing at it, by
 * carrying speed, by rising toward the light, or by the pod. After one attempt
 * it retreats for good.
 */
import { DARK_FULL } from "./constants";

/* ── senses ──────────────────────────────────────────────────────────────── */

/** the whale must be at least this deep before a squid takes any interest */
export const HUNT_MIN_Y = DARK_FULL; // 1800 — into the true dark
/** it only notices the whale this close */
export const SENSE_RANGE = 1400;
/** loses interest / bails a lunge past this range */
export const LOSE_RANGE = 2400;
/** close enough to line up a lunge */
export const STRIKE_RANGE = 620;
/** a lunge passing within this of the whale's centre connects */
export const GRAB_DIST = 130;
/** a friendly song ring within this of a stalking squid sends it fleeing —
 *  the player's calm counter-play */
export const SONG_SCARE_RANGE = 1700;

/** cull squid stepping past this from the camera (they idle off-screen) */
export const CULL_DX = 5000;

/* ── patience & commitment ──────────────────────────────────────────────── */

/** must shadow at least this long before it will commit to a lunge */
export const SHADOW_TIME = 5;
/** arousal climbs this fast while stalking (0..1); slow so the stalk reads */
export const AROUSAL_RATE = 0.22;
/** arousal needed to commit the lunge */
export const STRIKE_AROUSAL = 0.9;
/** a stalk that drags on this long is abandoned */
export const STALK_TIMEOUT = 11;
/** after one attempt (hit or miss) a squid rests this long — effectively the
 *  rest of the run */
export const COOLDOWN = 240;

/* ── speeds (u/s) — unhurried ───────────────────────────────────────────── */

export const LURK_SPEED = 55;
export const STALK_SPEED = 165;
export const STRIKE_SPEED = 600;
export const FLEE_SPEED = 520;
export const TURN_RATE = 3.0; // rad/s, fed to clampTurn
export const TURN_RATE_HUNT = 4.2;

/* ── latched: brief and shakeable ──────────────────────────────────────── */

/** reserves drained per second while latched, never below `ENERGY_FLOOR` */
export const DRAIN_ENERGY = 1.6;
export const ENERGY_FLOOR = 12;
/** breath burned per second while latched */
export const DRAIN_BREATH = 2.5;
/** 0..1 grip written to `whale.grip` (thrust loss + a light backward tug) */
export const GRIP = 0.5;
/** camera-shake pulses while latched */
export const LATCH_SHAKE = 3;

/** struggle that throws the squid off */
export const STRUGGLE_BREAK = 5;
/** from one player tail-kick */
export const STRUGGLE_KICK = 2.4;
/** per second from raw whale speed (scaled by speed/500) */
export const STRUGGLE_SPEED = 1.8;
/** per second while the whale's head is near the surface */
export const STRUGGLE_SURFACE = 5;
/** per second per pod follower mobbing within `RAM_RANGE` */
export const STRUGGLE_POD = 3.5;
/** it lets go on its own after this long regardless */
export const LATCH_MAX = 4;

/* ── pod defence ───────────────────────────────────────────────────────── */

/** followers within this of a latched squid pile on (see PodBrain) */
export const RAM_RANGE = 900;
/** how hard PodBrain pulls a mobbing follower toward the squid */
export const RAM_PULL = 220;

/* ── spawn defaults (used by the level emitter) ────────────────────────── */

/** default individual size range if a spawn item doesn't give one */
export const SIZE: [number, number] = [0.85, 1.2];
/** scatter: keep a lair at least this far above the seabed */
export const LAIR_FLOOR_GAP = 300;
