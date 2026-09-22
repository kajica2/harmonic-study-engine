/**
 * engine/core/rng.ts - REQ-FND-2 / REQ-FND-3 / REQ-NFR-7.
 *
 * The ONLY sanctioned source of randomness for engine code. Generators
 * (Phases 3+) must thread an Rng; Math.random is banned by
 * engine/purity.test.ts.
 *
 * mulberry32 and hashSeed were MOVED verbatim from
 * src/magenta/noise.ts (single source of truth; noise.ts re-exports
 * them so every existing magenta/lib consumer keeps working with zero
 * behavior change - golden humanizer tests pin the exact stream).
 */

/** uint32 seed, 0..4294967295. */
export type Seed = number;

/**
 * mulberry32 - 32-bit seeded PRNG. Tiny, fast, statistically adequate
 * for musical jitter (not cryptography). Returns a closure yielding
 * the next uniform draw in [0, 1).
 *
 * Body is byte-identical to the original in src/magenta/noise.ts.
 * Do not "improve" it: same seed must produce the same stream forever
 * (REQ-FND-3), and magenta golden tests depend on exact values.
 */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a string hash -> uint32. Moved verbatim from noise.ts.
 * Collisions are acceptable (derived jitter seeds, cosmetic ids).
 */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Weighted<T> {
  readonly item: T;
  /** Non-negative. Total across the list must be > 0. */
  readonly weight: number;
}

/**
 * Object facade over mulberry32. One Rng per generator call; never
 * share an Rng across independent outputs (streams would interleave
 * and break reproducibility).
 */
export interface Rng {
  /** The seed this handle was created from (for logging/annotations). */
  readonly seed: Seed;
  /** Next uniform draw in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). RangeError if maxExclusive < 1. */
  int(maxExclusive: number): number;
  /** Integer in [minIncl, maxIncl]. RangeError if minIncl > maxIncl. */
  range(minIncl: number, maxIncl: number): number;
  /** Coin flip; P(true) = p (default 0.5). */
  bool(p?: number): boolean;
  /** Uniform element. RangeError on empty array. Input never mutated. */
  pick<T>(arr: readonly T[]): T;
  /** Weighted selection by cumulative scan. RangeError on empty or
   *  total weight <= 0. */
  weighted<T>(items: readonly Weighted<T>[]): T;
  /** Fisher-Yates on a COPY (input untouched), descending sweep. */
  shuffle<T>(arr: readonly T[]): T[];
}

export function createRng(seed: Seed): Rng {
  const s = seed >>> 0;
  const next = mulberry32(s);
  // int is a closure, not an object method, so range() can call it
  // directly: destructured const { range } = rng must not depend on
  // a `this` receiver (it would be undefined and throw).
  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
      throw new RangeError(`int: maxExclusive must be >= 1, got ${maxExclusive}`);
    }
    return Math.floor(next() * maxExclusive);
  };
  return {
    seed: s,
    next,
    int,
    range(minIncl, maxIncl) {
      if (minIncl > maxIncl) {
        throw new RangeError(`range: empty range ${minIncl}..${maxIncl}`);
      }
      return minIncl + int(maxIncl - minIncl + 1);
    },
    bool(p = 0.5) {
      return next() < p;
    },
    pick(arr) {
      if (arr.length === 0) throw new RangeError("pick: empty array");
      return arr[Math.floor(next() * arr.length)];
    },
    weighted(items) {
      if (items.length === 0) throw new RangeError("weighted: empty items");
      let total = 0;
      for (const it of items) total += it.weight;
      if (total <= 0) throw new RangeError("weighted: total weight <= 0");
      let roll = next() * total;
      for (const it of items) {
        roll -= it.weight;
        if (roll < 0) return it.item;
      }
      return items[items.length - 1].item; // float-safety fallback
    },
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
  };
}
