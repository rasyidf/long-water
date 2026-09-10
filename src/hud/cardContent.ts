/**
 * Builders for the full-screen cards. A `CardContent` is plain data; `Cards`
 * renders it. Add a card by writing another builder here and calling
 * `cards.show(myCard())` from wherever triggers it.
 */
import { kmCovered, legId, legLengthKm } from "../config/route";
import type { GameContext } from "../core/GameContext";
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
    start: t("card.title.start"),
    keys: [
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
    start: t("card.end.restart"),
  };
}
