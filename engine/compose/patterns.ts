/**
 * engine/compose/patterns.ts - PRD-001 Phase 4 Slice 3 (D66).
 *
 * THE PATTERN LIBRARY. PRD Appendix C defers the pattern CONTENT to a
 * "Pattern Library reference" that does not exist; the tables authored
 * in docs/PHASE-4-S3-ACCOMPANIMENT.md section D66 ARE that reference
 * and are transcribed HERE VERBATIM (hits/spans/thinning-ranks/accents/
 * feel-affinities/labels + the meter-tiling rule). This is CONTENT
 * design, not plumbing: musical regressions cannot be caught by unit
 * tests (RK6) - tests pin STRUCTURE (positions, ranks, determinism,
 * register containment), humans pin MUSICALITY.
 *
 * Thinning model (D67): a hit sounds iff density >= hit.rank. Rank 0
 * = anchor (survives any density), 5 = full-detail. Raising density
 * only ADDS hits - never moves or re-pitches them (the ranks are
 * authored per-hit; pitch planning is density-INDEPENDENT).
 *
 * Honesty notes baked into the data (D66/D74):
 *  - freddieGreen caps at density 2 (all four quarters present);
 *    densities 3..5 are NO-OPS for it and the label says
 *    "quarter-note stabs", never "sixteenth-note" anything.
 *  - nextApproach exists ONLY on walking.
 *  - The lo-fi "lazy" identity is the late STEP (16th index 1/3), not
 *    a hidden swing - the label says "behind the beat".
 *
 * Purity: relative imports only, no clock, no randomness, no console.
 */

import type { BassPatternId, ChordPatternId, FeelId } from "../styles/types";

/** The pitch token a bass hit plays (resolved by engine/compose/bass.ts). */
export type BassTone =
  | "root"
  | "third"
  | "fifth"
  | "seventh"
  | "b7"
  | "nextApproach";

export interface PatternHit {
  /** Cell-relative beat index (see tiling below). */
  readonly beat: number;
  /** Slot within the beat, in this entry's divisions (0..divisions-1). */
  readonly step: number;
  /** Length in slots; -1 = sustain to the end of the cell region. */
  readonly span: number;
  /** THE THINNING RANK (REQ-COMP-33): the hit sounds iff density >= rank.
   *  0 = anchor (survives any density), 5 = full-detail. Monotone by
   *  construction: raising density only ADDS hits, never moves or
   *  re-pitches them (property-tested, D67). */
  readonly rank: number; // 0..5
  /** Velocity tier: 2 = strong, 1 = beat, 0 = color (table below). */
  readonly accent: 0 | 1 | 2;
  /** toneMode "cycle" (chord patterns): index into the ASCENDING-sorted
   *  voicing (0 = lowest voice). Ignored for "all". */
  readonly voice?: number;
  /** kind "bass": the pitch token this hit plays (resolved by bass.ts).
   *  Ignored by chord patterns. */
  readonly tone?: BassTone;
}

export interface PatternEntry {
  readonly id: string; // ChordPatternId | BassPatternId value
  readonly kind: "chord" | "bass";
  /** Grid the hits are authored on: steps per beat (2 = eighths, 4 = 16ths).
   *  Realization uses max(entry.divisions, profile.rhythm.gridDivisions)
   *  so 16th patterns (lazy, shuffleBoogie) survive a 2-division style. */
  readonly divisions: 2 | 4;
  readonly toneMode: "all" | "cycle"; // all = strum the full voicing
  /** Feel affinity (PRD App C "feel affinity"): the feels this pattern is
   *  idiomatic for. DATA + integrity-tested (every shipped profile's
   *  defaultFeel must be in its patterns' affinity lists); runtime use:
   *  annotation wording only. */
  readonly feel: readonly FeelId[];
  /** Bar length in beats the hit table TILES across (4/4 authoring ->
   *  3/4 truncates, 5/4 repeats + truncates - table below). */
  readonly repeat: number;
  readonly hits: readonly PatternHit[];
  /** TRUTHFUL annotation stem (D74): the label is only ever emitted when
   *  this entry is the one realized. */
  readonly label: string;
}

/** Velocity tiers (D66), indexed by hit.accent. NO rng in velocity -
 *  velocity is a pure function of data (the draw-order surface stays
 *  tiny). */
export const PATTERN_VELOCITY: Readonly<
  Record<"bass" | "chords" | "pad", readonly [number, number, number]>
> = {
  bass: [0.7, 0.85, 0.95],
  chords: [0.62, 0.78, 0.92],
  pad: [0.5, 0.58, 0.65],
};

function hit(
  beat: number,
  step: number,
  span: number,
  rank: number,
  accent: 0 | 1 | 2,
  extra?: { voice?: number; tone?: BassTone },
): PatternHit {
  const base: {
    beat: number;
    step: number;
    span: number;
    rank: number;
    accent: 0 | 1 | 2;
    voice?: number;
    tone?: BassTone;
  } = { beat, step, span, rank, accent };
  if (extra?.voice !== undefined) base.voice = extra.voice;
  if (extra?.tone !== undefined) base.tone = extra.tone;
  return base;
}

const ALL_FEELS: readonly FeelId[] = [
  "straight",
  "lightSwing",
  "mediumSwing",
  "hardSwing",
  "shuffle",
];

/** The 8 chord patterns (PRD Appendix C), verbatim from D66. Voicing =
 *  4 voices max, ascending indices 0..3. */
const CHORD_PATTERNS: readonly PatternEntry[] = [
  {
    id: "freddieGreen",
    kind: "chord",
    divisions: 2,
    toneMode: "all",
    feel: ["lightSwing", "mediumSwing", "hardSwing", "shuffle"],
    repeat: 4,
    label: "Freddie Green quarter-note stabs",
    hits: [
      hit(0, 0, 1, 0, 2),
      hit(2, 0, 1, 1, 1),
      hit(1, 0, 1, 2, 1),
      hit(3, 0, 1, 2, 1),
    ],
  },
  {
    id: "charleston",
    kind: "chord",
    divisions: 2,
    toneMode: "all",
    feel: ["straight", "lightSwing", "mediumSwing"],
    repeat: 4,
    label: "Charleston figure (dotted quarter + off-beat)",
    hits: [hit(0, 0, 2, 0, 2), hit(1, 1, 1, 1, 0)],
  },
  {
    id: "block",
    kind: "chord",
    divisions: 2,
    toneMode: "all",
    feel: ["straight"],
    repeat: 4,
    label: "sustained block chords on the halves",
    hits: [
      hit(0, 0, 2, 0, 2),
      hit(2, 0, 2, 1, 1),
      hit(1, 0, 1, 3, 1),
      hit(3, 0, 1, 3, 1),
    ],
  },
  {
    id: "pulse",
    kind: "chord",
    divisions: 4,
    toneMode: "all",
    feel: ["straight"],
    repeat: 4,
    label: "steady eighth-note pulse",
    hits: [
      hit(0, 0, 2, 0, 2),
      hit(1, 0, 2, 2, 1),
      hit(2, 0, 2, 1, 1),
      hit(3, 0, 2, 2, 1),
      hit(0, 2, 2, 3, 0),
      hit(1, 2, 2, 4, 0),
      hit(2, 2, 2, 4, 0),
      hit(3, 2, 2, 4, 0),
    ],
  },
  {
    id: "offbeat",
    kind: "chord",
    divisions: 2,
    toneMode: "all",
    feel: ["straight", "lightSwing"],
    repeat: 4,
    label: "off-beat stabs",
    hits: [
      hit(0, 1, 1, 0, 1),
      hit(2, 1, 1, 1, 1),
      hit(1, 1, 1, 2, 0),
      hit(3, 1, 1, 2, 0),
    ],
  },
  {
    id: "lazy",
    kind: "chord",
    divisions: 4,
    toneMode: "all",
    feel: ["straight", "lightSwing"],
    repeat: 4,
    label: "lo-fi dragged hits behind the beat",
    hits: [
      hit(0, 1, 3, 0, 2),
      hit(2, 1, 3, 1, 1),
      hit(1, 3, 2, 2, 0),
      hit(3, 3, 2, 3, 0),
    ],
  },
  {
    id: "sustain",
    kind: "chord",
    divisions: 2,
    toneMode: "all",
    feel: ALL_FEELS,
    repeat: 4,
    label: "whole-bar sustained pad",
    hits: [hit(0, 0, -1, 0, 2)],
  },
  {
    id: "alberti",
    kind: "chord",
    divisions: 2,
    toneMode: "cycle",
    feel: ["straight"],
    repeat: 4,
    label: "Alberti broken-chord accompaniment",
    hits: [
      hit(0, 0, 1, 0, 2, { voice: 0 }),
      hit(2, 0, 1, 1, 1, { voice: 0 }),
      hit(1, 0, 1, 2, 1, { voice: 1 }),
      hit(3, 0, 1, 2, 1, { voice: 1 }),
      hit(0, 1, 1, 3, 0, { voice: 2 }),
      hit(1, 1, 1, 4, 0, { voice: 2 }),
      hit(2, 1, 1, 3, 0, { voice: 2 }),
      hit(3, 1, 1, 4, 0, { voice: 2 }),
    ],
  },
];

/** The 6 bass patterns, verbatim from D66. Tone tokens are resolved by
 *  engine/compose/bass.ts (D69). */
const BASS_PATTERNS: readonly PatternEntry[] = [
  {
    id: "walking",
    kind: "bass",
    divisions: 2,
    toneMode: "all",
    feel: ["lightSwing", "mediumSwing", "hardSwing"],
    repeat: 4,
    label: "walking bass (chord tones + approach)",
    hits: [
      hit(0, 0, 1, 0, 2, { tone: "root" }),
      hit(2, 0, 1, 1, 1, { tone: "fifth" }),
      hit(1, 0, 1, 2, 1, { tone: "third" }),
      hit(3, 0, 1, 2, 0, { tone: "nextApproach" }),
    ],
  },
  {
    id: "twoFeel",
    kind: "bass",
    divisions: 2,
    toneMode: "all",
    feel: ["mediumSwing", "hardSwing", "straight"],
    repeat: 4,
    label: "two-feel (root-half, fifth-half)",
    hits: [hit(0, 0, 2, 0, 2, { tone: "root" }), hit(2, 0, 2, 1, 1, { tone: "fifth" })],
  },
  {
    id: "rootFifth",
    kind: "bass",
    divisions: 2,
    toneMode: "all",
    feel: ["straight"],
    repeat: 4,
    label: "root-fifth quarters",
    hits: [
      hit(0, 0, 1, 0, 2, { tone: "root" }),
      hit(2, 0, 1, 1, 1, { tone: "root" }),
      hit(1, 0, 1, 2, 1, { tone: "fifth" }),
      hit(3, 0, 1, 2, 1, { tone: "fifth" }),
    ],
  },
  {
    id: "eighthPulse",
    kind: "bass",
    divisions: 2,
    toneMode: "all",
    feel: ["straight"],
    repeat: 4,
    label: "eighth-note root pulse",
    hits: [
      hit(0, 0, 1, 0, 2, { tone: "root" }),
      hit(2, 0, 1, 1, 1, { tone: "root" }),
      hit(1, 0, 1, 2, 2, { tone: "root" }),
      hit(3, 0, 1, 2, 2, { tone: "root" }),
      hit(0, 1, 1, 3, 0, { tone: "root" }),
      hit(1, 1, 1, 3, 0, { tone: "root" }),
      hit(2, 1, 1, 4, 0, { tone: "root" }),
      hit(3, 1, 1, 4, 0, { tone: "root" }),
    ],
  },
  {
    id: "shuffleBoogie",
    kind: "bass",
    divisions: 4,
    toneMode: "all",
    feel: ["shuffle", "hardSwing"],
    repeat: 4,
    label: "shuffle boogie (root-fifth-flat7 cells)",
    hits: [
      hit(0, 0, 2, 0, 2, { tone: "root" }),
      hit(0, 2, 1, 2, 1, { tone: "fifth" }),
      hit(0, 3, 1, 3, 0, { tone: "b7" }),
      hit(2, 0, 2, 1, 1, { tone: "root" }),
      hit(2, 2, 1, 2, 1, { tone: "fifth" }),
      hit(2, 3, 1, 3, 0, { tone: "b7" }),
      hit(1, 0, 2, 2, 1, { tone: "root" }),
      hit(1, 2, 1, 3, 0, { tone: "fifth" }),
      hit(1, 3, 1, 3, 0, { tone: "b7" }),
      hit(3, 0, 2, 2, 1, { tone: "root" }),
      hit(3, 2, 1, 3, 0, { tone: "fifth" }),
      hit(3, 3, 1, 3, 0, { tone: "b7" }),
    ],
  },
  {
    id: "drone",
    kind: "bass",
    divisions: 2,
    toneMode: "all",
    feel: ["straight", "mediumSwing"],
    repeat: 4,
    label: "drone root",
    hits: [hit(0, 0, -1, 0, 2, { tone: "root" })],
  },
];

const ALL: readonly PatternEntry[] = [...CHORD_PATTERNS, ...BASS_PATTERNS];

export function chordPattern(id: ChordPatternId): PatternEntry | null {
  return ALL.find((p) => p.kind === "chord" && p.id === id) ?? null;
}

export function bassPattern(id: BassPatternId): PatternEntry | null {
  return ALL.find((p) => p.kind === "bass" && p.id === id) ?? null;
}

export function allPatterns(): readonly PatternEntry[] {
  return ALL;
}

/** The pad role's fixed pattern (D71 meta.patternIds.pad): the ONLY
 *  authored entry whose label names the pad texture, and its feel list
 *  is all five so the shipped-profile affinity pin holds for every
 *  style. Density never thins it (single rank-0 hit) - honest, the
 *  pad is a sustained bed. */
export const PAD_PATTERN_ID: ChordPatternId = "sustain";

/**
 * METER TILING (the table D52 promised): cell beats `B =
 * floor(cellTicks / beatTicks)` with beatTicks = ppq quarters (6/8 bar
 * = 3 quarter-beats; 7/8 = 3.5 -> floor to 3, the half-beat tail
 * clamps the last span). A hit at authored beat `b` fires at
 * `b + k*repeat` for every k >= 0 with `b + k*repeat < B`; spans clamp
 * to the cell end at realization time (D70). Output order is the
 * AUTHORED hit order (hit-major) so downstream pitch arrays stay
 * "aligned to hit order (pre-thinning)" per D69; chronological order
 * is a sort of this list, never this list's identity.
 *
 * Hits whose step >= divisions are data bugs - validated at TEST time
 * (patterns.test.ts), not runtime.
 *
 * SPAN -1 EXCEPTION (documented resolution of a D66/D70 tension): a
 * sustain-to-cell-end hit fires ONCE per cell, never per tile copy -
 * a beat-4 drone re-fire under a still-sustaining beat-0 drone would
 * self-overlap and violate the monophonic-bass invariant (test plan
 * 4f). Every other hit tiles by `b + k*repeat < B` verbatim.
 */
export function tiledHits(entry: PatternEntry, cellBeats: number): readonly PatternHit[] {
  const out: PatternHit[] = [];
  for (const h of entry.hits) {
    for (let b = h.beat; b < cellBeats; b += entry.repeat) {
      out.push({ ...h, beat: b });
      if (h.span === -1) break; // sustain absorbs the remaining tiles
    }
  }
  return out;
}
