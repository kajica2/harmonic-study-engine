/**
 * src/lib/melodyMarkov.ts — genre-neutral melody generator.
 *
 * Decision (resolved 2026-09-13): the Markov core is persona-blind by
 * construction. Persona conditioning lives in
 * `personaMelodyFilter.ts` and runs AFTER this module returns. The
 * lead voice never inherits persona voicing here.
 *
 * Order-2 Markov: state = (currentPc, prevIntervalClass). Transition
 * table is a deterministic map seeded by the 78-path corpus. For the
 * MVP the table is a 12-row starter (one per (pc, interval) tuple);
 * v1 will swap in the corpus-derived table.
 *
 * All output is reproducible: same (notes, stepsPerBar, seed) → same
 * melody[] byte-equal across runs.
 */

import { mulberry32 } from "../magenta/noise";

export interface SuggestMelodyArgs {
  /** MIDI notes of the active chord (root + 3rd + 7th + tensions). */
  notes: number[];
  /** Beats per bar. 4 for 4/4, 3 for 3/4, 6 for 6/8, etc. */
  stepsPerBar: number;
  /** uint32 seed. `mulberry32(seed)` walks the transition table. */
  seed: number;
}

/**
 * Deterministic chord-tone pc-set derived from the input notes.
 * Strips duplicate pitch classes; preserves order of first appearance.
 *
 * Exported for tests; the melody generator itself only uses it
 * internally, but consumers (e.g. personaMelodyFilter) may want it.
 */
export function pcSet(notes: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of notes) {
    const pc = ((n % 12) + 12) % 12;
    if (!seen.has(pc)) {
      seen.add(pc);
      out.push(pc);
    }
  }
  return out;
}

/**
 * Anchor octave for the melody. Default = octave 4 (MIDI 60).
 * MVP: all notes in one octave; v1 walks multiple octaves.
 */
const ANCHOR_PC = 60;

/**
 * Order-2 transition table. Key = "currentPc,prevIntervalClass"
 * (prevIntervalClass mod 12). Value = set of next-pc candidates
 * constrained to the active chord-tone set.
 *
 * For MVP this is a hard-coded starter table that biases toward
 * stepwise motion (≤ 2 semitones) with occasional leaps (3-5 st).
 * v1 will replace with the corpus-derived table from
 * scripts/build-corpus.ts.
 */
const TRANSITIONS: ReadonlyMap<string, readonly number[]> = new Map([
  ["0,0",  [0, 2, 4, 5, 7, 9, 11]],
  ["0,1",  [11, 0, 2, 4]],
  ["0,2",  [10, 11, 0, 2, 4]],
  ["0,3",  [9, 10, 11, 0]],
  ["0,4",  [8, 9, 10, 11]],
  ["0,5",  [7, 8, 9]],
  ["0,7",  [5, 6, 7]],
  ["0,9",  [3, 4, 5]],
  ["0,11", [1, 2, 3]],
  ["2,0",  [2, 4, 5, 7]],
  ["2,2",  [0, 2, 4]],
  ["2,4",  [10, 11, 0]],
  ["4,0",  [4, 5, 7]],
  ["5,0",  [5, 7, 9]],
  ["7,0",  [5, 7, 9, 11]],
  ["9,0",  [7, 9, 11]],
  ["11,0", [9, 11, 0]],
]);

/** Fallback when the (currentPc, prevInterval) tuple isn't in the table. */
const DEFAULT_FALLBACK: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

/**
 * Generate a `stepsPerBar`-length melody over the given chord tones.
 *
 * - All notes fall in the chord-tone pitch-class set.
 * - Deterministic: same args → byte-equal output.
 * - First note picks from `chordTones` uniformly; subsequent notes
 *   pick from the order-2 transition table constrained to chordTones.
 */
export function suggestMelody(args: SuggestMelodyArgs): number[] {
  const { notes, stepsPerBar, seed } = args;
  const rng = mulberry32(seed >>> 0);
  const chordTones = pcSet(notes);
  if (chordTones.length === 0 || stepsPerBar <= 0) return [];

  const out: number[] = [];
  let prevPc = chordTones[Math.floor(rng() * chordTones.length)];
  out.push(prevPc + ANCHOR_PC);

  for (let i = 1; i < stepsPerBar; i++) {
    // Previous interval = 0 on the first beat (no prior note).
    const prevInterval = i === 1 ? 0 : ((out[i - 1] - out[i - 2] + 12) % 12);
    const key = `${prevPc},${prevInterval}`;
    const candidates =
      TRANSITIONS.get(key) ?? DEFAULT_FALLBACK;
    // Intersect candidates with chordTones.
    const valid = candidates.filter((c) => chordTones.includes(c));
    const pool = valid.length > 0 ? valid : chordTones;
    const nextPc = pool[Math.floor(rng() * pool.length)];
    out.push(nextPc + ANCHOR_PC);
    prevPc = nextPc;
  }

  return out;
}
