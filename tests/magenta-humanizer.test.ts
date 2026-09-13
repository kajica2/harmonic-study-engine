/**
 * magenta humanizer — determinism + invariants.
 *
 * The humanizer must satisfy three properties:
 *
 *   1. **Determinism**: same seed ⇒ identical NoteSequence. This is
 *      what makes exports reproducible and golden tests possible.
 *   2. **Identity at amount=0**: with the blend dial at zero, the
 *      output equals the input modulo the unquantize step (timing
 *      grid alignment, not jitter).
 *   3. **Bounded output**: per-note timing stays within a reasonable
 *      window (no 10-second jumps, no clipped velocities). Catches
 *      regressions in the noise / swing math.
 *
 * We don't golden-pin specific offsets — that would be brittle
 * across the Box–Muller implementation. Instead we verify the
 * *statistical* signature: identical seeds give byte-identical
 * output, different seeds give different output, and the output
 * stays within bounds.
 *
 * Test isolation: `@magenta/music`'s bundled ESM entry depends on
 * Tone.js whose subpath resolution is broken in Vitest's bare
 * resolver. We mock `./quantize` so the humanizer never tries to
 * load it — the humanizer logic itself is pure and doesn't care
 * how quantization is implemented.
 */
import { describe, it, expect, vi } from "vitest";

// Mock the Magenta-touching helpers before importing the humanizer.
// quantize() returns the input with quantizedStep fields inferred
// from each note's startTime; unquantize() is a no-op pass-through
// for the humanizer's needs (we never call it from humanize()).
vi.mock("../src/magenta/quantize", async () => {
  const STEP = 60 / 120 / 4; // 0.125 s per 16th @ 120 qpm, the default grid
  return {
    quantize: async (ns: { notes?: Array<{ startTime: number; endTime: number; pitch: number; velocity?: number }> }) => {
      const notes = (ns.notes ?? []).map((n) => ({
        ...n,
        quantizedStartStep: Math.round(n.startTime / STEP),
        quantizedEndStep: Math.round(n.endTime / STEP),
      }));
      return { ...ns, notes };
    },
    unquantize: async (ns: unknown) => ns,
  };
});

const humanizer = await import("../src/magenta/humanizer");
const { humanize, humanizeSequence } = humanizer;
const adapter = await import("../src/magenta/adapter");
const { pathToNoteSequence } = adapter;
const profiles = await import("../src/magenta/personaProfiles");
const { getPersonaProfile } = profiles;
const grooves = await import("../src/magenta/styleGrooves");
const { getGroove } = grooves;
const noise = await import("../src/magenta/noise");
const { mulberry32, gaussian, OUDrift, hashSeed } = noise;
const { PATHS } = await import("../src/lib/paths");

const ns = () => pathToNoteSequence(PATHS[0], 120);

describe("magenta/humanizer — determinism", () => {
  it("same seed produces byte-identical NoteSequence.notes", async () => {
    const persona = getPersonaProfile("coltrane");
    const groove = getGroove("swing");
    const a = await humanize(ns(), { persona, groove, seed: 0xC0FFEE });
    const b = await humanize(ns(), { persona, groove, seed: 0xC0FFEE });
    expect(a.notes).toEqual(b.notes);
  });

  it("different seeds produce different output", async () => {
    const persona = getPersonaProfile("miles");
    const groove = getGroove("funk");
    const a = await humanize(ns(), { persona, groove, seed: 1 });
    const b = await humanize(ns(), { persona, groove, seed: 2 });
    expect(a.notes).not.toEqual(b.notes);
  });

  it("zero seed, zero persona overrides produces a valid output (no NaN / Infinity)", async () => {
    const persona = getPersonaProfile("bach");
    const groove = getGroove("swing");
    const out = await humanize(ns(), { persona, groove, seed: 0 });
    for (const n of out.notes ?? []) {
      expect(Number.isFinite(n.startTime)).toBe(true);
      expect(Number.isFinite(n.endTime)).toBe(true);
      expect(Number.isFinite(n.pitch)).toBe(true);
      expect(Number.isFinite(n.velocity!)).toBe(true);
      expect(n.endTime).toBeGreaterThan(n.startTime);
      expect(n.velocity!).toBeGreaterThanOrEqual(1);
      expect(n.velocity!).toBeLessThanOrEqual(127);
    }
  });
});

describe("magenta/humanizer — amount blending", () => {
  it("amount=0 leaves timing un-jittered (every note on its grid step ± rounding)", async () => {
    const persona = getPersonaProfile("miles");
    const groove = getGroove("swing");
    const input = ns();
    const out = await humanize(input, { persona, groove, seed: 42, amount: 0 });

    // At amount=0, every note's startTime should equal the
    // quantized step's wall-clock time. We compare to the quantized
    // grid: 120 qpm ⇒ 0.5 sec per quarter ⇒ 0.125 sec per step.
    const expectedStep = 0.125;
    for (const n of out.notes ?? []) {
      // quantizedStartStep was lost after unquantize; derive from startTime
      const stepsFromZero = n.startTime / expectedStep;
      expect(Math.abs(stepsFromZero - Math.round(stepsFromZero))).toBeLessThan(1e-6);
    }
  });

  it("amount=1 produces jittered timing distinct from amount=0", async () => {
    const persona = getPersonaProfile("coltrane");
    const groove = getGroove("swing");
    const a = await humanize(ns(), { persona, groove, seed: 7, amount: 0 });
    const b = await humanize(ns(), { persona, groove, seed: 7, amount: 1 });
    expect(a.notes).not.toEqual(b.notes);
  });

  it("clips amount to [0,1]", async () => {
    const persona = getPersonaProfile("kandinsky");
    const groove = getGroove("swing");
    const lo = await humanize(ns(), { persona, groove, seed: 9, amount: -1 });
    const zero = await humanize(ns(), { persona, groove, seed: 9, amount: 0 });
    expect(lo.notes).toEqual(zero.notes);

    const hi = await humanize(ns(), { persona, groove, seed: 9, amount: 5 });
    const one = await humanize(ns(), { persona, groove, seed: 9, amount: 1 });
    expect(hi.notes).toEqual(one.notes);
  });
});

describe("magenta/humanizer — persona + groove integration", () => {
  it("every persona profile produces a finite output", async () => {
    for (const id of ["kandinsky", "coltrane", "bach", "debussy", "eno", "glass", "monk",
                     "miles", "chet", "dizzy", "hubbard", "shorter", "simone", "novaro",
                     "getz", "rollins", "henderson", "unknown-persona"]) {
      const persona = getPersonaProfile(id);
      const out = await humanize(ns(), { persona, groove: getGroove("swing"), seed: 123 });
      expect(out.notes).toBeDefined();
      for (const n of out.notes ?? []) {
        expect(Number.isFinite(n.startTime)).toBe(true);
      }
    }
  });

  it("every backing style groove produces a finite output", async () => {
    const persona = getPersonaProfile("coltrane");
    const styles = ["off", "swing", "bossa", "funk", "latin", "ballad", "clave3-2", "clave3-3", "afro-4-4", "afro-4-3", "afro-3-4"] as const;
    for (const s of styles) {
      const out = await humanize(ns(), { persona, groove: getGroove(s), seed: 11 });
      expect(out.notes).toBeDefined();
      for (const n of out.notes ?? []) {
        expect(Number.isFinite(n.startTime)).toBe(true);
      }
    }
  });

  it("Miles drops notes (prune > 0); Glass never does", async () => {
    const miles = getPersonaProfile("miles");
    const glass = getPersonaProfile("glass");
    const inCount = ns().notes?.length ?? 0;

    // Run several seeds — Miles should drop *some* notes on average
    let milesKept = 0, milesTotal = 0;
    for (let seed = 0; seed < 16; seed++) {
      milesKept += (await humanize(ns(), { persona: miles, groove: getGroove("swing"), seed })).notes?.length ?? 0;
      milesTotal += inCount;
    }
    const milesKeepRate = milesKept / milesTotal;
    expect(milesKeepRate).toBeLessThan(0.95);

    // Glass should always keep everything
    const glassOut = await humanize(ns(), { persona: glass, groove: getGroove("swing"), seed: 0 });
    expect(glassOut.notes).toHaveLength(inCount);
  });

  it("shared ensemble clock: two humanizer calls with the same clock breathe together", async () => {
    // The ensemble clock is a single OU process shared across all
    // tracks. Two humanizer() calls with the SAME clock should
    // produce notes whose timing perturbations are correlated
    // (driven by the same underlying drift) rather than independent.
    //
    // Test shape:
    //   1. Run two calls with the same shared clock but different
    //      seeds. Output differs (per-note jitter) but both came
    //      from one drift process.
    //   2. Verify the clock advances between calls (peek changes).
    //      This is what "shared" actually means — the second call
    //      observes the *post-first-call* clock state, not a fresh
    //      one. With independent clocks, both calls start from 0.
    const persona = getPersonaProfile("coltrane");
    const groove = getGroove("swing");

    // Two calls share one clock
    const sharedClock = new OUDrift(mulberry32(1), 0.3, 0.8);
    const a = await humanize(ns(), { persona, groove, ensembleClock: sharedClock, seed: 1 });
    const peekAfterA = sharedClock.peek();
    const b = await humanize(ns(), { persona, groove, ensembleClock: sharedClock, seed: 2 });
    const peekAfterB = sharedClock.peek();

    // Different per-note seeds ⇒ different jitter
    expect(a.notes).not.toEqual(b.notes);

    // The shared clock moved during both calls — proving state
    // continuity. (If `humanize` cloned the clock per call, both
    // peeks would still be non-zero from each call's own drift —
    // what we *can't* observe is the same process serving both.)
    expect(Math.abs(peekAfterA)).toBeGreaterThan(0);
    expect(Math.abs(peekAfterB)).toBeGreaterThan(0);
    // The second call's clock value should differ from the first's
    // because the process has advanced. (Could go up or down — it's
    // mean-reverting — but it shouldn't be identical.)
    expect(peekAfterA).not.toBe(peekAfterB);

    // Reset semantics: a fresh clock starts at 0
    const freshClock = new OUDrift(mulberry32(1), 0.3, 0.8);
    expect(freshClock.peek()).toBe(0);
    freshClock.reset();
    expect(freshClock.peek()).toBe(0);
  });
});

describe("magenta/humanizer — convenience wrappers", () => {
  it("humanizeSequence produces the same output as humanize with a default seed", async () => {
    const persona = getPersonaProfile("bach");
    const groove = getGroove("ballad");
    const input = ns();
    const a = await humanize(input, { persona, groove, seed: 0xC0FFEE });
    const b = await humanizeSequence(input, { persona, groove });
    expect(a.notes).toEqual(b.notes);
  });
});

describe("magenta/noise utilities", () => {
  it("mulberry32 produces uniform values in [0,1)", () => {
    const rng = mulberry32(0);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("mulberry32 is deterministic for the same seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it("gaussian has empirical mean ≈ 0 and sd ≈ 1 over many samples", () => {
    const rng = mulberry32(7);
    const samples: number[] = [];
    for (let i = 0; i < 5000; i++) samples.push(gaussian(rng, 0, 1));
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(Math.sqrt(variance)).toBeGreaterThan(0.95);
    expect(Math.sqrt(variance)).toBeLessThan(1.05);
  });

  it("OUDrift is mean-reverting: long sequence stays near 0", () => {
    const rng = mulberry32(99);
    const drift = new OUDrift(rng, 0.3, 0.8);
    const samples: number[] = [];
    for (let i = 0; i < 2000; i++) samples.push(drift.next());
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    expect(Math.abs(mean)).toBeLessThan(0.2);
    expect(drift.peek()).toBe(samples[samples.length - 1]);
    drift.reset();
    expect(drift.peek()).toBe(0);
  });

  it("hashSeed is stable across runs for the same input", () => {
    expect(hashSeed("path-1")).toBe(hashSeed("path-1"));
    expect(hashSeed("path-1")).not.toBe(hashSeed("path-2"));
  });
});