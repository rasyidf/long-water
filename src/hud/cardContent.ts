/**
 * Builds the end-of-run card content. A `CardContent` is plain data;
 * `menu/FrontEnd.ts`'s end screen renders it. The title screen is its own
 * static markup (`menu/FrontEnd.ts`'s `localize`), not built from a card —
 * it's a real menu, not a result to report.
 */
import { kmCovered, legId, legLengthKm } from "../config/route";
import type { GameContext } from "../core/GameContext";
import { isTouchDevice } from "../core/touch";
import { has, t } from "../i18n";

export interface CardContent {
  /** heading, innerHTML — may contain `<br>` / `<em>` */
  h1: string;
  /** body paragraph, innerHTML */
  body: string;
  /** the ".start" prompt line; omitted → left as-is */
  start?: string;
  /** key rows as `[label, description]`; omitted → the ".keys" block is hidden */
  keys?: [string, string][];
}

export function titleCard(): CardContent {
  return {
    h1: t("card.title.h1"),
    body: t("card.title.body"),
    start: t(isTouchDevice ? "card.title.start.touch" : "card.title.start"),
    keys: isTouchDevice
      ? [
          ["Stick", t("card.title.keys.touch.stick")],
          ["Surge", t("card.title.keys.touch.surge")],
          ["Sing", t("card.title.keys.touch.sing")],
        ]
      : [
          ["W A S D", t("card.title.keys.wasd")],
          ["Shift", t("card.title.keys.shift")],
          ["Space", t("card.title.keys.space")],
          ["Esc", t("card.title.keys.esc")],
        ],
  };
}

export function endCard(ctx: GameContext, won: boolean): CardContent {
  const { stats, score, whale, pod } = ctx;
  const best = score.best
    ? `${score.best.label} (${score.best.points})`
    : t("card.end.bestNone");
  const stat = t("card.end.stats", {
    answered: stats.answered,
    joined: stats.joined,
    lost: stats.lost,
    behind: pod.followers().length,
    fed: stats.fed,
    chorus: stats.chorus,
    score: score.total.toLocaleString(),
    best,
  });

  const spelledKey = `leg.${legId()}.distanceSpelled`;
  const distance = won
    ? has(spelledKey)
      ? t(spelledKey)
      : `${legLengthKm().toFixed(0)} km`
    : `${kmCovered(whale.x).toFixed(1)} km`;

  return {
    h1: t(won ? "card.end.win.h1" : "card.end.lose.h1"),
    body: t(won ? "card.end.win.body" : "card.end.lose.body", {
      distance,
      stats: stat,
    }),
  };
}
