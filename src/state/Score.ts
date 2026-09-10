/**
 * Arcade scoring: tricks, feeding flair, and route milestones. Tallied by
 * `ScoreSystem`, shown by `ScoreHud`, folded into the end card and the save.
 * Sits alongside `RunStats` — that stays the plain "what happened" run tally;
 * this is the point total and the flow chain.
 *
 * A plain data class, like every `state/*` store: `ScoreSystem` owns the rules.
 */
export interface ScoreAward {
  /** `clock.t` when it was banked — an order key, not wall-clock */
  at: number;
  /** points added, after the flow multiplier */
  points: number;
  /** display label, already localized */
  label: string;
}

export class Score {
  /** running total for the run */
  total = 0;
  /** highest single award this run, for the end card */
  best: ScoreAward | null = null;

  /** flow step: 0 = lone trick, climbs while the chain stays alive */
  comboStep = 0;
  /** resolved multiplier for `comboStep` (mirrors `COMBO_LADDER`) */
  comboMul = 1;
  /** `clock.t` at which the flow chain lapses */
  comboUntil = 0;

  /** the most recent award; the HUD picks it up when `awardSeq` changes */
  lastAward: ScoreAward | null = null;
  /** bumped on every award / milestone so the HUD can detect a fresh one */
  awardSeq = 0;

  /** one-shot latches for milestones already collected this run */
  readonly milestones = new Set<string>();

  reset(): void {
    this.total = 0;
    this.best = null;
    this.comboStep = 0;
    this.comboMul = 1;
    this.comboUntil = 0;
    this.lastAward = null;
    this.awardSeq = 0;
    this.milestones.clear();
  }
}
