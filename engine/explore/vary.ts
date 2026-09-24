/**
 * engine/explore/vary.ts - PRD-001 Phase 5 (REQ-EXP-13).
 *
 * TRANSFORMS over an existing pitch line (Idea.melody is pitch-only,
 * readonly number[]). New pure integer math - the etude melody module
 * is a GENERATOR (weighted interval walk), not a transformer, so
 * nothing was reusable except the range/contour discipline (clamp
 * 0..127 everywhere).
 *
 * - retrograde: reverse (involution).
 * - inversion: mirror around the first pitch (2*notes[0]-n);
 *   out-of-range folds by octave (involution when no fold fires -
 *   fixtures stay mid-range; the card rationale discloses folding).
 * - displacement: rotate left by k = 1 + rng.int(len-1). DOCUMENTED
 *   LIMITATION (+ TD-EXP-SLOT): Idea.melody carries pitches without
 *   slot rhythm, so true rhythmic displacement is unrepresentable -
 *   rotation is the honest pitch-only stand-in, labeled as such.
 * - ornamentation: per-gap rng.bool(0.5) insert of the chromatic
 *   passing tone when |gap| > 2 (cap 2x input length, clamp 0..127).
 *
 * Empty/singleton input -> a copy (no-op, never throws). Draw order:
 * displacement draws once (k); ornamentation draws per eligible gap
 * ascending (D100).
 *
 * Purity: relative imports only (Rng type), no clock, no Math.random,
 * no console.
 */

import type { Rng } from "../core/rng";

export type VaryKind =
  | "displacement"
  | "inversion"
  | "retrograde"
  | "ornamentation";

export const VARY_KINDS: readonly VaryKind[] = [
  "displacement",
  "inversion",
  "retrograde",
  "ornamentation",
];

function clampMidi(n: number): number {
  if (n < 0) return 0;
  if (n > 127) return 127;
  return n;
}

function foldOctave(n: number): number {
  let p = n;
  while (p < 0) p += 12;
  while (p > 127) p -= 12;
  return p;
}

export function varyMelody(
  notes: readonly number[],
  kind: VaryKind,
  rng: Rng,
): readonly number[] {
  if (notes.length === 0) return [];
  if (notes.length === 1) return [notes[0] as number];

  switch (kind) {
    case "retrograde":
      return [...notes].reverse();
    case "inversion": {
      const axis = notes[0] as number;
      return notes.map((n) => foldOctave(2 * axis - n));
    }
    case "displacement": {
      const k = 1 + rng.int(notes.length - 1);
      return [...notes.slice(k), ...notes.slice(0, k)];
    }
    case "ornamentation": {
      const cap = 2 * notes.length;
      const out: number[] = [notes[0] as number];
      for (let i = 1; i < notes.length; i++) {
        const prev = notes[i - 1] as number;
        const cur = notes[i] as number;
        const gap = cur - prev;
        if (
          Math.abs(gap) > 2 &&
          out.length + 2 <= cap &&
          rng.bool(0.5)
        ) {
          out.push(clampMidi(prev + (gap > 0 ? 1 : -1)));
        }
        out.push(cur);
      }
      return out;
    }
  }
}
