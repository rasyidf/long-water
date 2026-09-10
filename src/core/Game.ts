/**
 * Composition root. Builds the world, the shared context, and the ordered list
 * of systems, then runs the frame loop. Adding a mechanic is: new store on the
 * context, new system(s) in the list below, done.
 */
import { Application } from "pixi.js";

import { DEFAULT_SEED, C } from "../config/constants";
import { CoralStore, KrillStore, SchoolStore } from "../state/Fauna";
import { ParticleStore, ShipStore, SongField } from "../state/Hazards";
import { Pod } from "../state/Pod";
import { PlayerWhale } from "../state/PlayerWhale";
import { RunStats } from "../state/RunStats";
import { Score } from "../state/Score";
import { SquidStore } from "../state/Squid";
import { Heightfield } from "../world/Heightfield";
import {
  buildPreviewScene,
  PREVIEW_SIZE,
  type PreviewFraming,
} from "../world/PreviewScene";
import { setActiveLevel } from "../world/level/active";
import { applyLevel } from "../world/level/apply";
import { loadLevelDef, resolveLevelId } from "../world/level/registry";
import type { LevelDef } from "../world/level/schema";

import { Camera } from "./Camera";
import { Clock } from "./Clock";
import { EventBus } from "./EventBus";
import type { GameContext } from "./GameContext";
import { Input } from "./Input";
import { Layers } from "./Layers";
import { Rng } from "./rng";
import type { System } from "./System";

import { AudioSystem } from "../systems/AudioSystem";
import { CameraSystem } from "../systems/CameraSystem";
import { FeedingSystem } from "../systems/FeedingSystem";
import { KrillSystem } from "../systems/KrillSystem";
import { ParticleSystem } from "../systems/ParticleSystem";
import { PodSystem } from "../systems/PodSystem";
import { PreviewDirector } from "../systems/PreviewDirector";
import { SchoolSystem } from "../systems/SchoolSystem";
import { ScoreSystem } from "../systems/ScoreSystem";
import { ShipSystem } from "../systems/ShipSystem";
import { SquidSystem } from "../systems/SquidSystem";
import { SongSystem } from "../systems/SongSystem";
import { VitalsSystem } from "../systems/VitalsSystem";
import { WhaleSystem } from "../systems/WhaleSystem";

import { BackgroundRenderer } from "../render/BackgroundRenderer";
import { CoralRenderer } from "../render/CoralRenderer";
import { FaunaRenderer } from "../render/FaunaRenderer";
import { KrillRenderer } from "../render/fauna/KrillRenderer";
import { GlowRenderer } from "../render/GlowRenderer";
import { ShipRenderer } from "../render/ShipRenderer";
import { SquidRenderer } from "../render/SquidRenderer";
import { TerrainRenderer } from "../render/TerrainRenderer";
import { WhaleRenderer } from "../render/WhaleRenderer";

import { Cards } from "../hud/Cards";
import { DepthRuler } from "../hud/DepthRuler";
import { Hints } from "../hud/Hints";
import { Hud } from "../hud/Hud";
import { ScoreHud } from "../hud/ScoreHud";
import { PauseMenu } from "../hud/PauseMenu";

/** Ordered boot milestones, reported to `boot`'s `onProgress` for the splash. */
export type BootPhase = "renderer" | "world" | "systems" | "warmup" | "ready";

/** the level the run should use: `?level=`, falling back to `crossing` if that
 *  id is unknown or its file fails to validate */
function resolveLevel(): LevelDef {
  const id = resolveLevelId();
  try {
    return loadLevelDef(id);
  } catch (e) {
    console.error(`level "${id}" failed to load — using "crossing"`, e);
    return loadLevelDef("crossing");
  }
}

/** `?seed=` wins, then the level's own `seed`, then the default */
function seedFor(level: LevelDef): number {
  const q = Number(new URLSearchParams(location.search).get("seed"));
  if (Number.isFinite(q) && q > 0) return q;
  return level.seed ?? DEFAULT_SEED;
}

export class Game {
  private app = new Application();
  private ctx!: GameContext;
  private systems: System[] = [];
  private clock = new Clock();
  private pauseMenu = new PauseMenu();

  async boot(
    mount: HTMLElement,
    opts: { preview?: boolean; onProgress?: (phase: BootPhase) => void } = {},
  ): Promise<void> {
    const preview = opts.preview ?? false;
    const report = opts.onProgress ?? ((): void => {});
    // hand the frame back to the browser so the splash can paint / animate
    // between the heavy synchronous boot steps
    const breathe = (): Promise<void> =>
      new Promise<void>((r) =>
        requestAnimationFrame(() => setTimeout(() => r(), 0)),
      );

    await this.app.init({
      ...(preview
        ? { width: PREVIEW_SIZE.w, height: PREVIEW_SIZE.h }
        : { resizeTo: window }),
      antialias: true,
      background: C.abyss,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });
    mount.appendChild(this.app.canvas);
    report("renderer");
    if (!preview) await breathe();

    const level = resolveLevel();
    setActiveLevel(level);
    const rng = new Rng(seedFor(level));
    const world = new Heightfield(rng);
    const whale = new PlayerWhale();
    const pod = new Pod();
    const krill = new KrillStore();
    const schools = new SchoolStore();
    const coral = new CoralStore();
    const ships = new ShipStore();
    const squid = new SquidStore();
    const particles = new ParticleStore();
    const stores = { krill, schools, coral, pod, ships, particles };
    let framing: PreviewFraming | null = null;
    if (preview) framing = buildPreviewScene(rng, world, whale, stores);
    else applyLevel(level, rng, world, stores);
    report("world");
    if (!preview) await breathe();

    const camera = new Camera();
    camera.x = whale.x;
    camera.y = whale.y;
    const layers = new Layers();
    const bus = new EventBus();
    const input = new Input();

    this.ctx = {
      app: this.app,
      bus,
      rng,
      clock: this.clock,
      camera,
      input,
      layers,
      world,
      level,
      whale,
      pod,
      krill,
      schools,
      coral,
      ships,
      squid,
      song: new SongField(),
      particles,
      stats: new RunStats(),
      score: new Score(),
      running: false,
    };

    this.app.stage.addChild(layers.world, layers.overlay);

    if (preview && framing) {
      // gallery: only the animate-in-place systems + every renderer
      this.systems = [
        new WhaleSystem(false),
        new SongSystem(),
        new KrillSystem(),
        new SchoolSystem(),
        new ParticleSystem(),
        new PreviewDirector(framing),

        new BackgroundRenderer(),
        new TerrainRenderer(),
        new CoralRenderer(),
        new FaunaRenderer(),
        new KrillRenderer(),
        new WhaleRenderer(),
        new ShipRenderer(),
        new GlowRenderer(),
      ];
      for (const s of this.systems) s.init?.(this.ctx);
      this.clock.markStarted();
      this.ctx.running = true;
      requestAnimationFrame(this.frame);
      return;
    }

    // order matters: input/physics -> reactions -> camera -> renderers -> hud
    this.systems = [
      new AudioSystem(),
      new WhaleSystem(),
      new VitalsSystem(),
      new FeedingSystem(),
      new SongSystem(),
      new PodSystem(),
      new SquidSystem(),
      new KrillSystem(),
      new SchoolSystem(),
      new ShipSystem(),
      new ParticleSystem(),
      new ScoreSystem(),
      new CameraSystem(),

      new BackgroundRenderer(),
      new TerrainRenderer(),
      new CoralRenderer(),
      new FaunaRenderer(),
      new KrillRenderer(),
      new WhaleRenderer(),
      new SquidRenderer(),
      new ShipRenderer(),
      new GlowRenderer(),

      new Hud(),
      new ScoreHud(),
      new DepthRuler(),
      new Hints(),
      new Cards(),
      this.pauseMenu,
    ];
    for (const s of this.systems) s.init?.(this.ctx);
    report("systems");
    await breathe();

    bus.on("game:start", () => {
      this.clock.markStarted();
      this.ctx.running = true;
    });
    bus.on("game:over", () => {
      this.ctx.running = false;
    });
    bus.on("game:pause", () => {
      this.ctx.running = false;
    });
    bus.on("game:resume", () => {
      this.ctx.running =
        this.clock.started && this.ctx.whale.alive && !this.ctx.whale.done;
    });

    input.attach({
      onFirstKey: () => {
        if (!this.clock.started) bus.emit("game:start");
      },
      onRestart: () => {
        if (!this.ctx.whale.alive || this.ctx.whale.done) location.reload();
      },
      onPause: () => this.pauseMenu.toggle(),
    });

    // draw the frozen opening frame now, behind the splash: this is where Pixi
    // compiles the bloom-filter shader and uploads every renderer's geometry,
    // the bulk of the old "stall". Two passes so a first-pass allocation can't
    // land visibly on the first real frame.
    this.renderScene();
    this.app.render();
    report("warmup");
    await breathe();
    this.renderScene();
    this.app.render();
    report("ready");

    requestAnimationFrame(this.frame);
  }

  private frame = (nowMs: number): void => {
    this.clock.tick(nowMs);
    const { ctx } = this;

    if (ctx.running) {
      for (const s of this.systems) s.update?.(this.clock.dt, ctx);
    }
    ctx.input.frameEnd();

    // camera roll + shake ride the world container. Roll pivots about screen
    // centre and is paired with a small overscan so the rotated corners never
    // expose the canvas edge; shake is a per-frame random offset on top.
    const cam = ctx.camera;
    const w = ctx.layers.world;
    const sh = cam.shake;
    const jx = sh > 0.4 ? (Math.random() - 0.5) * sh : 0;
    const jy = sh > 0.4 ? (Math.random() - 0.5) * sh : 0;
    const cx = cam.vw / 2;
    const cy = cam.vh / 2;
    w.pivot.set(cx, cy);
    w.rotation = cam.rot + (sh > 0.4 ? (Math.random() - 0.5) * sh * 0.0006 : 0);
    w.scale.set(1 + Math.min(0.05, Math.abs(cam.rot) * 4));
    w.position.set(cx + jx, cy + jy);

    this.renderScene();

    requestAnimationFrame(this.frame);
  };

  /** Sync the viewport and run every system's `render`. The actual GPU draw is
   * the Pixi ticker's job; `boot`'s warm-up calls `app.render()` itself. */
  private renderScene(): void {
    const { ctx } = this;
    ctx.camera.vw = this.app.renderer.width / this.app.renderer.resolution;
    ctx.camera.vh = this.app.renderer.height / this.app.renderer.resolution;
    for (const s of this.systems) s.render?.(ctx);
  }
}
