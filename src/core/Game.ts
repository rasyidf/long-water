/**
 * Composition root. Builds the world, the shared context, and the ordered list
 * of systems, then runs the frame loop. Adding a mechanic is: new store on the
 * context, new system(s) in the list below, done.
 *
 * A page load only ever calls `app.init` once — everything else (title, a run,
 * restarting, going back to the title) is a *rebuild*: tear the old systems
 * and layer graph down, build fresh ones against the same Pixi renderer. The
 * splash covers the very first build; `menu/FrontEnd`'s curtain covers every
 * one after that, so "R" / "Exit to title" never has to reload the page.
 */
import { Application } from "pixi.js";

import { DEFAULT_SEED, C } from "../config/constants";
import { endCard } from "../hud/cardContent";
import { t } from "../i18n";
import { CoralStore, KrillStore, SchoolStore } from "../state/Fauna";
import { ParticleStore, ShipStore, SongField } from "../state/Hazards";
import { Pod } from "../state/Pod";
import { PlayerWhale } from "../state/PlayerWhale";
import { Profile } from "../state/Profile";
import { RunStats } from "../state/RunStats";
import { Score } from "../state/Score";
import { load, saveMeta } from "../state/Snapshot";
import { SquidStore } from "../state/Squid";
import { Heightfield } from "../world/Heightfield";
import { buildPreviewScene, PREVIEW_SIZE } from "../world/PreviewScene";
import { setActiveLevel } from "../world/level/active";
import { applyLevel } from "../world/level/apply";
import { loadLevelDef, resolveLevelId } from "../world/level/registry";
import type { LevelDef } from "../world/level/schema";

import { Camera } from "./Camera";
import { Clock } from "./Clock";
import { EventBus } from "./EventBus";
import type { GameContext } from "./GameContext";
import { Input } from "./input/Input";
import { Layers } from "./Layers";
import { renderSystems, previewSimSystems } from "./renderStack";
import { Rng } from "./rng";
import type { System } from "./System";

import { AlmanacSystem } from "../systems/AlmanacSystem";
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

import { DepthRuler } from "../hud/DepthRuler";
import { Hints } from "../hud/Hints";
import { Hud } from "../hud/Hud";
import { ScoreHud } from "../hud/ScoreHud";
import { PauseMenu } from "../hud/PauseMenu";
import { onQuality, quality } from "../state/Quality";
import { FrontEnd } from "../menu/FrontEnd";
import { TouchControls } from "../hud/TouchControls";

/** Ordered boot milestones, reported to `boot`'s `onProgress` for the splash. */
export type BootPhase = "renderer" | "world" | "systems" | "warmup" | "ready";

/** the level the run should use: `?level=`, falling back to `crossing` if that
 *  id is unknown or its file fails to validate */
function levelById(id: string): LevelDef {
  try {
    return loadLevelDef(id);
  } catch (e) {
    console.error(`level "${id}" failed to load — using "crossing"`, e);
    return loadLevelDef("crossing");
  }
}

const resolveLevel = (): LevelDef => levelById(resolveLevelId());

/** `?seed=` wins, then the level's own `seed`, then the default */
function seedFor(level: LevelDef): number {
  const q = Number(new URLSearchParams(location.search).get("seed"));
  if (Number.isFinite(q) && q > 0) return q;
  return level.seed ?? DEFAULT_SEED;
}

/** the fresh world state a run needs — everything downstream of the seed */
interface WorldState {
  level: LevelDef;
  rng: Rng;
  world: Heightfield;
  whale: PlayerWhale;
  pod: Pod;
  krill: KrillStore;
  schools: SchoolStore;
  coral: CoralStore;
  ships: ShipStore;
  squid: SquidStore;
  particles: ParticleStore;
}

export class Game {
  private app: Application = new Application();
  private clock = new Clock();
  private input = new Input();
  private profile = new Profile();

  private frontEnd!: FrontEnd;
  private pauseMenu!: PauseMenu;
  private audio = new AudioSystem();

  private layers!: Layers;
  private ctx!: GameContext;
  private systems: System[] = [];

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

    await this.initRenderer(preview);
    mount.appendChild(this.app.canvas);
    if (!preview) this.trackVisualViewport();
    // the graphics-quality render scale lands live: fewer pixels per frame is
    // the biggest single lever a low-end GPU has
    onQuality(() => this.applyRenderScale());
    report("renderer");
    if (!preview) await breathe();

    if (preview) {
      // the object gallery (preview.html): one fixed frame, no title/HUD/menus
      const level = resolveLevel();
      const built = this.buildWorld(level, seedFor(level));
      const framing = buildPreviewScene(
        built.rng,
        built.world,
        built.whale,
        built,
      );
      report("world");

      this.buildContext(built);
      this.systems = [
        ...previewSimSystems(),
        new PreviewDirector(framing),
        ...renderSystems(),
      ];
      for (const s of this.systems) s.init?.(this.ctx);
      this.clock.markStarted();
      this.ctx.running = true;
      requestAnimationFrame(this.frame);
      return;
    }

    // page-lifetime front-end: title, end screen, almanac, options, pause
    this.frontEnd = new FrontEnd(this.profile, {
      newGame: () => this.newGame(),
      continueGame: () => this.continueGame(),
      restart: () => this.restartLeg(),
      toTitle: () => this.toTitle(),
      onVolume: (v) => this.ctx?.bus.emit("audio:volume", v),
    });
    this.pauseMenu = new PauseMenu({
      restart: () => this.restartLeg(),
      load: () => load(this.ctx),
      exit: () => this.toTitle(),
      options: (onClose) => this.frontEnd.openOptions(false, onClose),
    });
    this.input.attach({
      onRestart: () => {
        if (this.frontEnd.endReady) this.toTitle();
      },
      onPause: () => {
        if (!this.frontEnd.escape()) this.pauseMenu.toggle();
      },
    });

    const level = resolveLevel();
    const built = this.buildWorld(level, seedFor(level));
    report("world");
    await breathe();

    this.assemble(built);
    for (const s of this.systems) s.init?.(this.ctx);
    this.ctx.bus.emit("audio:volume", this.frontEnd.options.volume);
    report("systems");
    await breathe();

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
    this.frontEnd.showTitle(saveMeta());
  }

  // ── front-end actions ───────────────────────────────────────────────────

  private newGame(): void {
    // the title's backdrop world is always a fresh, unplayed build of the
    // default level/seed (see `toTitle`/boot) — just start it
    this.ctx.bus.emit("game:start");
    this.frontEnd.showPlay(true);
  }

  private continueGame(): void {
    const meta = saveMeta();
    if (!meta) return; // Continue is disabled with no save; ignore a stray click

    const resume = (): void => {
      if (!load(this.ctx)) {
        this.frontEnd.note(t("menu.note.wrongWorld"));
        return;
      }
      this.ctx.bus.emit("game:start");
      this.frontEnd.showPlay(false);
    };

    if (
      meta.level === this.ctx.level.id &&
      meta.seed === this.ctx.rng.seedValue
    ) {
      resume();
      return;
    }
    void this.frontEnd
      .curtainOver(() => this.rebuild(levelById(meta.level), meta.seed))
      .then(resume);
  }

  private restartLeg(): void {
    const level = this.ctx.level;
    const seed = this.ctx.rng.seedValue;
    void this.frontEnd
      .curtainOver(() => this.rebuild(level, seed))
      .then(() => {
        this.ctx.bus.emit("game:start");
        this.frontEnd.showPlay(true);
      });
  }

  private toTitle(): void {
    const level = resolveLevel();
    void this.frontEnd
      .curtainOver(() => this.rebuild(level, seedFor(level)))
      .then(() => this.frontEnd.showTitle(saveMeta()));
  }

  // ── run (re)construction ────────────────────────────────────────────────

  private buildWorld(level: LevelDef, seed: number): WorldState {
    setActiveLevel(level);
    const rng = new Rng(seed);
    const world = new Heightfield(rng);
    const whale = new PlayerWhale();
    const pod = new Pod();
    const krill = new KrillStore();
    const schools = new SchoolStore();
    const coral = new CoralStore();
    const ships = new ShipStore();
    const squid = new SquidStore();
    const particles = new ParticleStore();
    const state: WorldState = {
      level,
      rng,
      world,
      whale,
      pod,
      krill,
      schools,
      coral,
      ships,
      squid,
      particles,
    };
    applyLevel(level, rng, world, state);
    return state;
  }

  /** tear the current run down and build a fresh one in its place — same Pixi
   *  renderer, brand-new layer graph / camera / bus / context / systems */
  private rebuild(level: LevelDef, seed: number): void {
    const built = this.buildWorld(level, seed);
    this.assemble(built);
    for (const s of this.systems) s.init?.(this.ctx);
    this.ctx.bus.emit("audio:volume", this.frontEnd.options.volume);
    this.renderScene();
    this.app.render();
  }

  /** camera + layer graph + bus + context for a freshly built world, discarding
   *  whatever run's display objects were live before it. Shared by the
   *  production run and the preview gallery; production layers the game's
   *  event wiring + system list on top (`assemble`). */
  private buildContext(built: WorldState): GameContext {
    for (const s of this.systems) s.dispose?.();

    const camera = new Camera();
    camera.x = built.whale.x;
    camera.y = built.whale.y;
    const layers = new Layers();
    if (this.layers)
      this.app.stage.removeChild(this.layers.world, this.layers.overlay);
    this.app.stage.addChild(layers.world, layers.overlay);
    this.layers = layers;

    this.clock.reset();

    this.ctx = {
      app: this.app,
      bus: new EventBus(),
      rng: built.rng,
      clock: this.clock,
      camera,
      input: this.input,
      layers,
      world: built.world,
      level: built.level,
      whale: built.whale,
      pod: built.pod,
      krill: built.krill,
      schools: built.schools,
      coral: built.coral,
      ships: built.ships,
      squid: built.squid,
      song: new SongField(),
      particles: built.particles,
      stats: new RunStats(),
      score: new Score(),
      running: false,
    };
    return this.ctx;
  }

  /** wire a freshly built world into `ctx` + `this.systems`, discarding
   *  whatever run was live before it */
  private assemble(built: WorldState): void {
    const { bus } = this.buildContext(built);
    const almanac = new AlmanacSystem(this.profile);

    bus.on("game:start", () => {
      this.clock.markStarted();
      this.ctx.running = true;
    });
    bus.on("game:over", ({ won }) => {
      this.ctx.running = false;
      this.frontEnd.showEnd(endCard(this.ctx, won), almanac.fresh);
    });
    bus.on("game:pause", () => {
      this.ctx.running = false;
    });
    bus.on("game:resume", () => {
      this.ctx.running =
        this.clock.started && this.ctx.whale.alive && !this.ctx.whale.done;
    });
    bus.on("almanac:unlocked", (f) => this.frontEnd.toast(f));

    // order matters: input/physics -> reactions -> camera -> renderers -> hud
    this.systems = [
      this.audio,
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
      almanac,
      new CameraSystem(),

      ...renderSystems(),

      new Hud(),
      new ScoreHud(),
      new DepthRuler(),
      new Hints(),
      new TouchControls(),
    ];
  }

  /** `resizeTo: window` only reacts to `window`'s own `resize` event, which
   *  mobile Safari doesn't reliably fire when just the address-bar/toolbar
   *  shows or hides — the canvas is then left sized for the wrong viewport
   *  and the newly-revealed strip renders blank. `visualViewport` fires for
   *  exactly this case, so force a resize off of it too. */
  private trackVisualViewport(): void {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = (): void => this.app.resize();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
  }

  /** device pixel ratio (capped at 2) scaled by the quality setting */
  private renderResolution(): number {
    return Math.min(window.devicePixelRatio || 1, 2) * quality().renderScale;
  }

  /** create the Pixi renderer. Some mobile GPUs reject a WebGL context
   *  requested with antialiasing / a high device-pixel resolution but accept
   *  a plainer one, so a first failure gets one retry on a fresh Application
   *  with those attributes stripped before boot gives up entirely. */
  private async initRenderer(preview: boolean): Promise<void> {
    const size = preview
      ? { width: PREVIEW_SIZE.w, height: PREVIEW_SIZE.h }
      : { resizeTo: window };
    try {
      await this.app.init({
        ...size,
        antialias: true,
        background: C.abyss,
        resolution: this.renderResolution(),
        autoDensity: true,
      });
    } catch (err) {
      console.warn("renderer init failed, retrying with reduced settings", err);
      this.app = new Application();
      await this.app.init({
        ...size,
        antialias: false,
        background: C.abyss,
        resolution: 1,
        autoDensity: true,
      });
    }
  }

  private applyRenderScale(): void {
    const r = this.renderResolution();
    if (Math.abs(this.app.renderer.resolution - r) < 1e-3) return;
    this.app.renderer.resolution = r;
    // re-fit the canvas to the window at the new density
    this.app.resize();
  }

  private frame = (nowMs: number): void => {
    this.clock.tick(nowMs);
    const { ctx } = this;

    ctx.input.poll();
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
