/** Shared "is this a touch/coarse-pointer device" check — decides whether the
 *  on-screen joystick + buttons should show, and whether the title card shows
 *  touch instructions instead of key legends. Computed once; devices don't
 *  change class mid-session. */
export const isTouchDevice: boolean =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0 ||
    "ontouchstart" in window);
