/** Small DOM helpers shared by the front-end screens (`menu/*`). */

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

/** Fade a screen/panel in or out. Hidden ones go `inert`, so nothing inside can
 *  keep focus or catch a key/click while it's invisible — without that, a
 *  faded-out "New game" button would still be focused and Space would press it
 *  mid-run. */
export function setShown(el: HTMLElement, on: boolean): void {
  el.classList.toggle("on", on);
  el.inert = !on;
  if (!on && el.contains(document.activeElement))
    (document.activeElement as HTMLElement).blur();
}

export function isShown(el: HTMLElement): boolean {
  return el.classList.contains("on");
}

export type Dir = "up" | "down" | "left" | "right";

/** arrow / WASD key -> direction, or null */
export function keyDir(code: string): Dir | null {
  switch (code) {
    case "ArrowUp":
    case "KeyW":
      return "up";
    case "ArrowDown":
    case "KeyS":
      return "down";
    case "ArrowLeft":
    case "KeyA":
      return "left";
    case "ArrowRight":
    case "KeyD":
      return "right";
  }
  return null;
}

const FOCUSABLE = "button:not([disabled]), input:not([disabled])";

/**
 * Spatial focus: move from the focused control in `root` to the nearest one
 * lying in `dir`. Works for a vertical menu and a card grid alike, so every
 * screen is keyboard-drivable without per-screen index bookkeeping. With
 * nothing focused yet it lands on the first control. Returns false if focus
 * didn't move.
 */
export function moveFocus(root: HTMLElement, dir: Dir): boolean {
  const all = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null,
  );
  if (all.length === 0) return false;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !root.contains(cur) || !all.includes(cur)) {
    all[0].focus();
    return true;
  }
  const c = cur.getBoundingClientRect();
  const cx = c.left + c.width / 2;
  const cy = c.top + c.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of all) {
    if (el === cur) continue;
    const r = el.getBoundingClientRect();
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    const along =
      dir === "up" ? -dy : dir === "down" ? dy : dir === "left" ? -dx : dx;
    const across = dir === "up" || dir === "down" ? Math.abs(dx) : Math.abs(dy);
    if (along <= 2) continue;
    const score = along + across * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  best?.focus();
  return !!best;
}
