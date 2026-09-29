/**
 * src/lib/trumpetStage.ts — types + the chord-degree → pitch-class
 * helper used by the trumpet stage trainer. Pure, no audio engine.
 */

import { NOTE_NAMES_FLAT } from "./theory";

export type ChordQuality =
  | "maj7"
  | "m7"
  | "7"
  | "m7b5"
  | "dim7"
  | "mMaj7"
  | "m6";

/**
 * Interval table per quality. Index → semitones above the root.
 * 0=root, 3=b3/minor 3, 4=M3, 6=b5, 7=P5, 9=b7, 10=m7, 11=M7.
 */
const QUALITY_INTERVALS: Record<ChordQuality, number[]> = {
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  "7": [0, 4, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  mMaj7: [0, 3, 7, 11],
  m6: [0, 3, 7, 9],
};

const ROOT_TO_FLAT_INDEX: Record<string, number> = {
  C: 0,
  Db: 1,
  D: 2,
  Eb: 3,
  E: 4,
  F: 5,
  Gb: 6,
  G: 7,
  Ab: 8,
  A: 9,
  Bb: 10,
  B: 11,
};

function rootIndex(root: string): number {
  return ROOT_TO_FLAT_INDEX[root] ?? -1;
}

/**
 * Return the pitch-class names that make up a chord of the given root
 * and quality. Order: root, 3rd, 5th, 7th (top to bottom in the
 * fingering order, which matches how players count chord tones).
 * Uses the flat-preferred spelling for jazz readability ("Bb" over
 * "A#", "Eb" over "D#").
 */
export function chordPitchClasses(
  root: string,
  quality: ChordQuality,
): string[] {
  const ri = rootIndex(root);
  if (ri < 0) return [];
  return QUALITY_INTERVALS[quality].map(
    (iv) => NOTE_NAMES_FLAT[(ri + iv) % 12],
  );
}

/**
 * Quality-aware scale-degree → semitone-offset map. Keyed by degree
 * token (e.g. "3", "b7", "9", "#11"). Unmapped tokens fall back to
 * the bare diatonic interpretation: degree N = N-1 semitones above
 * root, with `b` prefix subtracting one and `#` adding one.
 */
const DEGREE_OVERRIDES: Record<string, number> = {
  // Major-family degrees
  "3": 4, // M3
  "b3": 3,
  "5": 7,
  "b5": 6,
  "#5": 8,
  "7": 11, // M7 in maj7
  "b7": 10, // in 7
  "9": 2,  // 9 = 2nd up an octave
  "b9": 1,
  "#9": 3,
  "11": 5,
  "b13": 8,
};

function degreeSemitones(
  quality: ChordQuality,
  degree: string,
): number | undefined {
  const flat = degree.startsWith("b");
  const sharp = degree.startsWith("#");
  const token = flat || degree.startsWith("#");
  const digit = parseInt(
    token ? degree.slice(1) : degree,
    10,
  );
  if (!Number.isFinite(digit) || digit < 1 || digit > 13) return undefined;

  // Common flat/sharp degree tokens in lead-sheet notation: "b3"
  // means "minor 3rd = 3 semitones", "b7" means "minor 7th = 10
  // semitones", etc. These are direct intervals, not "flat of major".
  if (flat || sharp) {
    const FLAT_DEGREES: Record<number, number> = {
      2: 1, // b2 = 1
      3: 3, // b3 = 3
      5: 6, // b5 = 6
      6: 8, // b6 = 8
      7: 10, // b7 = 10
      9: 1, // b9 = 1 (also b2)
      13: 8, // b13 = 8
    };
    const SHARP_DEGREES: Record<number, number> = {
      4: 6, // #4 = 6
      5: 8, // #5 = 8
      9: 3, // #9 = 3
      11: 6, // #11 = 6
    };
    if (flat && FLAT_DEGREES[digit] !== undefined) {
      return FLAT_DEGREES[digit];
    }
    if (sharp && SHARP_DEGREES[digit] !== undefined) {
      return SHARP_DEGREES[digit];
    }
  }

  // Quality-specific overrides for chord-tone degrees (3, 5, 7).
  // These take precedence over the diatonic default and over the
  // accidental adjustment, since "b3" already means "minor 3rd = 3
  // semitones" — not "flat of a major 3rd".
  if (!flat && !sharp && DEGREE_OVERRIDES[degree] !== undefined) {
    // Special case: in minor qualities, an unprefixed "3" is the
    // minor 3rd, not the major 3rd the override table defaults to.
    if (degree === "3") {
      const isMinor =
        quality === "m7" ||
        quality === "m6" ||
        quality === "m7b5" ||
        quality === "dim7" ||
        quality === "mMaj7";
      if (isMinor) return 3;
    }
    if (degree === "5") {
      const isFlat =
        quality === "m7b5" || quality === "dim7";
      if (isFlat) return 6;
    }
    if (degree === "7") {
      if (quality === "dim7") return 9;
      if (
        quality === "7" ||
        quality === "m7" ||
        quality === "m7b5"
      ) {
        return 10;
      }
    }
    return DEGREE_OVERRIDES[degree];
  }

  // Diatonic default: degree N -> N-1 semitones.
  let base = (digit - 1) % 12;
  if (flat) base = (base - 1 + 12) % 12;
  if (sharp) base = (base + 1) % 12;
  return base;
}

/**
 * Translate a scale-degree token (e.g. "1", "b3", "9", "#11") into a
 * pitch-class name. Quality-aware: "3" over Cmaj7 = E, "3" over Cm7 = Eb.
 * Returns `undefined` if the input can't be parsed.
 */
export function degreeToPitchClass(
  root: string,
  quality: ChordQuality,
  degree: string,
): string | undefined {
  const ri = rootIndex(root);
  if (ri < 0) return undefined;
  const semitones = degreeSemitones(quality, degree);
  if (semitones === undefined) return undefined;
  return NOTE_NAMES_FLAT[(ri + semitones) % 12];
}

export interface StageConfig {
  /** Chord root pitch class, e.g. "C", "Bb", "F#". */
  chordRoot: string;
  /** Quality; see ChordQuality. */
  chordQuality: ChordQuality;
  /** Sequence of degree tokens to drill, e.g. ["1", "3", "5", "7"]. */
  degreeSequence: string[];
  /** Cents tolerance per note (default 7). */
  perNoteToleranceCents?: number;
  /** Sustain seconds before "hit" closes (default 0.6). */
  sustainSeconds?: number;
  /** Hard timeout per note in seconds (default 15). */
  timeoutSeconds?: number;
}