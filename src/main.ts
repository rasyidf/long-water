import { Game } from "./core/Game";

const mount = document.getElementById("pixi-container") ?? document.body;

new Game().boot(mount).catch((err) => {
  console.error(err);
  const line = document.getElementById("startLine");
  if (line)
    line.textContent =
      "This browser could not start WebGL, so the ocean cannot render.";
});
