/**
 * The Pixi scene graph, one named layer per visual concern. Renderers own a
 * layer and never touch another's. Draw order is the array below — insert a new
 * layer name in the right place and add a renderer for it.
 */
import {
  BlurFilter,
  Container,
  Graphics,
  ParticleContainer,
  Sprite,
} from "pixi.js";

export const LAYER_ORDER = [
  "sky",
  "water",
  "column",
  "surface",
  "shafts",
  "snow",
  "terrainFar",
  "terrain",
  "coral",
  "fish",
  "krill",
  "whales",
  "predators",
  "ships",
  "caustics",
  "darkness",
  "sparks",
  "glow",
] as const;

export type LayerName = (typeof LAYER_ORDER)[number];

export class Layers {
  /** the container everything world-space lives in (shake is applied here) */
  readonly world = new Container();
  /** screen-space overlay drawn on top of the world (vignette) */
  readonly overlay = new Container();

  /** everything above the waterline: the sky dome, sun/moon, clouds, stars,
   * gulls and the horizon haze. Drawn procedurally, not a baked gradient. */
  readonly sky = new Graphics();
  readonly waterSprite = new Sprite();
  /** the body of the water: drifting haze lenses and the thermocline seam,
   * drawn over the column gradient and under everything that swims in it */
  readonly column = new Graphics();
  /** animated wavy waterline */
  readonly surface = new Graphics();
  readonly shafts = new Graphics();
  readonly snow = new Graphics();
  /** distant seabed ridge, scrolled at a parallax fraction behind `terrain` */
  readonly terrainFar = new Graphics();
  readonly terrain = new Graphics();
  readonly coral = new Graphics();
  readonly fish = new Graphics();
  /** krill parts as GPU-instanced quads — one `Particle` per part, owned and
   * positioned each frame by `KrillRenderer` */
  readonly krill = new ParticleContainer({
    dynamicProperties: { position: true, color: true },
  });
  readonly whales = new Graphics();
  /** deep-water squid, drawn just over the whales */
  readonly predators = new Graphics();
  readonly ships = new Graphics();
  readonly caustics = new Graphics();

  /** depth darkness: a world-anchored gradient (surface → full dark) plus a
   * solid fill below the light line */
  readonly darkGrad = new Sprite();
  readonly darkFill = new Graphics();

  /** bioluminescent sparks in the deep — additive, drawn over the darkness so
   * they read as light sources rather than as specks the dark swallows */
  readonly sparks = new Graphics();

  /** additive, blurred bloom pass */
  readonly glowGraphics = new Graphics();
  readonly glow = new Container();

  readonly vignette = new Sprite();

  constructor() {
    this.shafts.blendMode = "add";
    this.caustics.blendMode = "add";
    this.sparks.blendMode = "add";
    this.glow.blendMode = "add";
    this.glow.addChild(this.glowGraphics);
    try {
      this.glow.filters = [new BlurFilter({ strength: 12, quality: 3 })];
    } catch {
      /* filters unsupported — still readable without the bloom */
    }

    this.world.addChild(
      this.sky,
      this.waterSprite,
      this.column,
      this.surface,
      this.shafts,
      this.snow,
      this.terrainFar,
      this.terrain,
      this.coral,
      this.fish,
      this.krill,
      this.whales,
      this.predators,
      this.ships,
      this.caustics,
      this.darkFill,
      this.darkGrad,
      this.sparks,
      this.glow,
    );
    this.overlay.addChild(this.vignette);
  }
}
