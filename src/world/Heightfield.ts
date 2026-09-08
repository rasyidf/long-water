/**
 * The static world: a WFC tiling turned into a smoothed seabed heightfield,
 * plus the sonar-lit accumulator that renderers read. Built once at start.
 */
import { CELL, COL, NCELL, NCOL, WORLD_W } from "../config/constants";
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
    for (let i = 0; i < NCOL; i++)
      this.floorY[i] = Math.max(700, this.floorY[i]);
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
    return WORLD_W - 400;
  }
}
