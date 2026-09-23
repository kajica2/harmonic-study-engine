/**
 * engine/core/chords.ts - PRD-001 Phase 4 Slice 1 (D47).
 *
 * The single source of truth for chord quality tables + display
 * spelling, EXTRACTED VERBATIM from engine/etude/harmony.ts so the
 * Compose analyzers (engine/compose/*) and the Etude numeral grammar
 * share ONE interval table instead of forking it. engine/etude/harmony
 * re-exports everything here (its tests + every importer keep their
 * import paths - additive churn only, zero behavior change).
 *
 * Why extraction and not a port of src/lib/theory.ts (D47): the engine
 * cannot import src (purity allowlist), and theory.ts carries
 * display-grade heuristics (a dead-code root-detection bug + a
 * minimum_motion stub) that must never be laundered into the analysis
 * core. The tables are the reusable asset; the algorithms are
 * re-implemented clean-room against engine types.
 *
 * Purity: relative imports only (core/spelling), no clock, no
 * randomness, no console.
 */

import { spellTonic } from "./spelling";

/** Local mode union (D47): widened from EtudeMode so Compose can pass
 *  its own "major" | "minor" without importing the Etude type. */
export type ChordMode = "major" | "minor";

/** qualitySymbol -> semitone intervals above the root, ascending.
 *  Moved verbatim from engine/etude/harmony.ts (17 qualities - see
 *  docs/PHASE-4-COMPOSE.md errata D8: the 17th is min9). */
export const QUALITY_INTERVALS: Readonly<Record<string, readonly number[]>> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  halfdim: [0, 3, 6, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  alt: [0, 4, 7, 10, 20], // dom7 + b13 (D21)
  sus4: [0, 5, 7, 10], // 7sus4: root, 4th, 5th, b7
  maj6: [0, 4, 7, 9],
  min6: [0, 3, 7, 9],
  majadd9: [0, 4, 7, 14], // add9 = quality + 14 semitones (D21)
  minadd9: [0, 3, 7, 14],
  maj9: [0, 4, 7, 11, 14],
  dom9: [0, 4, 7, 10, 14],
  min9: [0, 3, 7, 10, 14],
};

/** qualitySymbol -> chord-name suffix (ASCII, no glyphs).
 *  Moved verbatim from engine/etude/harmony.ts. */
export const NAME_SUFFIX: Readonly<Record<string, string>> = {
  maj: "", min: "m", dim: "dim", dim7: "dim7", halfdim: "m7b5",
  maj7: "maj7", m7: "m7", dom7: "7", alt: "7alt", sus4: "sus4",
  maj6: "6", min6: "m6", majadd9: "add9", minadd9: "madd9",
  maj9: "maj9", dom9: "9", min9: "m9",
};

const FLAT_NAMES: readonly string[] = [
  "C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B",
];
const SHARP_NAMES: readonly string[] = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
];

/** D11 spelling rules for chord roots: the spelled tonic's accidental
 *  wins; natural tonics fall to key-signature family (major sharp
 *  side: G D A E B; minor sharp side: E B; everything else, including
 *  the C/A ties, goes flat). Moved verbatim from engine/etude/harmony. */
export function keyUsesFlats(keyTonicPc: number, mode: ChordMode): boolean {
  const tonic = spellTonic(keyTonicPc, mode, "");
  if (tonic.includes("b")) return true;
  if (tonic.includes("#")) return false;
  if (mode === "major") return !["G", "D", "A", "E", "B"].includes(tonic);
  return !["E", "B"].includes(tonic);
}

/** Display name for a realized chord: "Dm7", "Abmaj9", "G7alt".
 *  Moved verbatim from engine/etude/harmony.ts (mode widened to
 *  ChordMode; the two-branch spelling is byte-identical). */
export function spellChordName(
  rootPc: number,
  qualitySymbol: string,
  keyTonicPc: number,
  mode: ChordMode,
): string {
  const names = keyUsesFlats(keyTonicPc, mode) ? FLAT_NAMES : SHARP_NAMES;
  const root = names[((rootPc % 12) + 12) % 12];
  return root + (NAME_SUFFIX[qualitySymbol] ?? qualitySymbol);
}

/** Canonical quality-symbol keys in table order (S2 popover
 *  autocomplete; stable because object string-key order is insertion
 *  order). */
export function chordQualities(): readonly string[] {
  return Object.keys(QUALITY_INTERVALS);
}

/** Intervals for one quality symbol, or null when unknown. */
export function qualityIntervals(qualitySymbol: string): readonly number[] | null {
  const iv = QUALITY_INTERVALS[qualitySymbol];
  return iv === undefined ? null : iv;
}
