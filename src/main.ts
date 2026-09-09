import { Game } from "./core/Game";
import { t } from "./i18n";

const mount = document.getElementById("pixi-container") ?? document.body;

new Game().boot(mount).catch((err) => {
  console.error(err);
  const line = document.getElementById("startLine");
  if (line) line.textContent = t("boot.nowebgl");
});
