/**
 * engine/etude/determinism.test.ts - PRD-001 Phase 3 Slice 1 (test
 * plan 4, REQ-ETU-15).
 *
 * 1. BYTE-IDENTITY MATRIX: 3 styles x 5 difficulties x bars {8,16,24}
 *    = 45 enumerated cases (the design's "= 75" is an arithmetic slip;
 *    see note below), each generated TWICE with the same clock and
 *    compared via JSON.stringify byte equality. Catches any accidental
 *    iteration-order or hidden-state slip.
 * 2. DIFFICULTY MONOTONICITY on a fixed 24-seed list: exact measured
 *    counts (9ths/alts + chromatic melody notes) pinned per style,
 *    plus the d5 >= d1 and d1 <= d3 inequalities.
 * 3. FORM-PERIOD COMPAT: etudeToSteps cycled to 96 steps must yield a
 *    detectFormPeriod p dividing both 8 and 96; one golden seed pins
 *    p === 8 exactly. (Test-only src import, precedent:
 *    rng.golden.test.ts imports src/magenta/noise.)
 */

import { describe, it, expect } from "vitest";
import { generateEtude, etudeToSteps } from "./assemble";
import { detectFormPeriod } from "../../src/lib/formPeriod";
import type { EtudeConstraints } from "./types";

const CLOCK = { nowMs: 1_700_000_000_000, seq: 1 };

function constraints(
  over: Partial<EtudeConstraints> & { styleId: EtudeConstraints["styleId"] },
): EtudeConstraints {
  return {
    version: 1,
    key: 0,
    mode: "major",
    difficulty: 3,
    bars: 8,
    tempo: null,
    seed: 42,
    harmony: { allowedQualities: null, allowedNumerals: null, startOn: null, endOn: null, requireChromaticism: false },
    melody: { maxIntervalSemitones: null, chordTonesOnStrongBeats: false, range: null },
    rhythm: { straightRhythmsOnly: false },
    ...over,
  };
}

const STYLES = ["jazz", "pop", "classical"] as const;
const DIFFICULTIES = [1, 2, 3, 4, 5] as const;
const BAR_SETS = [8, 16, 24] as const;

describe("determinism matrix: 45 enumerated cases x 2 byte-identical runs", () => {
  // DESIGN NOTE: docs/PHASE-3-ETUDE.md section 6 writes "3 styles x 5
  // difficulties x bars {8,16,24} = 75 cases" - the enumeration is
  // 3x5x3 = 45 (the "75" is an author arithmetic slip; the enumerated
  // dimensions appear twice, the total once). Implemented as
  // enumerated; deviation reported.
  let cases = 0;
  for (const styleId of STYLES) {
    for (const difficulty of DIFFICULTIES) {
      for (const bars of BAR_SETS) {
        cases += 1;
        const caseSeed = 7919 + cases; // capture at registration (closure-at-run would see the final count)
        it(`style=${styleId} d=${difficulty} bars=${bars} is byte-identical across runs`, () => {
          const c = constraints({ styleId, difficulty, bars, seed: caseSeed });
          const a = generateEtude(c, CLOCK);
          const b = generateEtude(c, CLOCK);
          expect(JSON.stringify(a.etude)).toBe(JSON.stringify(b.etude));
          expect(JSON.stringify(a.annotations)).toBe(JSON.stringify(b.annotations));
        });
      }
    }
  }
  it("matrix really covered 45 cases", () => {
    expect(cases).toBe(45);
  });
});

/** Fixed seed list (part of the contract - do not "reshuffle"). */
const MONO_SEEDS: readonly number[] = Array.from({ length: 24 }, (_, i) => 1000 + i * 13);

function measuredComplexity(styleId: (typeof STYLES)[number], difficulty: 1 | 3 | 5): number {
  let total = 0;
  for (const seed of MONO_SEEDS) {
    const c = constraints({ styleId, difficulty, bars: 8, seed });
    const { etude } = generateEtude(c, CLOCK);
    total += etude.chords.filter(
      (ch) => ch.qualitySymbol.includes("9") || ch.qualitySymbol === "alt",
    ).length;
    const scale = etude.mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
    const pcs = scale.map((o) => (etude.key + o) % 12);
    total += etude.melody.filter((n) => !pcs.includes(n.midi % 12)).length;
  }
  return total;
}

describe("difficulty monotonicity (exact measured counts, fixed seeds)", () => {
  // EXACT measured totals (24 seeds x 8 bars): [d1, d3, d5].
  const PINNED: Record<(typeof STYLES)[number], readonly [number, number, number]> = {
    jazz: [141, 302, 484],
    pop: [7, 15, 29],
    classical: [7, 16, 26],
  };
  for (const styleId of STYLES) {
    it(`${styleId}: d5 >= d1 and d1 <= d3, totals pinned exactly`, () => {
      const d1 = measuredComplexity(styleId, 1);
      const d3 = measuredComplexity(styleId, 3);
      const d5 = measuredComplexity(styleId, 5);
      expect([d1, d3, d5]).toEqual(PINNED[styleId]);
      expect(d5).toBeGreaterThanOrEqual(d1);
      expect(d1).toBeLessThanOrEqual(d3);
    });
  }
});

describe("formPeriod compatibility (finding 4)", () => {
  function periodOf(styleId: (typeof STYLES)[number], difficulty: number, seed: number): number {
    const { etude } = generateEtude(constraints({ styleId, difficulty: difficulty as 1, bars: 8, seed }), CLOCK);
    const steps = etudeToSteps(etude);
    expect(steps.length).toBe(8);
    const cycled = Array.from({ length: 96 }, (_, i) => steps[i % 8]);
    return detectFormPeriod(cycled);
  }

  it("detected period divides both 8 and 96 for every style/difficulty", () => {
    for (const styleId of STYLES) {
      for (const difficulty of DIFFICULTIES) {
        const p = periodOf(styleId, difficulty, 4242);
        expect(8 % p, `${styleId} d${difficulty}`).toBe(0);
        expect(96 % p, `${styleId} d${difficulty}`).toBe(0);
      }
    }
  });

  it("golden seed 1 (jazz, d3, 8 bars) has period exactly 8", () => {
    expect(periodOf("jazz", 3, 1)).toBe(8);
  });
});
