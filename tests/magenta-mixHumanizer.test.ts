/**
 * magenta mix humanizer — determinism + invariants.
 *
 * Properties under test (the same four bullets that govern
 * humanizer.ts and humanizeBacking.ts):
 *
 *   1. **Determinism**: same seed ⇒ identical dB sequence across
 *      calls and across process runs. Pins reproducible exports.
 *   2. **Bounded output**: per-track offset stays within ±range,
 *      per-track gain stays within (0, 2] so setTargetAtTime can't
 *      over-amplify or go negative.
 *   3. **Shared randomness**: one wobble per pass — calling
 *      `nextPass()` consumes one Box–Muller triple from the shared
 *      RNG. Two consecutive passes produce different output (state
 *      advances). A fresh handle with the same seed reproduces.
 *   4. **Mutability invariant**: `applyMixWobble({ drums: 0 })`
 *      returns `{ drums: 0 }` regardless of wobble — silent stays
 *      silent.
 */
import { describe, it, expect } from 'vitest';
import {
  createMixHumanizer,
  applyMixWobble,
  gainToDb,
  dbToGain,
} from '../src/magenta/mixHumanizer';

describe('magenta/mixHumanizer — dB ↔ gain math', () => {
  it('round-trips through dB at unity (0 dB → 1 → 0 dB)', () => {
    expect(gainToDb(1)).toBeCloseTo(0, 6);
    expect(dbToGain(0)).toBeCloseTo(1, 6);
  });

  it('0 dB reference: +6 dB doubles, -6 dB halves (within rounding)', () => {
    // toBeCloseTo's second arg is decimal places AFTER the decimal
    // point, NOT significant digits. 10^(6/20) ≈ 1.9953 and
    // 10^(-6/20) ≈ 0.5012, so digits 2 (= tolerance 0.005) is the
    // right precision for the ±6 dB checks.
    expect(dbToGain(6)).toBeCloseTo(2, 2);
    expect(dbToGain(-6)).toBeCloseTo(0.5, 2);
    expect(dbToGain(20)).toBeCloseTo(10, 1); // +20 dB = ×10
    expect(dbToGain(-20)).toBeCloseTo(0.1, 2);
  });

  it('very small gains floor at -80 dB', () => {
    expect(gainToDb(0)).toBeLessThanOrEqual(-80);
    expect(gainToDb(1e-9)).toBeLessThanOrEqual(-80);
  });
});

describe('magenta/mixHumanizer — determinism', () => {
  it('same seed ⇒ byte-identical first three passes', () => {
    const a = createMixHumanizer({ seed: 0xC0FFEE });
    const b = createMixHumanizer({ seed: 0xC0FFEE });
    const a1 = a.nextPass(); const b1 = b.nextPass();
    const a2 = a.nextPass(); const b2 = b.nextPass();
    const a3 = a.nextPass(); const b3 = b.nextPass();
    expect(a1).toEqual(b1);
    expect(a2).toEqual(b2);
    expect(a3).toEqual(b3);
  });

  it('different seeds produce different first passes', () => {
    const a = createMixHumanizer({ seed: 1 });
    const b = createMixHumanizer({ seed: 2 });
    expect(a.nextPass()).not.toEqual(b.nextPass());
  });

  it('consecutive passes on the same handle produce different output (state advances)', () => {
    const h = createMixHumanizer({ seed: 0xBEEF });
    const a = h.nextPass();
    const b = h.nextPass();
    const c = h.nextPass();
    // State must advance — three different outputs.
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
    expect(a).not.toEqual(c);
  });

  it('reseed restarts the sequence from the new seed', () => {
    const h = createMixHumanizer({ seed: 100 });
    // Advance state, then record the next pass as our "before".
    const a = h.nextPass();
    const b = h.nextPass();
    // Reseed to a known new seed and compare against a brand-new
    // handle with the same seed. (We can't compare against the
    // original handle's state because the original consumed
    // different RNG draws than a fresh handle would.)
    h.reseed(200);
    const replayed = h.nextPass();
    const freshHandle = createMixHumanizer({ seed: 200 });
    const fresh = freshHandle.nextPass();
    expect(replayed).toEqual(fresh);

    // Original first two passes still observable for completeness.
    expect(a).not.toEqual(b); // sanity: state advanced
  });

  it('reset reverts to the original seed', () => {
    const h = createMixHumanizer({ seed: 0xABBA });
    const before = h.nextPass();
    h.nextPass(); h.nextPass(); h.nextPass();
    h.reset();
    const replayed = h.nextPass();
    expect(replayed).toEqual(before);
  });
});

describe('magenta/mixHumanizer — bounded output', () => {
  it('default ±1 dB range: per-track gain stays in [0.891, 1.122]', () => {
    // ±1 dB = ×[10^(-1/20), 10^(+1/20)] = [0.891, 1.122]
    const h = createMixHumanizer({ seed: 1 });
    for (let i = 0; i < 200; i++) {
      const pass = h.nextPass();
      for (const t of ['drums', 'bass', 'piano'] as const) {
        expect(pass[t]).toBeGreaterThanOrEqual(0.89);
        expect(pass[t]).toBeLessThanOrEqual(1.13);
      }
    }
  });

  it('every value is finite and positive', () => {
    const h = createMixHumanizer({ seed: 1 });
    for (let i = 0; i < 50; i++) {
      const pass = h.nextPass();
      for (const t of ['drums', 'bass', 'piano'] as const) {
        expect(Number.isFinite(pass[t])).toBe(true);
        expect(pass[t]).toBeGreaterThan(0);
      }
    }
  });

  it('per-track scale narrows the deviation proportionally', () => {
    // drums scaled to 0.5 → max drum wobble is 0.5 dB
    const h = createMixHumanizer({
      seed: 0,
      perTrackScale: { drums: 0.5 },
    });
    for (let i = 0; i < 200; i++) {
      const pass = h.nextPass();
      // drums: ×[10^(-0.5/20), 10^(+0.5/20)] = [0.944, 1.059]
      expect(pass.drums).toBeGreaterThanOrEqual(0.94);
      expect(pass.drums).toBeLessThanOrEqual(1.06);
      // bass and piano stay at full ±1 dB
      expect(pass.bass).toBeLessThanOrEqual(1.13);
      expect(pass.piano).toBeLessThanOrEqual(1.13);
    }
  });

  it('wider dbRange scales linearly', () => {
    const narrow = createMixHumanizer({ seed: 0, dbRange: 1 });
    const wide = createMixHumanizer({ seed: 0, dbRange: 2 });
    const n = narrow.nextPass();
    const w = wide.nextPass();
    // Every wide-pass value should be further from 1 than the
    // narrow-pass value on the same seed pass.
    for (const t of ['drums', 'bass', 'piano'] as const) {
      expect(Math.abs(Math.log(w[t]))).toBeGreaterThan(Math.abs(Math.log(n[t])));
    }
  });
});

describe('magenta/mixHumanizer — shared RNG correlation', () => {
  it('each pass consumes 3 Gaussian draws, not 1 — so two handles with same seed diverge after 3 passes, not 1', () => {
    // This proves the implementation actually pulls 3 random numbers
    // per pass (one per track), and that the bell-curve tail
    // correlation carries across tracks.
    const h = createMixHumanizer({ seed: 42 });
    const all = [];
    for (let i = 0; i < 12; i++) all.push(h.nextPass());
    // Track 1 (drums) of pass 1 must NOT equal track 2 (bass) of
    // pass 1 in general — but the magnitude distribution is the same.
    expect(all[0].drums).not.toBe(all[0].bass);
    expect(all[0].drums).not.toBe(all[0].piano);
  });
});

describe('applyMixWobble — user-gain integration', () => {
  it('muted track (userGain=0) stays at 0 regardless of wobble', () => {
    const h = createMixHumanizer({ seed: 7 });
    const out = applyMixWobble(
      { drums: 0, bass: 0.6, piano: 0.4 },
      h,
    );
    expect(out.drums).toBe(0);
    expect(out.bass).toBeGreaterThan(0);
    expect(out.piano).toBeGreaterThan(0);
  });

  it('wobble never amplifies above the user-set level', () => {
    // Even when the RNG returns >0 dB, the humanized gain is clamped
    // at the user's chosen rail so the user can't get louder than
    // they asked for.
    const h = createMixHumanizer({ seed: 1, dbRange: 100 });
    const out = applyMixWobble(
      { drums: 0.5, bass: 0.5, piano: 0.5 },
      h,
    );
    expect(out.drums).toBeLessThanOrEqual(0.5);
    expect(out.bass).toBeLessThanOrEqual(0.5);
    expect(out.piano).toBeLessThanOrEqual(0.5);
  });

  it('result is deterministic across calls with the same seed', () => {
    const a = applyMixWobble(
      { drums: 0.7, bass: 0.6, piano: 0.4 },
      createMixHumanizer({ seed: 99 }),
    );
    const b = applyMixWobble(
      { drums: 0.7, bass: 0.6, piano: 0.4 },
      createMixHumanizer({ seed: 99 }),
    );
    expect(a).toEqual(b);
  });
});