/**
 * engine/styles/difficulty.ts - REQ-STYLE-7.
 *
 * "Difficulty 1-5 must scale a style's probabilities WITHOUT REMOVING
 * OPTIONS." Implementation:
 *  - Profiles store base probabilities calibrated at difficulty 3.
 *  - Scaling is multiplicative and monotonic: factors
 *    [0.40, 0.70, 1.00, 1.30, 1.60].
 *  - Positive bases are clamped to [PROB_FLOOR, PROB_CEIL], so a
 *    nonzero option stays possible at every difficulty (floor 0.02)
 *    and never saturates (ceiling 0.98).
 *  - Structural zeros (base 0: "classical never plays rootless")
 *    stay 0 at every level - zero is a style fact, not an option.
 *  - Vocabulary and progression LISTS are never filtered by
 *    difficulty; only weights move. (Enforced by convention only.)
 */

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 5;

export function isDifficulty(n: unknown): n is Difficulty {
  return typeof n === "number" && Number.isInteger(n) && n >= DIFFICULTY_MIN && n <= DIFFICULTY_MAX;
}

export const DIFFICULTY_FACTORS: readonly [number, number, number, number, number] = [
  0.4, 0.7, 1.0, 1.3, 1.6,
];

export const PROB_FLOOR = 0.02;
export const PROB_CEIL = 0.98;

export function scaleProbability(base: number, difficulty: Difficulty): number {
  if (base <= 0) return 0; // structural absence stays absent
  const scaled = base * DIFFICULTY_FACTORS[difficulty - 1];
  return Math.min(PROB_CEIL, Math.max(PROB_FLOOR, scaled));
}
