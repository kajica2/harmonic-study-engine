/**
 * src/lib/guideToneTrail.ts — accumulate guide-tone classifier results
 * into a per-run tally (roadmap option C → option G bridge).
 *
 * During a recorded take the player's note-ons are classified against
 * the active chord (via `classifyGuideTone`). Each note-on is an
 * opportunity to land a guide tone (3rd/7th); this module folds those
 * matches into a tiny pure record that gets written onto the take in
 * the performance log, e.g. `✓ 4/6 guide tones · 67%`.
 *
 * Pure functions only — no React, no MIDI, no DOM.
 */
import { classifyGuideTone, type GuideToneMatch } from "./guideTones";

export interface GuideToneTrail {
  /** Total note-ons seen while the run was active. */
  totalNotes: number;
  /** Note-ons classified as a guide tone (3rd or 7th) of the chord. */
  guideHits: number;
  /** Note-ons in the chord that are NOT a guide tone (root/5th/9th/color). */
  chordToneHits: number;
  /** Note-ons outside the chord. */
  offNotes: number;
}

export const emptyTrail = (): GuideToneTrail => ({
  totalNotes: 0,
  guideHits: 0,
  chordToneHits: 0,
  offNotes: 0,
});

/** Every non-guide-tone note-on counts as a missed guide-tone chance. */
export const transitionsMissed = (t: GuideToneTrail): number =>
  t.totalNotes - t.guideHits;

/** 0–1 share of note-ons that landed on a guide tone; null when idle. */
export const guideToneAccuracy = (t: GuideToneTrail): number | null =>
  t.totalNotes === 0 ? null : t.guideHits / t.totalNotes;

/** Fold one classifier match into the tally. */
export function accumulateTrail(
  trail: GuideToneTrail,
  match: GuideToneMatch,
): GuideToneTrail {
  return {
    totalNotes: trail.totalNotes + 1,
    guideHits: trail.guideHits + (match.isGuideTone ? 1 : 0),
    chordToneHits: trail.chordToneHits + (match.inChord && !match.isGuideTone ? 1 : 0),
    offNotes: trail.offNotes + (match.inChord ? 0 : 1),
  };
}

/** Classify a batch of (midi, chordNotes) pairs into one tally. */
export function tallyGuideToneNotes(
  played: { midi: number; chordNotes: number[] }[],
): GuideToneTrail {
  return played.reduce(
    (trail, { midi, chordNotes }) =>
      accumulateTrail(trail, classifyGuideTone(midi, chordNotes)),
    emptyTrail(),
  );
}