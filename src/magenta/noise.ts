/**
 * magenta/noise.ts
 * ────────────────
 * Seeded randomness utilities used by every humanization transform.
 *
 * Why seeded? Two reasons:
 *   1. **Reproducible exports** — same path + same seed ⇒ identical
 *      NoteSequence. Critical for tests and for users sharing a study.
 *   2. **Phrase coherence** — `mulberry32(seed)` gives the humanizer a
 *      32-bit state machine that doesn't drift across calls (unlike
 *      `Math.random()`), so a flammed snare at beat 4 stays flammed
 *      on every replay.
 *
 * The Box–Muller transform converts two uniform draws into one
 * Gaussian sample — this is how we get bell-curve timing jitter
 * without importing a stats library.
 *
 * The Ornstein–Uhlenbeck drift is a *mean-reverting* random walk: it
 * wanders but always pulls back toward 0. That's the mathematical
 * shape of "musicians speed up and slow down but never lose the
 * tempo for good." Using one OU process for the whole ensemble
 * (rather than per-track i.i.d. noise) is the difference between
 * "everyone in their own world" and "everyone breathes together."
 */
import type { INote } from "./INoteSequence";

/**
 * mulberry32 — 32-bit seeded PRNG.
 * Tiny (~5 lines), fast, passes the basic statistical sanity checks
 * we need (we're not doing cryptography). Returns a closure that
 * yields the next uniform draw in [0,1).
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
 * Box–Muller transform. The spare sample from one transform is
 * cached per-RNG-instance, NOT module-globally — a module-global
 * cache would mean two independent `mulberry32(seed)` calls share
 * state, breaking the "same seed ⇒ identical sequence" guarantee
 * that the mix humanizer and golden tests require.
 */
function _gaussian(rng: () => number, mean: number, sd: number, cache: { spare?: number }): number {
  // Reuse the cached second sample when available
  if (cache.spare !== undefined) {
    const v = cache.spare * sd + mean;
    cache.spare = undefined;
    return v;
  }
  // Avoid log(0) — clamp u away from 0
  const u = Math.max(1e-12, 1 - rng());
  const v = rng();
  const mag = sd * Math.sqrt(-2 * Math.log(u));
  cache.spare = (mag * Math.sin(2 * Math.PI * v)) / sd;
  return mean + mag * Math.cos(2 * Math.PI * v);
}

/**
 * Standard normal sample (mean 0, sd 1) via Box–Muller.
 * Public wrapper that allocates a tiny cache object per call so
 * the "two-handles with the same seed produce identical sequences"
 * property holds. For hot loops, use `createGaussian` to share a
 * single cache across many calls.
 */
export function gaussian(rng: () => number, mean = 0, sd = 1): number {
  return _gaussian(rng, mean, sd, {});
}

/**
 * Build a Gaussian sampler bound to a per-handle Box–Muller cache.
 * Use this when sampling thousands of normals from the same RNG
 * to avoid allocating one throwaway object per call.
 */
export function createGaussian(rng: () => number) {
  const cache: { spare?: number } = {};
  return (mean = 0, sd = 1) => _gaussian(rng, mean, sd, cache);
}

/**
 * Ornstein–Uhlenbeck drift.
 *
 * Models "tempo that wanders but recovers" — dx = θ(μ−x)dt + σ dW.
 * Discrete update: x ← x + θ(−x) + σ·N(0,1)
 *
 * Defaults: θ=0.3 (mean-reverts over a few beats), σ=0.8 (≈ ±1–2 BPM
 * of deviation when scaled). One instance shared by the whole
 * ensemble so all tracks breathe together.
 */
export class OUDrift {
  private x = 0;
  constructor(
    private rng: () => number,
    /** Pull-back strength per step (0..1). Higher = recovers faster. */
    private theta: number = 0.3,
    /** Step-size volatility. Output is in same units as the caller
     *  scales it by (BPM, ms, etc.). */
    private sigma: number = 0.8,
  ) {}

  /** Advance one step and return the current drift value. */
  next(): number {
    this.x = this.x + this.theta * -this.x + gaussian(this.rng, 0, this.sigma);
    return this.x;
  }

  /** Current drift without advancing. */
  peek(): number {
    return this.x;
  }

  /** Reset the process (e.g. between paths). */
  reset(): void {
    this.x = 0;
  }
}

/**
 * Build a deterministic seed from a string (path id, persona id…).
 * Uses a tiny xorshift-style hash; collisions are acceptable because
 * this is only used to derive per-note jitter, not security.
 */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Type-guard for note-on-screen: returns true if the note carries
 * a quantized start step (i.e. it's a grid-aligned note, not a
 * free-time one). Used by the humanizer to decide which transforms
 * to apply.
 */
export function hasQuantizedStep(n: INote): n is INote & { quantizedStartStep: number; quantizedEndStep: number } {
  return typeof n.quantizedStartStep === "number" && typeof n.quantizedEndStep === "number";
}