/**
 * engine/styles/difficulty.test.ts - pins REQ-STYLE-7: difficulty
 * scales probabilities without removing options.
 */

import { describe, it, expect } from "vitest";
import {
  DIFFICULTY_FACTORS,
  DIFFICULTY_MIN,
  DIFFICULTY_MAX,
  PROB_FLOOR,
  PROB_CEIL,
  isDifficulty,
  scaleProbability,
  type Difficulty,
} from "./difficulty";

const ALL: readonly Difficulty[] = [1, 2, 3, 4, 5];

describe("difficulty guard", () => {
  it("isDifficulty accepts exactly the integers 1..5", () => {
    for (const n of ALL) expect(isDifficulty(n)).toBe(true);
    for (const n of [0, 6, 2.5, "3", null, undefined, {}]) {
      expect(isDifficulty(n)).toBe(false);
    }
  });

  it("bounds are 1 and 5", () => {
    expect(DIFFICULTY_MIN).toBe(1);
    expect(DIFFICULTY_MAX).toBe(5);
  });

  it("factors are exactly [0.4, 0.7, 1.0, 1.3, 1.6]", () => {
    expect([...DIFFICULTY_FACTORS]).toEqual([0.4, 0.7, 1.0, 1.3, 1.6]);
  });
});

describe("scaleProbability", () => {
  it("is the identity at difficulty 3 (calibration point)", () => {
    expect(scaleProbability(0.5, 3)).toBe(0.5);
    expect(scaleProbability(0.3, 3)).toBe(0.3);
  });

  it("is monotonic non-decreasing over 1..5 for base 0.5", () => {
    const curve = ALL.map((d) => scaleProbability(0.5, d));
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    }
  });

  it("clamps to the ceiling without saturating past it", () => {
    expect(scaleProbability(0.9, 5)).toBe(PROB_CEIL); // 0.9 * 1.6 = 1.44
    expect(scaleProbability(0.98, 4)).toBe(PROB_CEIL); // 1.274
    expect(scaleProbability(0.7, 4)).toBeCloseTo(0.91, 10); // under ceiling
  });

  it("floors small positive bases at PROB_FLOOR", () => {
    expect(scaleProbability(0.01, 1)).toBe(PROB_FLOOR); // 0.004
    expect(scaleProbability(0.001, 3)).toBe(PROB_FLOOR);
  });

  it("a positive base never reaches 0 at any difficulty (options are never removed)", () => {
    for (const base of [0.001, 0.02, 0.1, 0.5, 0.98]) {
      for (const d of ALL) {
        expect(scaleProbability(base, d)).toBeGreaterThan(0);
      }
    }
  });

  it("structural zeros stay zero at every difficulty", () => {
    for (const d of ALL) {
      expect(scaleProbability(0, d)).toBe(0);
    }
  });
});
