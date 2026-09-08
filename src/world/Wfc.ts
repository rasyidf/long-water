/**
 * 1D wave-function collapse over the terrain tiles. Terrain *type* is chosen by
 * WFC, then `Heightfield` turns the tiling into a depth profile — so the route
 * has legible regions rather than undifferentiated noise lumps.
 */
import { RULES, TI, TILES } from "../config/tiles";
import type { Rng } from "../core/rng";

const ADJ = new Uint8Array(TILES.length);
(function buildAdj() {
  const m = TILES.map(() => 0);
  for (const a in RULES)
    for (const b of RULES[a]) {
      m[TI[a]] |= 1 << TI[b];
      m[TI[b]] |= 1 << TI[a]; // forced symmetric
    }
  for (let i = 0; i < m.length; i++) ADJ[i] = m[i];
})();

const FULL = (1 << TILES.length) - 1;

function bits(mask: number): number[] {
  const o: number[] = [];
  for (let i = 0; i < TILES.length; i++) if (mask & (1 << i)) o.push(i);
  return o;
}
function popcount(m: number): number {
  let c = 0;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
}
function neighbourMask(mask: number): number {
  let out = 0;
  for (const i of bits(mask)) out |= ADJ[i];
  return out;
}

function propagate(dom: number[]): boolean {
  const q: number[] = [];
  for (let i = 0; i < dom.length; i++) q.push(i);
  while (q.length) {
    const i = q.pop()!;
    const allowed = neighbourMask(dom[i]);
    for (const j of [i - 1, i + 1]) {
      if (j < 0 || j >= dom.length) continue;
      const next = dom[j] & allowed;
      if (next === 0) return false;
      if (next !== dom[j]) {
        dom[j] = next;
        q.push(j);
      }
    }
  }
  return true;
}

/** Collapse `n` cells into concrete tile indices. Falls back to all-plain. */
export function wfc(n: number, rng: Rng): number[] {
  for (let attempt = 0; attempt < 60; attempt++) {
    const dom = new Array<number>(n).fill(FULL);
    // route starts on the shelf, ends in shallow warm water
    dom[0] = 1 << TI.shelf;
    dom[1] = 1 << TI.shelf;
    dom[n - 1] = 1 << TI.shelf;
    dom[n - 2] = (1 << TI.shelf) | (1 << TI.slope);
    if (!propagate(dom)) continue;

    let ok = true;
    for (;;) {
      let best = -1;
      let bestCount = 99;
      for (let i = 0; i < n; i++) {
        const c = popcount(dom[i]);
        if (c > 1 && (c < bestCount || (c === bestCount && rng.next() < 0.3))) {
          best = i;
          bestCount = c;
        }
      }
      if (best < 0) break;
      const opts = bits(dom[best]);
      let total = 0;
      for (const t of opts) total += TILES[t].weight;
      let r = rng.next() * total;
      let pick = opts[opts.length - 1];
      for (const t of opts) {
        r -= TILES[t].weight;
        if (r <= 0) {
          pick = t;
          break;
        }
      }
      dom[best] = 1 << pick;
      if (!propagate(dom)) {
        ok = false;
        break;
      }
    }
    if (ok) return dom.map((m) => bits(m)[0]);
  }
  return new Array<number>(n).fill(TI.plain);
}
