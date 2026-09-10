# Engineering foundations

Testing, CI, performance measurement, and tuning-surface consolidation. See
[ANALYSIS.md](../ANALYSIS.md) for why this is first in the suggested order.

## 1. Testing

**Current state:** no test runner installed. `whale-rendering-roadmap.md` #27 already flags this
against one specific case (whale geometry).

**Why now:** the codebase's pure/deterministic corners are exactly the parts most likely to grow
(more levels, more terrain tiles, more scoring rules) and are cheap to test because they don't
touch Pixi or the DOM.

**Do, in order:**
1. Add `vitest` (matches the Vite toolchain already in use; near-zero config).
2. `world/level/validate.ts` — schema tests. A malformed level file currently "logs and falls back
   to `crossing`" (`ARCHITECTURE.md` §6); a test suite here is what lets a future level-builder
   tool (see `gameplay-and-content.md`) trust its own output before it ships a level.
3. `world/Wfc.ts` + `world/Heightfield.ts` — determinism tests (same seed → same output) and the
   "falls back to all-`plain` after 60 failed attempts" edge case. Directly relevant if the
   socket-based WFC rewrite in `reef-and-wfc-notes.md` §4 happens — that's a rewrite of exactly
   this code, and tests here would catch adjacency regressions immediately instead of by eye.
4. `config/scoring.ts` — the flow/combo chain rules are pure math (`comboStep`/`comboMul`/
   `comboUntil`) and currently the newest, least-played system (`5ff1c3a`).
5. Whale geometry, once `whale-rendering-roadmap.md` #27 (extract pure geometry from Pixi) is
   done — that extraction is what makes this testable at all.

**Explicitly not worth testing yet:** system `update`/`render` methods that touch Pixi directly, or
anything gated behind real play-testing (feel-tuning like squid calm-retune, breath drain). Don't
chase coverage numbers here — test the parts where a wrong answer is silent and expensive
(a bad WFC adjacency table, a level file that parses but spawns nothing).

## 2. CI

**Current state:** none. Nothing gates `main`.

**Do:** a single GitHub Actions workflow running what `npm run build` already runs
(`lint → tsc → vite build`), plus `vitest run` once tests exist. This is nearly a direct port of
the existing `build` script — the main decision is trigger (on every push to `main`, since there's
no PR-based workflow today beyond the one exception) and whether to also run the
`preview.html`/`procgen.html` builds as a smoke check.

**Sequencing note:** do this *before* wiring CI into deploy (see `release-ops.md`) — a deploy
pipeline that skips lint/typecheck is worse than no pipeline.

## 3. Performance measurement

**Current state:** `whale-rendering-roadmap.md` #26 already identifies the whale renderer
(`Graphics`, re-tessellated every frame) as the likely CPU ceiling, and N4 in that same doc calls
for "frame-time check with a full pod on screen" as unfinished work. Viewport culling (#28) is
marked done.

**Do:** run that N4 check before deciding whether to invest in the Mesh + shader rewrite (#26,
estimated 10+ hours in the existing doc). Don't start the Mesh rewrite speculatively — the doc
itself frames it as "candidate for dedicated effort," i.e. gated on the measurement, not assumed.

**Ownership note:** this item is tracked in detail in `whale-rendering-roadmap.md`, not duplicated
here — this doc only asserts the sequencing (measure before rewriting).

## 4. Tuning-surface consolidation

**Current state:** tuning constants are split across `config/constants.ts`, `config/scoring.ts`,
`config/squid.ts`, `config/tiles.ts`, plus inline in `VitalsSystem` (breath/reserve drain
multipliers) and `SongSystem`/`PodBrain`. `ARCHITECTURE.md` §9 already names the `VitalsSystem`
case as "the obvious next step" into the level file.

**Do:**
1. Move breath/reserve drain multipliers into the level file schema (`world/level/schema.ts`),
   matching how terrain/spawn tuning already works. This is what makes a future "hard mode" or
   alternate leg (see `gameplay-and-content.md`) actually differ mechanically, not just
   cosmetically.
2. Once that's done, write down (in `world/levels/README.md`, which already documents the format)
   a one-line rule for "level file vs. `config/*.ts`": level file = per-leg tuning a designer would
   want to vary; `config/*.ts` = engine-wide constants that shouldn't vary per level. Right now
   that boundary is implicit.

## 5. Build/deploy hygiene

**Current state:** the working tree has an uncommitted `package.json` change migrating `start`/
`build`/`lint` to `bun` and adding a `deploy` script (`bun run build && bunx wrangler@latest pages
deploy dist --project-name=long-water`). `ARCHITECTURE.md` §1 still documents `npm run dev` /
`npm run build` — will need a one-line update once the `bun` migration lands, so the docs and the
scripts don't drift.

**Do:** land the `bun` migration deliberately (commit it on its own, not bundled with unrelated
work — see the branch-hygiene note in memory), then update `ARCHITECTURE.md` §1's script list in
the same commit. See `release-ops.md` for the deploy-pipeline half of this.
