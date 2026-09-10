/**
 * A cut-down `Game` for the dev tools (`tools.html`, `editor.html`). Owns a Pixi
 * `Application`, the layer graph, a camera you can pan/zoom, and the shared
 * renderer + animate-in-place stack from `core/renderStack.ts`. It renders a
 * real `LevelDef` through the same `applyLevel` path the game uses, so terrain,
 * coral, squid, fish, ships and snow all look exactly as they will in a run.
 *
 * Call `load(level, seed)` as often as you like — it tears down the previous
 * world and rebuilds from scratch. Cheap enough to drive from a slider.
 */
import { Application } from "pixi.js";

import { C } from "../config/constants";
import { CoralStore, KrillStore, SchoolStore } from "../state/Fauna";
import { ParticleStore, ShipStore, SongField } from "../state/Hazards";
import { Pod } from "../state/Pod";
import { PlayerWhale } from "../state/PlayerWhale";
import { RunStats } from "../state/RunStats";
import { Score } from "../state/Score";
import { SquidStore } from "../state/Squid";
import { Heightfield } from "../world/Heightfield";
import { setActiveLevel } from "../world/level/active";
import { applyLevel } from "../world/level/apply";
import type { LevelDef } from "../world/level/schema";

import { Camera } from "../core/Camera";
import { Clock } from "../core/Clock";
import { EventBus } from "../core/EventBus";
import type { GameContext } from "../core/GameContext";
import { Input } from "../core/Input";
import { Layers } from "../core/Layers";
import { setFlatLight } from "../core/light";
import { previewSimSystems, renderSystems } from "../core/renderStack";
import { Rng } from "../core/rng";
import type { System } from "../core/System";

export interface LoadOpts {
  /** where to park the player whale; `null` hides it far offscreen (default) */
  whale?: { x: number; y: number; facing?: 1 | -1 } | null;
  /** initial camera focus; defaults to the middle of the leg */
  focus?: { x: number; y: number; scale: number };
  /** keep the game's depth-darkness / god-rays / vignette (default false — the
   * tools render flat-lit so procgen can be judged without the falloff) */
  light?: boolean;
}

export class SceneHost {
  readonly camera = new Camera();
  private app = new Application();
  private layers = new Layers();
  private bus = new EventBus();
  private clock = new Clock();
  private systems: System[] = [];
  private ctx: GameContext | null = null;
  private raf = 0;
  private lit = false;
  private disposed = false;

  constructor(private mount: HTMLElement) {}

  async init(): Promise<void> {
    await this.app.init({
      resizeTo: this.mount,
      antialias: true,
      background: C.abyss,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    this.mount.appendChild(this.app.canvas);
    this.app.stage.addChild(this.layers.world, this.layers.overlay);
    this.attachControls();
    this.frame(performance.now());
  }

  /** Rebuild the world from `level` + `seed` and start rendering it. */
  load(level: LevelDef, seed: number, opts: LoadOpts = {}): void {
    for (const s of this.systems) s.dispose?.();

    setActiveLevel(level);
    const rng = new Rng(seed);
    const world = new Heightfield(rng);
    const whale = new PlayerWhale();
    const stores = {
      krill: new KrillStore(),
      schools: new SchoolStore(),
      coral: new CoralStore(),
      pod: new Pod(),
      ships: new ShipStore(),
      squid: new SquidStore(),
      particles: new ParticleStore(),
    };
    applyLevel(level, rng, world, stores);

    if (opts.whale) {
      whale.body.x = opts.whale.x;
      whale.body.y = opts.whale.y;
      whale.body.facing = opts.whale.facing ?? 1;
    } else {
      whale.body.x = -1e7; // park it well outside any scene
      whale.body.y = -1e7;
    }
    whale.trail.reset(whale.body.x, whale.body.y);
    whale.body.resetChains();

    this.ctx = {
      app: this.app,
      bus: this.bus,
      rng,
      clock: this.clock,
      camera: this.camera,
      input: new Input(),
      layers: this.layers,
      world,
      level,
      whale,
      pod: stores.pod,
      krill: stores.krill,
      schools: stores.schools,
      coral: stores.coral,
      ships: stores.ships,
      squid: stores.squid,
      song: new SongField(),
      particles: stores.particles,
      stats: new RunStats(),
      score: new Score(),
      running: true,
    };

    this.lit = opts.light ?? false;
    setFlatLight(!this.lit);

    const focus = opts.focus ?? {
      x: (level.leg.startX + level.leg.finishX) / 2,
      y: 900,
      scale: 0.12,
    };
    this.camera.x = focus.x;
    this.camera.y = focus.y;
    this.camera.scale = focus.scale;

    this.systems = [...previewSimSystems(), ...renderSystems()];
    for (const s of this.systems) s.init?.(this.ctx);
    this.clock.markStarted();
  }

  /** the live context, once `load` has run — handy for overlays that read the
   * generated world (tile list, floor heights, entity stores) */
  get context(): GameContext | null {
    return this.ctx;
  }

  /** the Pixi canvas, for overlays that need its on-screen rect */
  get view(): HTMLCanvasElement {
    return this.app.canvas;
  }

  /** true once `dispose()` has run — overlay loops should bail on it */
  get dead(): boolean {
    return this.disposed;
  }

  dispose(): void {
    this.disposed = true;
    setFlatLight(false);
    cancelAnimationFrame(this.raf);
    for (const s of this.systems) s.dispose?.();
    this.app.destroy(true, { children: true });
  }

  // ── internals ────────────────────────────────────────────────────────────

  private frame = (nowMs: number): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    this.clock.tick(nowMs);
    const ctx = this.ctx;
    if (!ctx) return;

    this.camera.vw = this.app.renderer.width / this.app.renderer.resolution;
    this.camera.vh = this.app.renderer.height / this.app.renderer.resolution;
    for (const s of this.systems) s.update?.(this.clock.dt, ctx);
    for (const s of this.systems) s.render?.(ctx);

    // flat-lit mode: drop the depth-darkness, god-rays and vignette so procgen
    // reads evenly. `darkGrad` is bounds-driven by BackgroundRenderer; the rest
    // are always-visible display objects, so restore them when lit.
    const L = this.layers;
    const show = this.lit;
    if (!show) L.darkGrad.visible = false;
    L.darkFill.visible = show;
    L.vignette.visible = show;
    L.shafts.visible = show;

    const w = this.layers.world;
    w.pivot.set(0, 0);
    w.position.set(0, 0);
  };

  private attachControls(): void {
    const el = this.app.canvas;
    let dragging = false;
    let lx = 0;
    let ly = 0;
    el.addEventListener("pointerdown", (e) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointerup", (e) => {
      dragging = false;
      el.releasePointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      this.camera.x -= (e.clientX - lx) / this.camera.scale;
      this.camera.y -= (e.clientY - ly) / this.camera.scale;
      lx = e.clientX;
      ly = e.clientY;
    });
    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const f = Math.exp(-e.deltaY * 0.0015);
        this.camera.scale = Math.max(0.02, Math.min(4, this.camera.scale * f));
      },
      { passive: false },
    );
  }
}
