/**
 * src/lib/counterpointRules.ts — species-1 rule check.
 *
 * Per Fux (Gradus ad Parnassum): two voices moving in parallel
 * perfect consonances (P5, P8) are forbidden. Contrary motion into
 * a perfect consonance is allowed. Similar motion into a perfect
 * consonance is also forbidden.
 *
 * MVP implements parallel-P5 and parallel-P8 checks only. Voice
 * crossing and hidden fifths/octaves land in v1.
 *
 * The check operates on consecutive (melody, counterline) pairs at
 * bar boundaries. Returns a list of violations; empty list = valid.
 */

export type CounterpointViolationType =
  | "parallel_fifth"
  | "parallel_octave"
  | "similar_motion_to_perfect";

export interface CounterpointViolation {
  /** Bar index where the violation begins. */
  barIndex: number;
  type: CounterpointViolationType;
  /** Human-readable explanation. */
  explanation: string;
  /** Interval (semitones) on the violating bar pair. */
  interval: number;
}

export interface CheckSpeciesOneArgs {
  /** Top voice (MIDI), one note per bar. */
  melody: number[];
  /** Lower voice (MIDI), one note per bar. Same length as `melody`. */
  counterline: number[];
  /** Bar index where this check begins (for error reporting). */
  barIndex: number;
}

/** Reduce a MIDI pair to a diatonic interval class. 0=P1, 7=P5, 12=P8. */
function intervalClass(a: number, b: number): number {
  const raw = ((b - a) % 12 + 12) % 12;
  return raw === 0 ? 12 : raw; // treat unison/octave as 12 for motion checks
}

const PERFECT_CONSONANCES: ReadonlySet<number> = new Set([7, 12]);

export function checkSpeciesOne(args: CheckSpeciesOneArgs): CounterpointViolation[] {
  const { melody, counterline, barIndex } = args;
  if (melody.length !== counterline.length) {
    throw new Error(
      `checkSpeciesOne: melody and counterline must have equal length (got ${melody.length} vs ${counterline.length})`,
    );
  }
  if (melody.length < 2) return [];

  const violations: CounterpointViolation[] = [];

  for (let i = 1; i < melody.length; i++) {
    const aMel = melody[i - 1];
    const bMel = melody[i];
    const aCt = counterline[i - 1];
    const bCt = counterline[i];

    const int1 = intervalClass(aMel, aCt);
    const int2 = intervalClass(bMel, bCt);

    // Only check transitions into a perfect consonance.
    if (!PERFECT_CONSONANCES.has(int2)) continue;

    // Motion classification.
    const melDelta = bMel - aMel;
    const ctDelta = bCt - aCt;
    const sameSign =
      (melDelta === 0 && ctDelta === 0) ||
      (melDelta !== 0 && ctDelta !== 0 && Math.sign(melDelta) === Math.sign(ctDelta));
    const contrary = melDelta !== 0 && ctDelta !== 0 && Math.sign(melDelta) !== Math.sign(ctDelta);

    // Contrary motion into a perfect consonance is allowed (Fux §3.5).
    if (contrary) continue;

    // Same intervallic class between consecutive bars = parallel.
    if (int1 === int2 && sameSign) {
      const type: CounterpointViolationType =
        int2 === 7 ? "parallel_fifth" : "parallel_octave";
      violations.push({
        barIndex: barIndex + i - 1,
        type,
        interval: int2,
        explanation:
          type === "parallel_fifth"
            ? `Parallel fifths between bars ${barIndex + i - 1} and ${barIndex + i}: top voice moves ${melDelta > 0 ? "up" : "down"} by ${Math.abs(melDelta)} st; lower voice also moves by ${Math.abs(ctDelta)} st; both arrive on a P5.`
            : `Parallel octaves between bars ${barIndex + i - 1} and ${barIndex + i}: top voice moves ${melDelta > 0 ? "up" : "down"} by ${Math.abs(melDelta)} st; lower voice also moves by ${Math.abs(ctDelta)} st; both arrive on a P8.`,
      });
      continue;
    }

    // Different perfect consonance, similar motion → hidden fifths/octaves.
    if (int1 !== int2 && sameSign) {
      const type: CounterpointViolationType =
        int2 === 7 ? "parallel_fifth" : "parallel_octave";
      violations.push({
        barIndex: barIndex + i - 1,
        type,
        interval: int2,
        explanation:
          `Hidden ${type === "parallel_fifth" ? "fifths" : "octaves"} between bars ${barIndex + i - 1} and ${barIndex + i}: similar motion into a perfect consonance.`,
      });
    }
  }

  return violations;
}
