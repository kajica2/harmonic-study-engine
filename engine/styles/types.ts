/**
 * engine/styles/types.ts - REQ-STYLE-2 (serializable data, not code
 * branches), sections per PRD 11.1, fields grounded in PRD Appendix
 * B/C/D and the P0 reqs that consume them (REQ-COMP-32/34/35,
 * REQ-GROOVE-1, REQ-COMP-13, REQ-STYLE-5).
 *
 * NOT to be confused with:
 *  - StylePack (src/lib/stylePack.ts): counterpoint CONSTRAINTS for
 *    the style enforcer.
 *  - BackingStyle (src/lib/backingEngine.ts): playback beat ids.
 * StyleProfile is the GENERATIVE parameter set for Phases 3-5.
 *
 * Numeral notation convention (parsed by generators in Phase 3+):
 * uppercase = major family, lowercase = minor, trailing "o" =
 * diminished, suffixes maj7/7/m7/m7b5/alt/sus4/add9, "b" prefix on a
 * degree = flat root (borrowed). Keep tokens ASCII.
 */

import type { Versioned } from "../core/versioned";

/** REQ-STYLE-1 names six; Phase 0 ships data for three (jazz, pop,
 *  classical). The union is complete now so persistence and pickers
 *  never need a breaking type change. */
export type StyleId =
  | "jazz"
  | "pop"
  | "classical"
  | "lofi"
  | "blues"
  | "modal";

/** REQ-COMP-32. */
export type VoicingStyle = "close" | "drop2" | "quartal" | "spread" | "block";
/** REQ-COMP-34. */
export type BassPatternId =
  | "walking"
  | "twoFeel"
  | "rootFifth"
  | "eighthPulse"
  | "shuffleBoogie"
  | "drone";
/** PRD Appendix C. */
export type ChordPatternId =
  | "freddieGreen"
  | "charleston"
  | "block"
  | "pulse"
  | "offbeat"
  | "lazy"
  | "sustain"
  | "alberti";
/** REQ-GROOVE-1. */
export type FeelId =
  | "straight"
  | "lightSwing"
  | "mediumSwing"
  | "hardSwing"
  | "shuffle";
/** REQ-COMP-13 meter set. */
export type MeterId = "4/4" | "3/4" | "5/4" | "6/8" | "7/8";
export type Contour = "stepwise" | "mixed" | "leapy";

/** Inclusive MIDI [low, high] pair. All values 0-127 (REQ-FND-1). */
export type MidiRange = readonly [number, number];

export interface RegisterMap {
  readonly bass: MidiRange;
  readonly chords: MidiRange;
  readonly pad: MidiRange;
  readonly melody: MidiRange;
}

export interface ChordVocabEntry {
  /** Numeral token, see notation convention above. */
  readonly numeral: string;
  /** Selection weight, >= 0. Profile totals sum to ~1.0. */
  readonly weight: number;
}

export interface HarmonyProfile {
  readonly vocabulary: readonly ChordVocabEntry[];
  /** Progression templates over vocabulary numerals (REQ-ETU-10). */
  readonly progressions: readonly (readonly string[])[];
  /** BASE probabilities, calibrated at difficulty 3 (REQ-STYLE-7).
   *  Generators scale them with scaleProbability(); 0 means
   *  "structurally absent from this style" and stays 0. */
  readonly extensionBias: number;
  readonly alterationBias: number;
  readonly modalInterchangeRate: number;
  readonly secondaryDominantRate: number;
  readonly reharmonizationRate: number;
}

export interface MelodyProfile {
  readonly contour: Contour;
  readonly range: MidiRange;
  readonly chromaticism: number;
  readonly syncopation: number;
  /** P(strong beat lands on a chord tone) (REQ-ETU-2 advanced). */
  readonly chordToneStrongBeat: number;
  readonly maxLeapSemitones: number;
  readonly repeatNoteRate: number;
}

export interface RhythmProfile {
  readonly defaultFeel: FeelId;
  /** 0.5 = straight; 0.58/0.64/0.70 = light/medium/hard swing. */
  readonly swingRatio: number;
  /** Grid steps per beat: 2 = eighths, 4 = sixteenths. */
  readonly gridDivisions: number;
  readonly bassPattern: BassPatternId;
  readonly chordPattern: ChordPatternId;
  readonly meters: readonly MeterId[];
  /** Center for the 0-5 density slider (REQ-COMP-35). */
  readonly densityDefault: number;
}

export interface VoicingProfile {
  readonly style: VoicingStyle;
  readonly rootlessRate: number;
  /** 0 = tight close voicings, 1 = wide spread. */
  readonly spreadBias: number;
  /** Defaults = PRD Appendix D (bass 28-48, chords 48-72,
   *  pad 60-84, melody 60-86). */
  readonly registers: RegisterMap;
  readonly inversionAwareness: boolean;
}

/**
 * REQ-STYLE-2: plain-data, JSON round-trip safe (pinned by test).
 * REQ-STYLE-5 drawer reads name/description/tempoRange/defaultTempo/
 * instrument/harmony.vocabulary/harmony.progressions.
 */
export interface StyleProfile extends Versioned {
  readonly id: StyleId;
  readonly name: string;
  readonly description: string;
  readonly tempoRange: readonly [number, number]; // BPM
  readonly defaultTempo: number;
  /** Display hint only; adapters map to real voices in Phase 3+. */
  readonly instrument: string;
  readonly harmony: HarmonyProfile;
  readonly melody: MelodyProfile;
  readonly rhythm: RhythmProfile;
  readonly voicing: VoicingProfile;
}
