/**
 * Save / load. Captures the dynamic run state (not the generated world, which
 * is deterministic from the seed) into a plain JSON object and restores it by
 * mutating the stores in place.
 *
 * Entity arrays are matched by index — a load only makes sense against the same
 * seed, so the world and its entity counts are identical.
 */
import type { GameContext } from "../core/GameContext";
import { makeChain } from "../core/SpineChain";
import type { PodState } from "./Pod";

const KEY = "long-water:save";
const VERSION = 1;

interface SaveData {
  v: number;
  seed: number;
  savedAt: number;
  stats: {
    answered: number;
    joined: number;
    lost: number;
    fed: number;
    chorus: number;
    shown: string[];
  };
  whale: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: number;
    wag: number;
    breath: number;
    energy: number;
    drowning: number;
    alive: boolean;
    done: boolean;
  };
  pod: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    state: PodState;
    lit: number;
    replyAt: number;
    cool: number;
    heard: boolean;
    answeredUntil: number;
    slot: number;
    stress: number;
    hunger: number;
    nextSong: number;
    wag: number;
  }>;
  krill: Array<{ x: number; baseY: number; amount: number }>;
  schools: Array<{
    fish: Array<{ x: number; y: number; vx: number; vy: number }>;
  }>;
  ships: Array<{ x: number }>;
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function save(ctx: GameContext): boolean {
  const data: SaveData = {
    v: VERSION,
    seed: ctx.rng.seedValue,
    savedAt: Date.now(),
    stats: {
      answered: ctx.stats.answered,
      joined: ctx.stats.joined,
      lost: ctx.stats.lost,
      fed: ctx.stats.fed,
      chorus: ctx.stats.chorus,
      shown: [...ctx.stats.shown],
    },
    whale: {
      x: ctx.whale.x,
      y: ctx.whale.y,
      vx: ctx.whale.vx,
      vy: ctx.whale.vy,
      facing: ctx.whale.facing,
      wag: ctx.whale.wag,
      breath: ctx.whale.breath,
      energy: ctx.whale.energy,
      drowning: ctx.whale.drowning,
      alive: ctx.whale.alive,
      done: ctx.whale.done,
    },
    pod: ctx.pod.whales.map((w) => ({
      x: w.x,
      y: w.y,
      vx: w.vx,
      vy: w.vy,
      state: w.state,
      lit: w.lit,
      replyAt: w.replyAt,
      cool: w.cool,
      heard: w.heard,
      answeredUntil: w.answeredUntil,
      slot: w.slot,
      stress: w.stress,
      hunger: w.hunger,
      nextSong: w.nextSong,
      wag: w.wag,
    })),
    krill: ctx.krill.swarms.map((s) => ({
      x: s.x,
      baseY: s.baseY,
      amount: s.amount,
    })),
    schools: ctx.schools.schools.map((sc) => ({
      fish: sc.fish.map((f) => ({ x: f.x, y: f.y, vx: f.vx, vy: f.vy })),
    })),
    ships: ctx.ships.ships.map((s) => ({ x: s.x })),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function load(ctx: GameContext): boolean {
  let data: SaveData;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    data = JSON.parse(raw) as SaveData;
  } catch {
    return false;
  }
  if (data.v !== VERSION || data.seed !== ctx.rng.seedValue) return false;

  Object.assign(ctx.stats, {
    answered: data.stats.answered,
    joined: data.stats.joined,
    lost: data.stats.lost,
    fed: data.stats.fed,
    chorus: data.stats.chorus,
  });
  ctx.stats.shown.clear();
  for (const k of data.stats.shown) ctx.stats.shown.add(k);

  Object.assign(ctx.whale, data.whale);
  ctx.whale.trail.reset(ctx.whale.x, ctx.whale.y);
  const head = makeChain(ctx.whale.x, ctx.whale.y);
  head.forEach((p, i) => {
    ctx.whale.spineBase[i].x = p.x;
    ctx.whale.spineBase[i].y = p.y;
    ctx.whale.spine[i].x = p.x;
    ctx.whale.spine[i].y = p.y;
  });

  data.pod.forEach((s, i) => {
    const w = ctx.pod.whales[i];
    if (!w) return;
    Object.assign(w, s);
    w.base = null; // PodSystem re-seeds a follower's chain from the wake
    w.spine = null;
  });

  data.krill.forEach((s, i) => {
    const sw = ctx.krill.swarms[i];
    if (!sw) return;
    sw.x = s.x;
    sw.baseY = s.baseY;
    sw.y = s.baseY;
    sw.amount = s.amount;
    sw.panic = 0;
    sw.lit = 0;
    sw.r = sw.r0;
  });

  data.schools.forEach((sc, i) => {
    const store = ctx.schools.schools[i];
    if (!store) return;
    sc.fish.forEach((f, j) => {
      if (store.fish[j]) Object.assign(store.fish[j], f);
    });
    store.lit = 0;
  });

  data.ships.forEach((s, i) => {
    if (ctx.ships.ships[i]) ctx.ships.ships[i].x = s.x;
  });

  ctx.song.pings.length = 0;
  ctx.particles.bubbles.length = 0;
  return true;
}
