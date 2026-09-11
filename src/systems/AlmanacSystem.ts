/**
 * Fills the almanac. Listens to the run's events for trophies and, a few times
 * a second, scans what's on screen (and lit well enough to make out) for
 * creatures the player hasn't met yet. Everything it finds is written straight
 * to the persistent `Profile` and announced as `almanac:unlocked`; `fresh`
 * keeps this run's finds for the end card.
 *
 * The unlock rules live here; the list of what can unlock is
 * `config/almanac.ts`. Trophy thresholds that duplicate a score milestone key
 * off that milestone's id instead of re-measuring.
 */
import {
  CORAL_IDS,
  CREATURES,
  ESCORT_FOLLOWERS,
  GLUTTON_SWARMS,
  HIGH_SCORE,
} from "../config/almanac";
import { kmCovered } from "../config/route";
import { BELLY_FLOP, CLEAN_ARC, COMBO_LADDER } from "../config/scoring";
import { SPECIES } from "../config/species";
import type { GameContext } from "../core/GameContext";
import { lightAt } from "../core/light";
import type { System } from "../core/System";
import type { Profile } from "../state/Profile";

/** seconds between on-screen discovery scans */
const SCAN_EVERY = 0.25;
/** light (or sonar glow) a creature needs before it counts as seen */
const SEEN_LIGHT = 0.12;

/** score milestone id -> trophy id */
const MILESTONE_TROPHY: Record<string, string> = {
  "pod-1": "pod-begins",
  "pod-6": "full-pod",
  "depth-dark": "into-dark",
  "depth-deep": "deep-water",
};

export interface AlmanacFind {
  kind: "creature" | "trophy";
  id: string;
}

export class AlmanacSystem implements System {
  readonly name = "almanac";

  /** everything first unlocked during this run, in the order it happened */
  readonly fresh: AlmanacFind[] = [];

  private ctx!: GameContext;
  private scanIn = 0;
  private started = false;
  private settled = false;

  constructor(private readonly profile: Profile) {}

  init(ctx: GameContext): void {
    this.ctx = ctx;
    const { bus } = ctx;

    bus.on("game:start", () => {
      this.started = true;
      this.trophy("first-breath");
      this.creature("blue-whale");
    });

    bus.on("whale:breach", () => this.trophy("breach"));
    bus.on("whale:reentry", ({ turns, cleanArc }) => {
      if (turns >= 1) this.trophy("backflip");
      if (turns >= 3) this.trophy("triple");
      if (turns > 0 && cleanArc >= CLEAN_ARC) this.trophy("clean-entry");
      else if (turns > 0 && cleanArc <= BELLY_FLOP) this.trophy("belly-flop");
    });

    bus.on("krill:fed", () => {
      this.creature("krill");
      this.trophy("first-feast");
      if (ctx.stats.fed >= GLUTTON_SWARMS) this.trophy("glutton");
    });

    bus.on("pod:answered", () => this.creature("pod-whale"));
    bus.on("pod:chorus", () => this.trophy("chorus"));

    bus.on("score:milestone", ({ id }) => {
      const tr = MILESTONE_TROPHY[id];
      if (tr) this.trophy(tr);
    });
    bus.on("score:award", ({ kind }) => {
      if (kind === "closePass") {
        this.trophy("close-pass");
        this.creature("ship");
      }
      if (ctx.score.comboStep >= COMBO_LADDER.length - 1) this.trophy("flow");
    });

    bus.on("squid:grab", () => this.creature("squid"));
    bus.on("squid:evaded", () => {
      this.creature("squid");
      this.trophy("squid-dodge");
    });
    bus.on("squid:struck", ({ byPod }) => {
      this.creature("squid");
      this.trophy(byPod ? "pod-defense" : "predator-shaken");
    });

    bus.on("game:over", ({ won }) => {
      if (won) {
        this.trophy("crossing");
        if (ctx.pod.followers().length >= ESCORT_FOLLOWERS)
          this.trophy("escort");
      }
      this.settle(won);
    });
  }

  update(dt: number, ctx: GameContext): void {
    this.scanIn -= dt;
    if (this.scanIn > 0) return;
    this.scanIn = SCAN_EVERY;

    if (ctx.score.total >= HIGH_SCORE) this.trophy("high-score");

    const { camera: cam, krill, schools, coral, squid, ships, pod } = ctx;
    const [x0, x1] = cam.visibleX(0);
    const halfH = cam.vh / 2 / cam.scale;
    const y0 = cam.y - halfH;
    const y1 = cam.y + halfH;
    const onScreen = (x: number, y: number): boolean =>
      x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const seen = (x: number, y: number, glow = 0): boolean =>
      onScreen(x, y) && Math.max(lightAt(y), glow) > SEEN_LIGHT;

    for (const s of krill.swarms)
      if (s.amount > 0 && seen(s.x, s.y, s.lit)) this.creature("krill");
    for (const sc of schools.schools)
      if (seen(sc.x, sc.y, sc.lit)) this.creature(SPECIES[sc.species].id);
    for (const c of coral.items)
      if (seen(c.x, c.y)) this.creature(CORAL_IDS[c.kind]);
    for (const sq of squid.squids)
      if (seen(sq.x, sq.y, sq.flare)) this.creature("squid");
    for (const s of ships.ships) if (onScreen(s.x, 0)) this.creature("ship");
    for (const w of pod.whales)
      if (seen(w.body.x, w.body.y, w.lit)) this.creature("pod-whale");
  }

  /** fold the run into the lifetime records, once. Game calls this when a run
   *  is abandoned (restart, exit, tab close); `game:over` calls it on an end. */
  settle(won = false): void {
    if (!this.started || this.settled) return;
    this.settled = true;
    const { score, whale } = this.ctx;
    this.profile.recordRun(score.total, kmCovered(whale.x), won);
  }

  dispose(): void {
    this.settle();
  }

  private creature(id: string | undefined): void {
    if (!id || !this.profile.discover(id)) return;
    this.found({ kind: "creature", id });
    if (CREATURES.every((c) => this.profile.hasSeen(c.id)))
      this.trophy("naturalist");
  }

  private trophy(id: string): void {
    if (this.profile.unlock(id)) this.found({ kind: "trophy", id });
  }

  private found(f: AlmanacFind): void {
    this.fresh.push(f);
    this.ctx.bus.emit("almanac:unlocked", f);
  }
}
