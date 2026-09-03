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
 * Module-private cache for Box–Muller's spare sample.
 * Lives at module scope (not on the function object) because attaching
 * arbitrary fields to a function expression triggers TS2395 / TS2339
 * in strict mode — easier to keep it here than to fight the merger.
 */
let _spareNormal: number | undefined;

/**
 * Standard normal sample (mean 0, sd 1) via Box–Muller.
 * Each call consumes two uniform draws; we cache the second so
 * successive calls don't waste entropy.
 */
export function gaussian(rng: () => number, mean = 0, sd = 1): number {
  // Reuse the cached second sample when available
  if (_spareNormal !== undefined) {
    const v = _spareNormal * sd + mean;
    _spareNormal = undefined;
    return v;
  }
  // Avoid log(0) — clamp u away from 0
  const u = Math.max(1e-12, 1 - rng());
  const v = rng();
  const mag = sd * Math.sqrt(-2 * Math.log(u));
  _spareNormal = (mag * Math.sin(2 * Math.PI * v)) / sd;
  return mean + mag * Math.cos(2 * Math.PI * v);
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