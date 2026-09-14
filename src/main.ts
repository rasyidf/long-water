import { Game, type BootPhase } from "./core/Game";
import { isTouchDevice } from "./core/touch";
import { t } from "./i18n";

// PWA: offline shell + installability. Safe to skip in dev (vite serves over
// http, and browsers refuse to register a worker there) or if unsupported.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("service worker registration failed", err);
    });
  });
}

// Touch devices: request fullscreen on the player's first tap. Must run from
// a user gesture, so it's wired to the same tap that dismisses the title
// card rather than fired from boot. A no-op once already fullscreen/installed
// (standalone launches from the home-screen manifest are already fullscreen).
if (isTouchDevice) {
  const goFullscreen = (): void => {
    removeEventListener("pointerdown", goFullscreen);
    // `standalone` is Safari-only (home-screen launch), not in lib.dom types
    const standalone = (navigator as Navigator & { standalone?: boolean })
      .standalone;
    if (document.fullscreenElement || standalone) return;
    document.documentElement.requestFullscreen?.().catch(() => {
      /* declined or unsupported — the game still plays, just chromed */
    });
  };
  addEventListener("pointerdown", goFullscreen, { once: true });
}

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
    if (splashWord) {
      const detail = err instanceof Error ? err.message : String(err);
      splashWord.textContent = detail
        ? `${t("boot.nowebgl")} (${detail})`
        : t("boot.nowebgl");
    }
  });
