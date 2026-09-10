import { Game, type BootPhase } from "./core/Game";
import { t } from "./i18n";

const mount = document.getElementById("pixi-container") ?? document.body;
const splash = document.getElementById("splash");
const splashBar = document.getElementById("splashBar");
const splashWord = document.getElementById("splashWord");

/** how full the loading bar reads at each boot milestone */
const PROGRESS: Record<BootPhase, number> = {
  renderer: 22,
  world: 40,
  systems: 68,
  warmup: 90,
  ready: 100,
};

/** keep the splash on screen at least this long so the two studio bumpers →
 *  logo sequence plays out and never flashes */
const MIN_SPLASH_MS = 3000;
const bootStart = performance.now();

function setProgress(pct: number): void {
  if (splashBar) splashBar.style.width = `${pct}%`;
}

async function liftSplash(): Promise<void> {
  setProgress(100);
  const held = performance.now() - bootStart;
  if (held < MIN_SPLASH_MS) {
    await new Promise((r) => setTimeout(r, MIN_SPLASH_MS - held));
  }
  splash?.classList.add("lift");
  setTimeout(() => splash?.remove(), 600);
}

new Game()
  .boot(mount, { onProgress: (phase) => setProgress(PROGRESS[phase]) })
  .then(liftSplash)
  .catch((err) => {
    console.error(err);
    splash?.classList.add("failed");
    if (splashWord) splashWord.textContent = t("boot.nowebgl");
    const line = document.getElementById("startLine");
    if (line) line.textContent = t("boot.nowebgl");
  });
