/**
 * Persistent player progress — the almanac's discovered creatures, earned
 * trophies, and lifetime records. Lives for the whole page session (unlike every
 * other `state/*` store, which is rebuilt each run) and is written through to
 * `localStorage["long-water:profile"]` on every change.
 *
 * `AlmanacSystem` writes it during a run; the title screen and the almanac read
 * it. A plain data class: the rules for *when* something unlocks live in the
 * system, the list of what can unlock lives in `config/almanac.ts`.
 */
const KEY = "long-water:profile";
const VERSION = 1;

interface ProfileData {
  v: number;
  /** creature ids seen at least once */
  seen: string[];
  /** trophy id -> `Date.now()` it was earned */
  trophies: Record<string, number>;
  crossings: number;
  bestScore: number;
  /** furthest distance covered in one run, km */
  bestKm: number;
}

function blank(): ProfileData {
  return {
    v: VERSION,
    seen: [],
    trophies: {},
    crossings: 0,
    bestScore: 0,
    bestKm: 0,
  };
}

function read(): ProfileData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<ProfileData>;
      if (d.v === VERSION) return { ...blank(), ...d };
    }
  } catch {
    /* corrupt or unavailable — start fresh */
  }
  return blank();
}

export class Profile {
  private data = read();
  private seenSet = new Set(this.data.seen);

  get crossings(): number {
    return this.data.crossings;
  }
  get bestScore(): number {
    return this.data.bestScore;
  }
  get bestKm(): number {
    return this.data.bestKm;
  }

  hasSeen(id: string): boolean {
    return this.seenSet.has(id);
  }

  /** mark a creature seen; true only the first time */
  discover(id: string): boolean {
    if (this.seenSet.has(id)) return false;
    this.seenSet.add(id);
    this.data.seen.push(id);
    this.write();
    return true;
  }

  hasTrophy(id: string): boolean {
    return id in this.data.trophies;
  }

  trophyAt(id: string): number | undefined {
    return this.data.trophies[id];
  }

  /** award a trophy; true only the first time */
  unlock(id: string): boolean {
    if (this.hasTrophy(id)) return false;
    this.data.trophies[id] = Date.now();
    this.write();
    return true;
  }

  /** fold a finished (or abandoned) run into the lifetime records */
  recordRun(score: number, km: number, won: boolean): void {
    this.data.bestScore = Math.max(this.data.bestScore, score);
    this.data.bestKm = Math.max(this.data.bestKm, km);
    if (won) this.data.crossings++;
    this.write();
  }

  /** wipe everything — the options panel's "reset progress" */
  reset(): void {
    this.data = blank();
    this.seenSet.clear();
    this.write();
  }

  private write(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable — progress just won't persist */
    }
  }
}
