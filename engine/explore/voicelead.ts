/**
 * engine/explore/voicelead.ts - PRD-001 Phase 5 (REQ-EXP-15, D95 re-skin).
 *
 * ZERO new voice-leading math: each of the 5 VoicingStyles is realized
 * by calling the shipped voiceSequence once (profile re-skinned per
 * style, draw-order pinned [close, drop2, quartal, spread, block],
 * shared rng stream). The firstDrop2Bar annotation gate reads the
 * REALIZED flag passthrough (D74 lineage - never re-derived).
 *
 * Concept gating is MECHANICAL (D95/D99): voiceLeadingGate /
 * drop2Gate recompute the annotate.ts predicates on the REALIZED
 * pitches (mean nearest-tone motion <= 4; tetrad gap >= 7 with the
 * lower three inside an octave). A style name is never a claim - the
 * cards layer assigns voice-leading / drop-2 conceptIds ONLY through
 * these gates.
 *
 * Purity: relative imports only, Rng injected, no clock, no console.
 */

import { voiceSequence } from "../compose/voicing";
import type { ChordCell } from "../compose/types";
import type { Rng } from "../core/rng";
import type { MidiRange, StyleProfile, VoicingStyle } from "../styles/types";

/** D95/D100 draw order (part of the determinism contract). */
export const VOICELEAD_ORDER: readonly VoicingStyle[] = [
  "close",
  "drop2",
  "quartal",
  "spread",
  "block",
];

export interface VoiceLeadOptions {
  /** Per style: one pitch array per input chord (null = rest/unknown). */
  readonly options: Readonly<
    Record<VoicingStyle, readonly (readonly number[] | null)[]>
  >;
  /** Per style: the realized drop-2 flag passthrough (null = never). */
  readonly firstDrop2Bar: Readonly<Record<VoicingStyle, number | null>>;
}

export function voiceLeadOptions(
  cells: readonly ChordCell[],
  profile: StyleProfile,
  register: MidiRange,
  rng: Rng,
): VoiceLeadOptions {
  const options = {} as Record<
    VoicingStyle,
    readonly (readonly number[] | null)[]
  >;
  const firstDrop2Bar = {} as Record<VoicingStyle, number | null>;
  for (const style of VOICELEAD_ORDER) {
    const res = voiceSequence({
      cells: [cells],
      profile: {
        ...profile,
        voicing: { ...profile.voicing, style },
      },
      rng,
      allowRootless: style !== "block",
      register,
    });
    options[style] = res.voicings[0] ?? [];
    firstDrop2Bar[style] = res.firstDrop2Bar;
  }
  return { options, firstDrop2Bar };
}

/**
 * D95 gate: mean per-voice nearest-tone motion <= 4 semitones across
 * the realized arrays (annotate.ts transitionMotion arithmetic, same
 * threshold). Needs >= 2 sounding arrays; rests break the chain.
 */
export function voiceLeadingGate(
  voicings: readonly (readonly number[] | null)[],
): boolean {
  const sounding = voicings.filter(
    (v): v is readonly number[] => v !== null && v.length > 0,
  );
  if (sounding.length < 2) return false;
  // Rests break the chain: only score ADJACENT pairs in the original
  // order (a null between two arrays restarts the line).
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i + 1 < voicings.length; i++) {
    const a = voicings[i];
    const b = voicings[i + 1];
    if (a === null || b === null || a.length === 0 || b.length === 0) {
      continue;
    }
    let motion = 0;
    for (const n of a) {
      let best = Infinity;
      for (const m of b) {
        const d = Math.abs(n - m);
        if (d < best) best = d;
      }
      motion += best;
    }
    sum += motion / a.length;
    pairs++;
  }
  if (pairs === 0) return false;
  return sum / pairs <= 4;
}

/**
 * D95 gate: tetrad whose 2nd-from-top voice sits >= 7 semitones below
 * the top with the lower three inside an octave (annotate.ts rule-7
 * arithmetic, ascending input).
 */
export function drop2Gate(pitches: readonly number[]): boolean {
  if (pitches.length !== 4) return false;
  const gap = (pitches[3] as number) - (pitches[2] as number);
  const lowerThree = (pitches[2] as number) - (pitches[0] as number);
  return gap >= 7 && lowerThree <= 12;
}
