import { Game, type BootPhase } from "./core/Game";
import { isTouchDevice } from "./core/touch";
import { t } from "./i18n";

// this is a game surface, not a document: no right-click/long-press context
// menu, and no iOS Safari pinch-zoom (the `user-scalable=no` viewport meta
// alone doesn't stop the pinch gesture itself, only double-tap-to-zoom).
addEventListener("contextmenu", (e) => e.preventDefault());
addEventListener("gesturestart", (e) => e.preventDefault());

// PWA: offline shell + installability. Safe to skip in dev (vite serves over
// http, and browsers refuse to register a worker there) or if unsupported.
if ("serviceWorker" in navigator && location.protocol === "https:") {
  addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("service worker registration failed", err);
    });
  });
}

// Touch devices: known this early (before boot) so the portrait
// rotate-prompt (style.css) can show immediately rather than waiting for
// `TouchControls` to add the same class mid-boot.
if (isTouchDevice) document.body.classList.add("is-touch");

// best-effort landscape lock: works on Android Chrome (requires fullscreen
// first), does nothing on iOS Safari (unsupported there at all) — the
// rotate-prompt is the layout's real guarantee, this is just a nicety where
// it's available.
function lockLandscape(): void {
  // `lock` is part of the Screen Orientation API spec but missing from
  // lib.dom's `ScreenOrientation` type; unsupported browsers (all of iOS
  // Safari) just won't have the method at runtime either.
  const orientation = screen.orientation as ScreenOrientation & {
    lock?: (orientation: string) => Promise<void>;
  };
  orientation.lock?.("landscape").catch(() => {
    /* unsupported or refused — rotate-prompt covers it */
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
    if (document.fullscreenElement || standalone) {
      lockLandscape();
      return;
    }
    document.documentElement
      .requestFullscreen?.()
      .then(lockLandscape)
      .catch(() => {
        /* declined or unsupported — the game still plays, just chromed */
        lockLandscape();
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
