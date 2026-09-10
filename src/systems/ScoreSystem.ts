/**
 * The scoring rules. Listens on the bus for the things worth points — surface
 * tricks (`whale:breach` paired with `whale:reentry`), feeding passes, pod
 * growth, choruses — grades them, runs the flow (combo) chain, and polls the
 * whale's position for route / depth / close-pass milestones.
 *
 * Everything it awards goes back out as `score:award` / `score:milestone` for
 * the HUD. Adding a scored event (a squid dodged, a hazard threaded) is one
 * more `bus.on` here plus a row in `config/scoring.ts` — no other system moves.
 */
import { kmCovered } from "../config/route";
import {
  BELLY_FLOP,
  CLEAN_ARC,
  CLOSE_PASS_RANGE,
  CLOSE_PASS_SPEED,
  COMBO_LADDER,
  COMBO_WINDOW,
  DEPTH_MILESTONES,
  KM_MILESTONE_POINTS,
  KM_MILESTONE_STEP,
  POD_MILESTONES,
  POINTS,
} from "../config/scoring";
import type { GameContext } from "../core/GameContext";
import type { Vec2 } from "../core/math";
import type { System } from "../core/System";
import { t } from "../i18n";

export class ScoreSystem implements System {
  readonly name = "score";

  /** ships we're currently inside the close-pass window of, by array index */
  private readonly passing = new Set<number>();
  /** last km-milestone banked, so `update` only fires each step once */
  private lastKm = 0;

  init(ctx: GameContext): void {
    const { bus } = ctx;

    bus.on("whale:reentry", (r) => this.scoreTrick(ctx, r));

    bus.on("krill:fed", () =>
      this.award(ctx, POINTS.krillFeast, t("trick.feast")),
    );

    bus.on("pod:joined", ({ count }) => {
      this.award(ctx, POINTS.podJoin, t("trick.podJoin"));
      for (const [n, pts] of POD_MILESTONES) {
        if (count >= n) {
          this.milestone(ctx, `pod-${n}`, pts, t(`milestone.pod.${n}`));
        }
      }
    });

    bus.on("pod:chorus", () =>
      this.award(ctx, POINTS.chorus, t("trick.chorus")),
    );

    bus.on("game:restart", () => {
      ctx.score.reset();
      this.passing.clear();
      this.lastKm = 0;
    });
  }

  update(_dt: number, ctx: GameContext): void {
    const { score, clock, whale } = ctx;

    // flow chain lapses when nothing lands inside the window
    if (score.comboStep > 0 && clock.t >= score.comboUntil) {
      score.comboStep = 0;
      score.comboMul = 1;
    }

    // distance milestones — one per KM_MILESTONE_STEP covered
    const km = kmCovered(whale.x);
    if (km >= this.lastKm + KM_MILESTONE_STEP) {
      this.lastKm = Math.floor(km / KM_MILESTONE_STEP) * KM_MILESTONE_STEP;
      this.milestone(
        ctx,
        `km-${this.lastKm}`,
        KM_MILESTONE_POINTS,
        t("milestone.distance", { km: this.lastKm }),
      );
    }

    // depth milestones — deepest point reached, latched
    for (const [id, minY, pts] of DEPTH_MILESTONES) {
      if (whale.y >= minY) {
        this.milestone(ctx, `depth-${id}`, pts, t(`milestone.depth.${id}`));
      }
    }

    this.checkClosePass(ctx);
  }

  /** award a close pass the first frame the whale enters a hull's window at
   *  speed; clear the latch once it's well clear again */
  private checkClosePass(ctx: GameContext): void {
    const { ships, whale } = ctx;
    const nearSurface = whale.y < 300 && whale.y > -500;

    ships.ships.forEach((s, i) => {
      const dx = Math.abs(whale.x - s.x);
      const inWindow = dx < CLOSE_PASS_RANGE && nearSurface;

      if (inWindow && !this.passing.has(i)) {
        this.passing.add(i);
        if (whale.speed > CLOSE_PASS_SPEED) {
          this.award(ctx, POINTS.closePass, t("trick.closePass"), {
            x: whale.x,
            y: Math.max(0, whale.y),
          });
        }
      } else if (!inWindow && dx > CLOSE_PASS_RANGE * 2) {
        this.passing.delete(i);
      }
    });
  }

  /** grade a completed surface trick from the exit/re-entry pair */
  private scoreTrick(
    ctx: GameContext,
    r: {
      airtime: number;
      entrySpeed: number;
      turns: number;
      cleanArc: number;
      pos: Vec2;
    },
  ): void {
    // airtime as 0..1: ~0.4 s is a bare hop, ~1.4 s is a towering breach
    const air = Math.max(0, Math.min(1, (r.airtime - 0.4) / 1));
    const turns = r.turns;

    let pts = POINTS.breachBase * (0.4 + 0.6 * air) + turns * POINTS.perFlip;

    let label: string;
    if (turns >= 3) label = t("trick.flip3");
    else if (turns === 2) label = t("trick.flip2");
    else if (turns === 1) label = t("trick.flip1");
    else label = air > 0.6 ? t("trick.breachBig") : t("trick.breach");

    const parts = [label];
    if (turns > 0 && r.cleanArc >= CLEAN_ARC) {
      pts += POINTS.cleanEntry;
      parts.push(t("trick.clean"));
    } else if (turns > 0 && r.cleanArc <= BELLY_FLOP) {
      pts *= POINTS.bellyFlopMul;
      parts.push(t("trick.bellyFlop"));
    }

    for (const sw of ctx.krill.swarms) {
      if (sw.amount > 5 && Math.abs(sw.x - r.pos.x) < sw.r0 + 120) {
        pts += POINTS.splashFeast;
        parts.push(t("trick.splashFeast"));
        break;
      }
    }

    this.award(ctx, Math.round(pts), parts.join(" · "), r.pos);
  }

  /** advance the flow chain and bank `base` points times the multiplier */
  private award(
    ctx: GameContext,
    base: number,
    label: string,
    pos?: Vec2,
  ): void {
    const { score, clock, bus } = ctx;

    const alive = clock.t < score.comboUntil;
    score.comboStep = alive
      ? Math.min(score.comboStep + 1, COMBO_LADDER.length - 1)
      : 0;
    score.comboMul = COMBO_LADDER[score.comboStep];
    score.comboUntil = clock.t + COMBO_WINDOW;

    const points = Math.round(base * score.comboMul);
    score.total += points;

    const aw = { at: clock.t, points, label };
    score.lastAward = aw;
    score.awardSeq++;
    if (!score.best || points > score.best.points) score.best = aw;

    bus.emit("score:award", { points, label, mult: score.comboMul, pos });
  }

  /** bank a one-shot milestone (no flow multiplier, no `best` contention) */
  private milestone(
    ctx: GameContext,
    id: string,
    points: number,
    label: string,
  ): void {
    const { score, bus, clock } = ctx;
    if (score.milestones.has(id)) return;
    score.milestones.add(id);
    score.total += points;
    score.lastAward = { at: clock.t, points, label };
    score.awardSeq++;
    bus.emit("score:milestone", { id, label, points });
  }
}
