/**
 * Entry for `preview.html` — a fixed-size object gallery. It boots `Game` in
 * preview mode: a hand-placed scene with one of every renderable object, a
 * pinned camera, and only the animate-in-place systems running. Use it to
 * eyeball or screenshot a renderer change without playing through the route.
 *
 *   npm run dev  ->  http://localhost:8080/preview.html
 */
import { Game } from "./core/Game";

const mount = document.getElementById("pixi-container") ?? document.body;

new Game().boot(mount, { preview: true }).catch((err) => {
  console.error(err);
});
