/**
 * World-scale constants. 1 world unit = 0.1 m; the player whale is 280 units (28 m).
 *
 * Everything tunable about the *stage* lives here. Per-mechanic tuning lives next
 * to the system that owns it (see `systems/`), so adding a mechanic never means
 * editing this file.
 */
export const UNIT_M = 0.1;
export const WORLD_W = 120_000;

/** Depth (world units) where sunlight starts to fade / is fully gone. */
export const DARK_START = 900; // 90 m
export const DARK_FULL = 1800; // 180 m

/** Sun direction as horizontal run per unit of vertical drop: the light sits a
 * little off vertical, toward +x. God-rays and the shadows surface objects cast
 * both read from this so they agree on where "up toward the sun" is. */
export const SUN_LEAN = 0.12;

/** WFC cell width, and heightfield sample spacing, in world units. */
export const CELL = 1500;
export const COL = 24;
export const NCOL = Math.ceil(WORLD_W / COL) + 2;
export const NCELL = Math.ceil(WORLD_W / CELL);

/** Default deterministic seed. Override via `?seed=` query param. */
export const DEFAULT_SEED = 20_260_907;

/** Palette, shared by renderers. Hex numbers for Pixi. */
export const C = {
  abyss: 0x02040a,
  song: 0x9fe8d5,
  krill: 0xff9c5b,
  silver: 0xa9c2c8,
  coral: 0xff6f6b,
  coralGlow: 0xffb279,
  skin: 0x1d3040,
  belly: 0xc9d8d4,
  wildSkin: 0x6ba7b6,
  wildBelly: 0xbcd8d6,
  rock: 0x02050a,
  rockLit: 0x274a5c,
  hull: 0x151f27,
  foam: 0xcfe6e2,
  alarm: 0xd9603f,
} as const;
