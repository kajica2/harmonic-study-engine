/**
 * src/lib/styleEnforcer.ts — applies a StylePack's constraints to a
 * melody + counterline pair and returns violations.
 *
 * MVP implementation checks only `forbiddenIntervals`. Resolution
 * rules and NCT policy land in v1.
 *
 * Reuses `counterpointRules.checkSpeciesOne` for parallel-fifth /
 * parallel-octave detection.
 */

import { checkSpeciesOne } from "./counterpointRules";
import type { StylePack } from "./stylePack";

export interface EnforceStyleArgs {
  /** Per-step parallel-voice MIDI arrays. One entry per bar. */
  steps: Array<{ melody: number[]; counterline: number[] }>;
  style: StylePack;
}

export interface StyleViolation {
  /** Bar index (0-based). */
  barIndex: number;
  type: "parallelFifth" | "parallelOctave" | "hiddenFifth" | "hiddenOctave";
  explanation: string;
}

export interface StyleVerdict {
  /** True iff no rules are violated. */
  ok: boolean;
  violations: StyleViolation[];
}

/**
 * Run the active style's `forbiddenIntervals` against every bar pair.
 *
 * The enforcer collapses parallel/hidden fifths into the same
 * `parallelFifth` bucket and parallel/hidden octaves into
 * `parallelOctave`. v1 will split them with separate type tags.
 */
export function enforceStyle(args: EnforceStyleArgs): StyleVerdict {
  const { steps, style } = args;
  if (steps.length < 2) return { ok: true, violations: [] };

  // For each rule, we run the counterpoint check and tag violations
  // according to whether the rule forbids parallelFifth, parallelOctave,
  // hiddenFifth, hiddenOctave. The counterpoint rule flags parallel 5ths
  // and octaves; v1 will extend with hidden-5ths/8ves detection.
  const melodyArr = steps.map((s) => s.melody[0] ?? 0);
  const counterlineArr = steps.map((s) => s.counterline[0] ?? 0);
  const cpViolations = checkSpeciesOne({
    melody: melodyArr,
    counterline: counterlineArr,
    barIndex: 0,
  });

  const violations: StyleViolation[] = [];
  const forbidden = new Set(style.constraints.forbiddenIntervals);

  for (const v of cpViolations) {
    if (v.type === "parallel_fifth" && forbidden.has("parallelFifth")) {
      violations.push({
        barIndex: v.barIndex,
        type: "parallelFifth",
        explanation: `${style.name}: ${v.explanation}`,
      });
    } else if (v.type === "parallel_octave" && forbidden.has("parallelOctave")) {
      violations.push({
        barIndex: v.barIndex,
        type: "parallelOctave",
        explanation: `${style.name}: ${v.explanation}`,
      });
    }
    // Hidden 5ths/octaves: rule check flags them as parallel_fifth/_octave
    // with explanation mentioning "Hidden". We surface them as hidden*
    // when the rule is in the forbidden list.
    else if (v.type === "parallel_fifth" && v.explanation.includes("Hidden") && forbidden.has("hiddenFifth")) {
      violations.push({
        barIndex: v.barIndex,
        type: "hiddenFifth",
        explanation: `${style.name}: ${v.explanation}`,
      });
    } else if (v.type === "parallel_octave" && v.explanation.includes("Hidden") && forbidden.has("hiddenOctave")) {
      violations.push({
        barIndex: v.barIndex,
        type: "hiddenOctave",
        explanation: `${style.name}: ${v.explanation}`,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}
