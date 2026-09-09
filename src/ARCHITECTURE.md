# Long Water — architecture

Ported from `long-water-oc.html` (the single-file reference) into a detached
system/renderer layout so new mechanics slot in without touching existing code.

## Flow

`main.ts` → `core/Game.ts` builds everything and runs the frame loop:

```
clock.tick
  if running:  for each system  system.update(dt, ctx)
  sync camera viewport + apply shake
  for each system            system.render(ctx)
```

A **system** (`core/System.ts`) is one slice of behaviour. It may implement
`update` (simulation), `render` (drawing), both, or neither (`init`-only). The
registration order in `Game.ts` is the run order.

## The decoupling seams

| Seam | File | Rule |
|---|---|---|
| Shared refs | `core/GameContext.ts` | systems reach state/services here; it holds no logic |
| Cross-system messaging | `core/EventBus.ts` | systems never import each other — they `emit` / `on` typed events |
| State | `state/*` | plain data classes (stores). One store per entity kind |
| World gen | `world/*` | `Heightfield` (static) + `WorldSpawner` (fills stores) |
| Whale body | `render/whale/WhaleView.ts` | swap `ProceduralWhaleView` ↔ `SpineWhaleView` with zero sim changes |
| Pose | `core/SpineChain.ts` | the IK backbone; the source of truth for whale pose, Spine or not |
| Whale look | `ProceduralWhaleView` | flat-illustration body: one `profile(t)` + a spine sampler; all parts are offsets in the local frame, so it bends and mirrors for free. Tune shape via `profile`/`BODY_END` |
| Depth darkness | `BackgroundRenderer` `darkGrad` + `darkFill` | a world-anchored gradient (surface → 180 m) plus a dim fill below it; light shafts fade on the same curve |
| Water surface | `BackgroundRenderer.waveAt` + `Layers.surface` | a sine-sum waterline redrawn each frame; amplitude rises near the surface / after a breach. The whale also feels a depth-attenuated orbital swell (`WhaleMovementSystem`) |
| Speed | `WhaleMovementSystem` | hold Shift → `surge` (0..1) ramps thrust + top speed over ~1.6 s; tap Shift → tail-kick impulse (0.85 s cooldown). Edge detection is `Input.justPressed` / `Input.frameEnd` |
| Pod AI | `PodSystem.stepFollower` | steering blend: wake anchor (depth-clamped to the leader's band) + leader-velocity match + catch-up when far + separation + seabed/surface avoidance + ship-dive + hunger-driven krill detour & feeding. Hard `y` guards stop breaching / clipping the seabed |

## Adding a mechanic

1. add a store in `state/`, wire it into `GameContext` + `Game` construction
2. add event types to `GameEvents` in `core/EventBus.ts`
3. add a `System` (sim) and/or a renderer, register it in `Game.systems`
4. give the renderer its own layer in `core/Layers.ts` if it draws

Nothing else changes — no existing system imports yours.

## Spine (`@esotericsoftware/spine-pixi-v8`)

The reference has no Spine; the whale is procedural. The dependency is installed
and `render/whale/SpineWhaleView.ts` is a stub with the wiring steps. Implement
its `draw()` and pass an instance to `new WhaleRenderer(view)` in `Game.ts`.
`core/SpineChain` keeps producing the pose; the view only skins it.

## Pause & persistence

`Escape` toggles pause. `hud/PauseMenu.ts` owns the overlay; pause is the events
`game:pause` / `game:resume`, and `Game` stops calling `update` while paused
(renderers keep drawing the frozen frame, `AudioSystem` suspends the context).

`state/Snapshot.ts` `save` / `load` serialise the *dynamic* run (whale, pod,
krill amounts, schools, ships, stats) to `localStorage` under `long-water:save`.
The generated world isn't saved — it's rebuilt deterministically from the seed,
so a save only loads against a matching `rng.seedValue`. Options
(`long-water:opts`) currently hold master volume, applied via `audio:volume`.

## Determinism

`core/rng.ts` `Rng` is the seeded stream (seed via `?seed=` query param).
Stateless `noise1`/`fbm` are used for spatial drift so camera culling can't
change the seeded sequence.
