/**
 * Seeded PRNG plus the value-noise helpers the world generator and the
 * simulation drift both use. One instance = one deterministic stream; create
 * separate instances if a subsystem needs its own reproducible stream.
 */
export class Rng {
  private seed: number;
  /** the seed this stream was created with — identifies the generated world */
  readonly seedValue: number;

  constructor(seed: number) {
    this.seedValue = seed >>> 0;
    this.seed = seed >>> 0;
  }

  /** uniform [0, 1) */
  next(): number {
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  /** uniform [a, b) */
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

// Stateless hash-noise, used for spatial drift that must not consume the seeded
// stream (so gameplay stays deterministic regardless of camera culling, etc.).
export function hash(i: number): number {
  const h = Math.sin(i * 127.1) * 43758.5453;
  return h - Math.floor(h);
}

export function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1;
}

export function fbm(x: number): number {
  return (
    noise1(x) * 0.6 + noise1(x * 2.3 + 11) * 0.28 + noise1(x * 4.7 + 37) * 0.12
  );
}
