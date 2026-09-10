# Codebase Analysis — 2026-09-10

A snapshot assessment of `long-water` as of `main` @ `1793a96`. For the system-by-system
reference, see [ARCHITECTURE.md](ARCHITECTURE.md); this doc is the "where things stand and
what's fragile" companion. Future work is split into topic plans under
[roadmap/](roadmap/README.md) rather than bulk-listed here.

## Shape of the project

- **Scale:** ~10,100 lines of TypeScript across 90 files. 32 commits, all on `main`, no branches
  merged via long-lived feature work except one PR (`c0c97ca`, scoring system). Solo-authored.
- **Stack:** Vite 6 + TypeScript strict + Pixi.js 8, hand-built WebAudio, `localStorage`
  persistence, no backend. Deploys as a static site (Cloudflare Pages via `wrangler`).
- **Maturity signal:** the architecture is more mature than the content. One level
  (`world/levels/crossing.json`), one locale (`i18n/en.ts`), no automated tests, no CI — but the
  seams (event bus, level-file schema, i18n keys, `System` interface) are all built as if more of
  each were coming. This is a good position to be in: the scaffolding for growth already exists,
  it's just unused past one instance in each case.

## Architectural strengths (worth preserving as the project grows)

- **Systems never import each other** (`ARCHITECTURE.md` §3) — all coupling goes through
  `GameContext` (shared refs) and `EventBus` (typed pub/sub). This is the single biggest reason
  the "Extension recipes" section of `ARCHITECTURE.md` can credibly claim "no existing system
  imports yours, so nothing else changes." It has held up across whale locomotion rewrites, a
  scoring system, squid AI, and a camera rig without touching unrelated systems.
- **Content lives in data, not code.** `world/levels/*.json` owns the leg, zones, terrain knobs,
  and every spawn; `?level=` and `?seed=` select world + determinism. This is the lever a future
  level-builder tool or a second/third leg would pull — no engine change needed to add content,
  only a new JSON file (see `roadmap/gameplay-and-content.md`).
- **Determinism is taken seriously.** One seeded RNG stream, spawn order = draw order, `dt`
  clamped to 50ms, stateless hash-noise kept separate from the seeded stream so framerate can't
  perturb gameplay. This is the kind of thing that's cheap to keep and expensive to retrofit —
  worth explicitly protecting in review as new systems are added.
- **The whale-rendering and reef work show a real "propose → verify → document" habit** (see the
  dated "Progress" entries in `whale-rendering-roadmap.md`). That discipline is worth continuing
  for other systems as they grow — it's currently only applied to rendering.

## Gaps and risks

- **Zero automated tests, no test runner installed.** Noted explicitly in
  `whale-rendering-roadmap.md` (#27). Correctness currently rests entirely on `tsc` + `eslint` +
  manual play-testing (and the headless Playwright driving mentioned in memory). The pieces most
  worth testing first are pure and deterministic already — `Wfc`/`Heightfield`, `config/scoring.ts`,
  `world/level/validate.ts` — see `roadmap/engineering-foundations.md`.
- **No CI.** Nothing gates a push to `main` beyond local discipline. `build` already runs
  `lint → tsc → vite build` locally, so wiring the same into GitHub Actions is close to free.
- **Whale rendering draws via `Graphics` and re-tessellates every frame** — flagged as the largest
  performance ceiling in `whale-rendering-roadmap.md` (#26), not yet profiled with a real pod on
  screen (N4 in that doc). This is the one item in the existing roadmap worth calling out here
  because it's an architecture decision (Mesh + shader) other rendering work should not contradict.
- **Tuning is scattered.** Breath/reserve drain multipliers live next to `VitalsSystem` instead of
  the level file — `ARCHITECTURE.md` §9 already flags this as "the obvious next step." Squid
  (`config/squid.ts`), scoring (`config/scoring.ts`), and terrain (`config/tiles.ts`) each have
  their own small tuning surface with no shared convention for what belongs in code vs. in a level
  file.
- **Single input path.** Keyboard only (WASD/Shift/Space), no remapping, no touch/gamepad. A
  swimming game is a natural touch fit; nothing in the input layer (`core/Input.ts`) currently
  gestures toward it.
- **Single locale shipped.** The i18n seam (`t(key, params)`, fallback-to-English) is real and
  used correctly throughout, but only `en.ts` exists — the seam is proven but untested against a
  second language.
- **No telemetry.** Nothing observes win/loss rates, where runs are abandoned, or which mechanics
  (song, feeding, squid encounters) actually get used. Tuning (breath drain, squid calm-retune,
  scoring) is currently done by feel; that's fine at this scale but becomes a bottleneck once the
  level count grows.
- **Working tree currently carries two uncommitted, unrelated changes** (`package.json` migrating
  scripts to `bun` + adding a `deploy` script; `public/style.css` with a chunk of a panel's
  `border-radius`/`box-shadow` commented out). Neither is part of this analysis's scope, but the
  CSS change in particular looks like an in-progress debug edit rather than a deliberate style
  change — worth a second look before it's committed either way.
- **Splash/branding was added recently** (`e8ae9f0`, `1a1c049` — BWDX Studio bumper + logo, min
  splash duration) and a `deploy` script is being wired in the uncommitted `package.json`. Both
  point toward the project moving from "prototype" toward "shippable" — the CI/testing/telemetry
  gaps above matter more once that's the intent than they did during pure prototyping.

## How to read the roadmap docs

Each doc under `roadmap/` is scoped to one concern, independently expandable, and links back here
for the "why." Existing deep-dive docs (`whale-rendering-roadmap.md`, `reef-and-wfc-notes.md`)
are treated as already-written roadmap docs for their topics and are linked from
`roadmap/rendering-and-visuals.md` rather than duplicated.
