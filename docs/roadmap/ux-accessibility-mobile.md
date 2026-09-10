# UX, accessibility, and mobile

**Current state, per `ARCHITECTURE.md` Part I §10 and `core/Input.ts`:** keyboard only — WASD/
arrows to steer, Shift (hold) to surge, Shift (tap) to tail-kick, Space to sing, Esc for the pause
menu, R to restart. No remapping, no touch, no gamepad. One locale shipped (`i18n/en.ts`) though
the seam supports more (`ARCHITECTURE.md` §9). No documented colorblind, reduced-motion, or caption
support.

None of this is unusual for a project at this stage — it's listed here because the project appears
to be moving toward shippable (splash/branding work, a `deploy` script landing) and each item below
gets more expensive to retrofit the more the input/rendering layers grow around the current
keyboard-only, always-full-motion assumptions.

## 1. Touch input

**Why this is the biggest single UX gap:** "swimming" is a strong natural fit for touch (virtual
stick + tap-to-sing + hold-to-surge), and the game is a static site with no platform gate — nothing
stops it from being played on a phone today except the controls. Given the whale's movement model
already normalizes a direction vector (`ARCHITECTURE.md` §4: "WASD / arrow keys give a normalized
direction"), a touch virtual-stick only needs to produce the same normalized vector into the same
`Intent` — `PlayerBrain` shouldn't need to change at all.

**Do:** scope this after `engineering-foundations.md`'s CI lands, since input-layer changes are
exactly the kind of thing worth having a regression check for before touch and keyboard both need
to keep working.

## 2. Key remapping

**Current state:** hard-coded in `core/Input.ts`. Low effort relative to touch support, and a
prerequisite for touch anyway (both want an abstraction between "physical input" and "game
intent," which currently doesn't fully exist — WASD is read fairly directly).

## 3. Colorblind / visual accessibility

**Current state:** `ARCHITECTURE.md` Part I §13 — amber for krill (food) vs. silver for fish
schools (not food) is the one place color alone currently carries gameplay-critical meaning (what
to feed on vs. what to ignore). Worth a deuteranopia/protanopia check specifically on that
contrast, since amber/silver can compress toward each other under red-green colorblindness more
than the rest of the near-monochrome palette does.

## 4. Reduced motion

**Current state:** the camera rig (`ARCHITECTURE.md` §4, `CameraSystem`) does trauma-based shake,
speed-aware zoom, banking into turns, and a breach "shot" that drops into wall-clock slow-mo. None
of this is currently gated by an option. Screen shake and camera roll are common motion-sickness
triggers; a "reduce camera motion" toggle (dampen shake magnitude + skip the roll/bank) would be a
small, isolated change since all of it already funnels through one `CameraRig`.

## 5. Second locale

**Current state:** the i18n seam (`i18n/index.ts` — `t(key, params)`, locale from `?lang=` or
`navigator.language`, fallback to English) is real infrastructure, exercised by exactly one locale.
It's proven correct in shape but untested against the actual problems a second language surfaces
(string length changes breaking HUD layout, plural rules beyond the trivial `plural()` selector).
Adding a second language — even a partial one — would be the cheapest way to find those problems
before they matter.
