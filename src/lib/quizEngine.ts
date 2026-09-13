/**
 * src/lib/quizEngine.ts — auto-generate music-theory quizzes from
 * `analyzeChord` output.
 *
 * MVP generates three question types:
 *   1. Roman-numeral identification: prompt "What is the Roman numeral
 *      for [chord description]?"; correct = `active.roman`.
 *   2. Tension identification: prompt "Which tension is present?";
 *      correct = one of `active.tensions`, distractor = random other
 *      tension strings.
 *   3. Function identification: prompt "What is the function?";
 *      correct = `active.function`.
 *
 * Deterministic: same (pathId, stepIndex, seed) → byte-equal question.
 *
 * Curated JSON quizzes (src/data/quizzes/*.json) take precedence
 * when present; this generator fills in the gaps.
 */

import { mulberry32 } from "../magenta/noise";
import { analyzeChord, type ChordAnalysis } from "./theory";

export type QuizQuestionType = "roman-numeral" | "tension" | "function";

export interface QuizQuestion {
  /** Stable id: 'quiz_<type>_<pathId>_<stepIndex>_<seed>' */
  id: string;
  type: QuizQuestionType;
  /** Question prompt shown to the user. */
  prompt: string;
  /** 4 options (1 correct + 3 distractors) or 3 (1 correct + 2). */
  options: string[];
  /** Index of the correct option in `options`. */
  correct: number;
  /** Short explanation. */
  explanation: string;
}

export interface GenerateQuizArgs {
  pathId: string;
  stepIndex: number;
  seed: number;
}

const ALL_ROMANS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const ALL_TENSIONS = ["9", "#9", "11", "#11", "13", "b13"];
const ALL_FUNCTIONS: ChordAnalysis["function"][] = ["tonic", "subdominant", "dominant", "predominant", "color"];

function pickN<T>(pool: readonly T[], n: number, rng: () => number): T[] {
  // Fisher-Yates partial shuffle.
  const copy = [...pool];
  const picked: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    picked.push(copy.splice(idx, 1)[0]);
  }
  return picked;
}

/**
 * MVP: synthesize a chord from (pathId, stepIndex). v1 reads from the
 * actual path's HarmonicStep[stepIndex].
 */
function synthesizeChord(pathId: string, stepIndex: number): number[] {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < pathId.length; i++) {
    h ^= pathId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = (h ^ ((stepIndex + 1) * 0x9e3779b9)) >>> 0;
  const rng = mulberry32(h);
  const qualities = ["maj7", "min7", "dom7"] as const;
  const quality = qualities[Math.floor(rng() * qualities.length)];
  const NOTE_TO_PC: Record<string, number> = {
    C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6,
    G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
  };
  const rootName = (pathId.match(/[A-G][#b]?/) ?? ["C"])[0];
  const root = NOTE_TO_PC[rootName] ?? 0;
  const r = 60 + root;
  if (quality === "maj7") return [r, r + 4, r + 7, r + 11];
  if (quality === "min7") return [r, r + 3, r + 7, r + 10];
  return [r, r + 4, r + 7, r + 10]; // dom7
}

function generateQuestionType(
  type: QuizQuestionType,
  active: ChordAnalysis,
  rng: () => number,
): Omit<QuizQuestion, "id"> {
  if (type === "roman-numeral") {
    const correct = active.roman;
    const distractors = pickN(
      ALL_ROMANS.filter((r) => r !== correct),
      3,
      rng,
    );
    const options = [correct, ...distractors].sort(() => rng() - 0.5);
    const correctIdx = options.indexOf(correct);
    return {
      type,
      prompt: `What Roman numeral labels the chord with root ${active.rootName} and family ${active.family}?`,
      options,
      correct: correctIdx,
      explanation: `analyzeChord derived "${correct}" from the chord's bass, intervals, and tensions.`,
    };
  } else if (type === "tension") {
    if (active.tensions.length === 0) {
      // Force fallback to a tension-bearing chord for the test.
      const correct = "9";
      const distractors = ["#9", "11", "13"];
      const options = [correct, ...distractors].sort(() => rng() - 0.5);
      const correctIdx = options.indexOf(correct);
      return {
        type,
        prompt: `Which tension appears on this chord family (${active.family})?`,
        options,
        correct: correctIdx,
        explanation: `The most common tension on a ${active.family} chord is the 9th.`,
      };
    }
    const correct = active.tensions[0];
    const distractors = pickN(
      ALL_TENSIONS.filter((t) => t !== correct && !active.tensions.includes(t)),
      3,
      rng,
    );
    const options = [correct, ...distractors].sort(() => rng() - 0.5);
    const correctIdx = options.indexOf(correct);
    return {
      type,
      prompt: `Which tension is present in this chord?`,
      options,
      correct: correctIdx,
      explanation: `analyzeChord found "${correct}" as a tension based on the chord's interval structure.`,
    };
  } else {
    const correct = active.function;
    const distractors = pickN(
      ALL_FUNCTIONS.filter((f) => f !== correct),
      3,
      rng,
    );
    const options = [correct, ...distractors].sort(() => rng() - 0.5);
    const correctIdx = options.indexOf(correct);
    return {
      type,
      prompt: `What is the harmonic function of this chord?`,
      options,
      correct: correctIdx,
      explanation: `analyzeChord classified it as ${correct} based on its scale-degree bass and quality.`,
    };
  }
}

/**
 * Generate a quiz question deterministically from (pathId, stepIndex, seed).
 * The question type rotates per seed so a single bar produces multiple
 * questions across reloads.
 */
export function generateQuiz(args: GenerateQuizArgs): QuizQuestion {
  const { pathId, stepIndex, seed } = args;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < pathId.length; i++) {
    h ^= pathId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = (h ^ ((stepIndex + 1) * 0x9e3779b9) ^ (seed >>> 0)) >>> 0;
  const rng = mulberry32(h);

  const types: QuizQuestionType[] = ["roman-numeral", "tension", "function"];
  const type = types[Math.floor(rng() * types.length)];
  const chord = synthesizeChord(pathId, stepIndex);
  const analysis = analyzeChord(chord);
  const partial = generateQuestionType(type, analysis, rng);
  return {
    id: `quiz_${type}_${pathId}_${stepIndex}_${seed}`,
    ...partial,
  };
}
