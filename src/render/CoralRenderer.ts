/**
 * Coral reefs: static growths rooted in the shallow shelf and seamount rock.
 * A pure consumer of `CoralStore` — culls to the viewport, works out how much
 * light reaches each growth (ambient by depth, lifted when a sonar sweep lights
 * the seabed rim under it, read from `world.floorLit` and never written), and
 * hands the item to a swappable `CoralView` for the drawing.
 *
 * The shapes, the current that sways them and the dials live under
 * `render/coral/`; the designer (`tools.html#coral`) drives the same view.
 */
import { COL, NCOL } from "../config/constants";
import { clamp } from "../core/math";
import { lightAt } from "../core/light";
import type { GameContext } from "../core/GameContext";
import type { System } from "../core/System";
import type { CoralDrawOptions, CoralView } from "./coral/CoralView";
import { coralParams } from "./coral/params";
import { ProceduralCoralView } from "./coral/ProceduralCoralView";

export class CoralRenderer implements System {
  readonly name = "render:coral";

  /** one options object, rewritten per item, so the loop allocates nothing */
  private readonly opts: CoralDrawOptions = {
    alpha: 1,
    light: 1,
    sonar: 0,
    t: 0,
    params: coralParams(),
  };

  constructor(private view: CoralView = new ProceduralCoralView()) {}

  render(ctx: GameContext): void {
    const { camera: cam, layers: L, world, clock } = ctx;
    // the tallest growth reaches ~1.3× its nominal height; the margin covers
    // a large one leaning in from just off-screen
    const [left, right] = cam.visibleX(500);

    const g = L.coral;
    g.clear();

    const o = this.opts;
    o.params = coralParams();
    o.t = clock.t;

    for (const cr of ctx.coral.items) {
      if (cr.x < left || cr.x > right) continue;
      const col = clamp(Math.round(cr.x / COL), 0, NCOL - 1);
      const light = lightAt(cr.y);
      const sonar = world.floorLit[col];
      const v = Math.max(light * 0.9, sonar * 0.95);
      if (v < 0.05) continue;

      o.alpha = Math.min(1, v);
      o.light = light;
      o.sonar = sonar;
      this.view.draw(g, cr, o, cam);
    }
  }
}
