/**
 * formPeriod.ts -- detect the length of the repeating harmonic FORM
 * inside a (possibly padded) step list.
 *
 * Audio truth: one HarmonicStep = one BAR of rendered audio. The
 * live practice loop pads every path by cycling its form (padPath
 * loops the steps until the bar-count policy is met), so a 32-bar
 * tune arrives at the WAV renderer as 96 steps = the same 32-step
 * form x3. This module lets the renderer find the form boundary and
 * render it exactly once. The live transport keeps its padded view
 * untouched.
 *
 * detectFormPeriod returns the smallest p >= 1 such that every step
 * matches the step at index (i % p) -- i.e. the sequence is a prefix
 * repetition of its first p entries. The comparison key is the chord
 * name plus the sorted pitch set, so octave-inverted re-voicings of
 * the same symbol still count as the same form bar.
 *
 *   empty array    -> 0
 *   single step    -> 1
 *   no repetition  -> steps.length (p = n always matches trivially)
 *
 * Pure + dependency-free. O(n^2) worst case is fine for n <= 256.
 */

interface FormPeriodStep {
  name?: string;
  notes?: number[];
}

function stepFormKey(step: FormPeriodStep): string {
  const name = step.name ?? "";
  const notes = [...(step.notes ?? [])].sort((a, b) => a - b);
  return JSON.stringify([name, notes]);
}

export function detectFormPeriod(steps: FormPeriodStep[]): number {
  const n = steps.length;
  if (n === 0) return 0;
  const keys = steps.map(stepFormKey);
  for (let p = 1; p <= n; p++) {
    let matches = true;
    for (let i = 0; i < n; i++) {
      if (keys[i] !== keys[i % p]) {
        matches = false;
        break;
      }
    }
    if (matches) return p;
  }
  // Unreachable: p === n satisfies the predicate for any non-empty
  // sequence (i % n === i for all valid i). Kept for totality.
  return n;
}
