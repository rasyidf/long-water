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
import { Heightfield } from "../world/Heightfield";
import {
  buildPreviewScene,
  PREVIEW_SIZE,
  type PreviewFraming,
} from "../world/PreviewScene";
import { spawnWorld } from "../world/WorldSpawner";

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
import { ShipSystem } from "../systems/ShipSystem";
import { SongSystem } from "../systems/SongSystem";
import { VitalsSystem } from "../systems/VitalsSystem";
import { WhaleSystem } from "../systems/WhaleSystem";

import { BackgroundRenderer } from "../render/BackgroundRenderer";
import { CoralRenderer } from "../render/CoralRenderer";
import { FaunaRenderer } from "../render/FaunaRenderer";
import { GlowRenderer } from "../render/GlowRenderer";
import { ShipRenderer } from "../render/ShipRenderer";
import { TerrainRenderer } from "../render/TerrainRenderer";
import { WhaleRenderer } from "../render/WhaleRenderer";

import { Cards } from "../hud/Cards";
import { DepthRuler } from "../hud/DepthRuler";
import { Hints } from "../hud/Hints";
import { Hud } from "../hud/Hud";
import { PauseMenu } from "../hud/PauseMenu";

function seedFromUrl(): number {
  const q = Number(new URLSearchParams(location.search).get("seed"));
  return Number.isFinite(q) && q > 0 ? q : DEFAULT_SEED;
}

export class Game {
  private app = new Application();
  private ctx!: GameContext;
  private systems: System[] = [];
  private clock = new Clock();
  private pauseMenu = new PauseMenu();

  async boot(
    mount: HTMLElement,
    opts: { preview?: boolean } = {},
  ): Promise<void> {
    const preview = opts.preview ?? false;

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

    const rng = new Rng(seedFromUrl());
    const world = new Heightfield(rng);
    const whale = new PlayerWhale();
    const pod = new Pod();
    const krill = new KrillStore();
    const schools = new SchoolStore();
    const coral = new CoralStore();
    const ships = new ShipStore();
    const particles = new ParticleStore();
    const stores = { krill, schools, coral, pod, ships, particles };
    let framing: PreviewFraming | null = null;
    if (preview) framing = buildPreviewScene(rng, world, whale, stores);
    else spawnWorld(rng, world, stores);

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
      whale,
      pod,
      krill,
      schools,
      coral,
      ships,
      song: new SongField(),
      particles,
      stats: new RunStats(),
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
      new KrillSystem(),
      new SchoolSystem(),
      new ShipSystem(),
      new ParticleSystem(),
      new CameraSystem(),

      new BackgroundRenderer(),
      new TerrainRenderer(),
      new CoralRenderer(),
      new FaunaRenderer(),
      new WhaleRenderer(),
      new ShipRenderer(),
      new GlowRenderer(),

      new Hud(),
      new DepthRuler(),
      new Hints(),
      new Cards(),
      this.pauseMenu,
    ];
    for (const s of this.systems) s.init?.(this.ctx);

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

    requestAnimationFrame(this.frame);
  }

  private frame = (nowMs: number): void => {
    this.clock.tick(nowMs);
    const { ctx } = this;

    if (ctx.running) {
      for (const s of this.systems) s.update?.(this.clock.dt, ctx);
    }
    ctx.input.frameEnd();

    ctx.camera.vw = this.app.renderer.width / this.app.renderer.resolution;
    ctx.camera.vh = this.app.renderer.height / this.app.renderer.resolution;

    const sh = ctx.camera.shake;
    ctx.layers.world.x = sh > 0.4 ? (Math.random() - 0.5) * sh : 0;
    ctx.layers.world.y = sh > 0.4 ? (Math.random() - 0.5) * sh : 0;

    for (const s of this.systems) s.render?.(ctx);

    requestAnimationFrame(this.frame);
  };
}
