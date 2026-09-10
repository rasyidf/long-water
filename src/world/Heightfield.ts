/**
 * The static world: a WFC tiling turned into a smoothed seabed heightfield,
 * plus the sonar-lit accumulator that renderers read. Built once at start.
 */
import { CELL, COL, NCELL, NCOL } from "../config/constants";
import { LEG } from "../config/route";
import { TILES } from "../config/tiles";
import { clamp, lerp } from "../core/math";
import { fbm, type Rng } from "../core/rng";
import { wfc } from "./Wfc";

export class Heightfield {
  readonly tiles: number[];
  readonly floorY = new Float32Array(NCOL);
  /** 0..1 per column, decays over time; raised where a ping sweeps rock */
  readonly floorLit = new Float32Array(NCOL);

  constructor(rng: Rng) {
    this.tiles = wfc(NCELL, rng);
    this.buildFloor(rng);
  }

  private buildFloor(rng: Rng): void {
    const target = new Float32Array(NCELL);
    const rough = new Float32Array(NCELL);
    for (let c = 0; c < NCELL; c++) {
      const t = TILES[this.tiles[c]];
      target[c] = rng.range(t.depth[0], t.depth[1]);
      rough[c] = t.rough;
    }
    for (let i = 0; i < NCOL; i++) {
      const x = i * COL;
      const g = x / CELL;
      const c0 = clamp(Math.floor(g), 0, NCELL - 1);
      const c1 = clamp(c0 + 1, 0, NCELL - 1);
      const f = g - c0;
      const u = f * f * (3 - 2 * f); // smoothstep between cell centres
      const base = lerp(target[c0], target[c1], u);
      const r = lerp(rough[c0], rough[c1], u);
      this.floorY[i] =
        base + fbm(x * 0.00085) * 260 * r + fbm(x * 0.0043 + 19) * 55 * r;
    }
    for (let pass = 0; pass < 4; pass++) {
      const src = this.floorY.slice();
      for (let i = 2; i < NCOL - 2; i++)
        this.floorY[i] =
          (src[i - 2] +
            src[i - 1] * 4 +
            src[i] * 6 +
            src[i + 1] * 4 +
            src[i + 2]) /
          16;
    }
    // a shallow floor so the shelf and seamount peaks can reach the sunlit
    // zone (coral, reef fish) — but never so shallow the whale beaches
    for (let i = 0; i < NCOL; i++)
      this.floorY[i] = Math.max(200, this.floorY[i]);

    this.carveTrenches(rng);
  }

  /** Punch a few narrow, near-vertical slots through canyon/trench cells. Run
   * after the smoothing passes so the walls stay sharp instead of blurring
   * into a shallow bowl — the route needs the occasional plunge into black. */
  private carveTrenches(rng: Rng): void {
    for (let cell = 1; cell < NCELL - 1; cell++) {
      const name = TILES[this.tiles[cell]].name;
      if (name !== "canyon" && name !== "trench") continue;
      if (rng.next() < 0.45) continue;
      const centre = Math.round(((cell + rng.next()) * CELL) / COL);
      const halfW = rng.next() < 0.3 ? 1 : 0;
      const floor = rng.range(4700, 5800);
      for (let i = centre - halfW - 1; i <= centre + halfW + 1; i++) {
        if (i < 2 || i > NCOL - 3) continue;
        const d = clamp(Math.abs(i - centre) / (halfW + 1), 0, 1);
        this.floorY[i] = Math.max(
          this.floorY[i],
          lerp(floor, this.floorY[i], d * d),
        );
      }
    }
  }

  floorAt(x: number): number {
    const i = clamp(Math.floor(x / COL), 0, NCOL - 2);
    const f = (x - i * COL) / COL;
    return lerp(this.floorY[i], this.floorY[i + 1], f);
  }

  tileNameAt(x: number): string {
    return TILES[this.tiles[clamp(Math.floor(x / CELL), 0, NCELL - 1)]].name;
  }

  /** past the goal line */
  get finishX(): number {
    return LEG.finishX;
  }
}
