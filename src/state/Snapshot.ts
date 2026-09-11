/**
 * Save / load. Captures the dynamic run state (not the generated world, which
 * is deterministic from the seed) into a plain JSON object and restores it by
 * mutating the stores in place.
 *
 * Entity arrays are matched by index — a load only makes sense against the same
 * seed, so the world and its entity counts are identical.
 */
import type { GameContext } from "../core/GameContext";
import { getLevel } from "../world/level/active";
import type { PodState } from "./Pod";
import type { ScoreAward } from "./Score";
import { saveBody, type WhaleBodySave } from "./WhaleBody";

const KEY = "long-water:save";
const VERSION = 7; // bumped: carries the score layer

interface SaveData {
  v: number;
  seed: number;
  level: string;
  savedAt: number;
  stats: {
    answered: number;
    joined: number;
    lost: number;
    fed: number;
    chorus: number;
    shown: string[];
  };
  score: {
    total: number;
    best: ScoreAward | null;
    milestones: string[];
  };
  whale: {
    body: WhaleBodySave;
    breath: number;
    energy: number;
    drowning: number;
    alive: boolean;
    done: boolean;
  };
  pod: Array<{
    body: WhaleBodySave;
    state: PodState;
    lit: number;
    replyAt: number;
    cool: number;
    heard: boolean;
    answeredUntil: number;
    slot: number;
    stress: number;
    hunger: number;
    breath: number;
    surfacing: boolean;
    nextSong: number;
  }>;
  krill: Array<{ x: number; baseY: number; amount: number }>;
  schools: Array<{
    fish: Array<{ x: number; y: number; vx: number; vy: number }>;
  }>;
  ships: Array<{ x: number }>;
}

/** What the title screen needs to offer Continue: which world to rebuild the
 *  save against, and a one-line summary. */
export interface SaveMeta {
  level: string;
  seed: number;
  savedAt: number;
  score: number;
  /** whale world-x, for the distance readout */
  x: number;
}

/** the current slot's header, or null if there is none / it's from an older
 *  schema / it holds a run that already ended */
export function saveMeta(): SaveMeta | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SaveData;
    if (d.v !== VERSION || !d.whale.alive || d.whale.done) return null;
    return {
      level: d.level,
      seed: d.seed,
      savedAt: d.savedAt,
      score: d.score.total,
      x: d.whale.body.x,
    };
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

export function save(ctx: GameContext): boolean {
  const data: SaveData = {
    v: VERSION,
    seed: ctx.rng.seedValue,
    level: getLevel().id,
    savedAt: Date.now(),
    stats: {
      answered: ctx.stats.answered,
      joined: ctx.stats.joined,
      lost: ctx.stats.lost,
      fed: ctx.stats.fed,
      chorus: ctx.stats.chorus,
      shown: [...ctx.stats.shown],
    },
    score: {
      total: ctx.score.total,
      best: ctx.score.best,
      milestones: [...ctx.score.milestones],
    },
    whale: {
      body: saveBody(ctx.whale.body),
      breath: ctx.whale.breath,
      energy: ctx.whale.energy,
      drowning: ctx.whale.drowning,
      alive: ctx.whale.alive,
      done: ctx.whale.done,
    },
    pod: ctx.pod.whales.map((w) => ({
      body: saveBody(w.body),
      state: w.state,
      lit: w.lit,
      replyAt: w.replyAt,
      cool: w.cool,
      heard: w.heard,
      answeredUntil: w.answeredUntil,
      slot: w.slot,
      stress: w.stress,
      hunger: w.hunger,
      breath: w.breath,
      surfacing: w.surfacing,
      nextSong: w.nextSong,
    })),
    krill: ctx.krill.swarms.map((s) => ({
      x: s.x,
      baseY: s.baseY,
      amount: s.amount,
    })),
    // `species` is spawn-derived (seeded rng), not serialized — it rebuilds
    // with the world before any load runs
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
  if (
    data.v !== VERSION ||
    data.seed !== ctx.rng.seedValue ||
    data.level !== getLevel().id
  )
    return false;

  Object.assign(ctx.stats, {
    answered: data.stats.answered,
    joined: data.stats.joined,
    lost: data.stats.lost,
    fed: data.stats.fed,
    chorus: data.stats.chorus,
  });
  ctx.stats.shown.clear();
  for (const k of data.stats.shown) ctx.stats.shown.add(k);

  ctx.score.reset();
  ctx.score.total = data.score.total;
  ctx.score.best = data.score.best;
  for (const m of data.score.milestones) ctx.score.milestones.add(m);

  const wb = ctx.whale.body;
  Object.assign(wb, data.whale.body);
  ctx.whale.breath = data.whale.breath;
  ctx.whale.energy = data.whale.energy;
  ctx.whale.drowning = data.whale.drowning;
  ctx.whale.alive = data.whale.alive;
  ctx.whale.done = data.whale.done;
  ctx.whale.trail.reset(wb.x, wb.y);
  wb.resetChains();

  data.pod.forEach((s, i) => {
    const w = ctx.pod.whales[i];
    if (!w) return;
    const { body, ...rest } = s;
    Object.assign(w.body, body);
    Object.assign(w, rest);
    w.body.resetChains();
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
    store.shelter = 0;
  });

  data.ships.forEach((s, i) => {
    if (ctx.ships.ships[i]) ctx.ships.ships[i].x = s.x;
  });

  ctx.song.pings.length = 0;
  ctx.particles.bubbles.length = 0;
  // squid are level-placed and not serialized — settle them back to a dormant
  // lurk at their lairs and drop any grapple
  ctx.squid.rest();
  ctx.whale.grip = 0;
  return true;
}
