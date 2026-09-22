/**
 * engine/styles/profiles.test.ts - pins REQ-STYLE-2 (profiles are
 * serializable data, not code) and the registry surface.
 *
 * NOTE: this file lives in engine/, NOT tests/ - assets/check-links.cjs
 * counts it( only in tests/*.test.ts to pin README totals; adding
 * files there would force README edits (drift gate).
 */

import { describe, it, expect } from "vitest";
import {
  shippedStyleIds,
  getStyleProfile,
  allStyleProfiles,
  validateStyleProfile,
} from "./index";

/** PRD Appendix D register defaults - identical for all shipped styles. */
const APPENDIX_D_REGISTERS = {
  bass: [28, 48],
  chords: [48, 72],
  pad: [60, 84],
  melody: [60, 86],
};

describe("style registry", () => {
  it("ships exactly jazz, pop, classical", () => {
    expect(shippedStyleIds()).toEqual(["jazz", "pop", "classical"]);
  });

  it("getStyleProfile throws for a named-but-unshipped style", () => {
    expect(() => getStyleProfile("lofi")).toThrow(/not shipped/);
  });

  it("allStyleProfiles returns the three shipped profiles", () => {
    expect(allStyleProfiles().map((p) => p.id)).toEqual(["jazz", "pop", "classical"]);
  });
});

describe("shipped profiles are valid serializable data", () => {
  for (const p of allStyleProfiles()) {
    it(`${p.id}: validateStyleProfile accepts it`, () => {
      const res = validateStyleProfile(p);
      expect(res.errors).toEqual([]);
      expect(res.ok).toBe(true);
    });

    it(`${p.id}: JSON round-trip is lossless (plain data, not code)`, () => {
      expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    });

    it(`${p.id}: version is 1`, () => {
      expect(p.version).toBe(1);
    });

    it(`${p.id}: vocabulary weights sum to 1.000 (+/- 0.001)`, () => {
      const total = p.harmony.vocabulary.reduce((s, e) => s + e.weight, 0);
      expect(Math.abs(total - 1)).toBeLessThanOrEqual(0.001);
    });

    it(`${p.id}: every progression token exists in vocabulary`, () => {
      const numerals = new Set(p.harmony.vocabulary.map((e) => e.numeral));
      for (const prog of p.harmony.progressions) {
        for (const token of prog) {
          expect(numerals.has(token)).toBe(true);
        }
      }
    });

    it(`${p.id}: registers match PRD Appendix D defaults`, () => {
      expect(p.voicing.registers).toEqual(APPENDIX_D_REGISTERS);
    });

    it(`${p.id}: all probability fields are in [0, 1]`, () => {
      const probs: readonly number[] = [
        p.harmony.extensionBias,
        p.harmony.alterationBias,
        p.harmony.modalInterchangeRate,
        p.harmony.secondaryDominantRate,
        p.harmony.reharmonizationRate,
        p.melody.chromaticism,
        p.melody.syncopation,
        p.melody.chordToneStrongBeat,
        p.melody.repeatNoteRate,
        p.voicing.rootlessRate,
        p.voicing.spreadBias,
      ];
      for (const v of probs) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it(`${p.id}: MIDI ranges are integers 0-127 with lo <= hi`, () => {
      const ranges: readonly (readonly [number, number])[] = [
        p.melody.range,
        p.voicing.registers.bass,
        p.voicing.registers.chords,
        p.voicing.registers.pad,
        p.voicing.registers.melody,
      ];
      for (const [lo, hi] of ranges) {
        expect(Number.isInteger(lo)).toBe(true);
        expect(Number.isInteger(hi)).toBe(true);
        expect(lo).toBeGreaterThanOrEqual(0);
        expect(hi).toBeLessThanOrEqual(127);
        expect(lo).toBeLessThanOrEqual(hi);
      }
    });
  }
});

describe("validateStyleProfile rejects malformed candidates", () => {
  const base = getStyleProfile("jazz");

  it("rejects non-objects", () => {
    expect(validateStyleProfile(null).ok).toBe(false);
    expect(validateStyleProfile("jazz").ok).toBe(false);
  });

  it("catches vocabulary weight sums that drift from 1", () => {
    const bad = {
      ...base,
      harmony: { ...base.harmony, vocabulary: [{ numeral: "I", weight: 0.9 }] },
    };
    const res = validateStyleProfile(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("sum"))).toBe(true);
  });

  it("rejects a NaN vocabulary weight (NaN slips past typeof and < 0)", () => {
    // Regression pin (review round 1): NaN is typeof "number",
    // NaN < 0 is false, and Math.abs(NaN - 1) > 0.001 is false, so the
    // old validator accepted { numeral: "Imaj7", weight: NaN }.
    const bad = {
      ...base,
      harmony: {
        ...base.harmony,
        vocabulary: [{ numeral: "Imaj7", weight: Number.NaN }],
      },
    };
    const res = validateStyleProfile(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors.some((e) => e.includes("weight"))).toBe(true);
  });

  it("rejects a NaN swingRatio (NaN passes both range comparisons)", () => {
    const bad = { ...base, rhythm: { ...base.rhythm, swingRatio: Number.NaN } };
    const res = validateStyleProfile(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.errors.some((e) => e.includes("swingRatio"))).toBe(true);
  });

  it("catches progression tokens missing from vocabulary (data typos)", () => {
    const bad = {
      ...base,
      harmony: { ...base.harmony, progressions: [["Imaj7", "V9"]] },
    };
    const res = validateStyleProfile(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("V9"))).toBe(true);
  });

  it("catches out-of-range probabilities and inverted registers", () => {
    const bad = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
    (bad.melody as Record<string, unknown>).chromaticism = 1.5;
    (bad.voicing as Record<string, unknown>).registers = {
      ...APPENDIX_D_REGISTERS,
      bass: [48, 28],
    };
    const res = validateStyleProfile(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("p.melody.chromaticism"))).toBe(true);
    expect(res.errors.some((e) => e.includes("p.voicing.registers.bass"))).toBe(true);
  });

  it("catches a wrong schema version", () => {
    const bad = { ...base, version: 2 };
    const res = validateStyleProfile(bad);
    expect(res.ok).toBe(false);
    expect(res.errors.some((e) => e.includes("p.version"))).toBe(true);
  });
});
