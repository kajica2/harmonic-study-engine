/**
 * engine/compose/types.ts - PRD-001 Phase 4 Slice 1 (D45/D46/D49).
 *
 * The canonical Compose data model. Imported songs live in
 * NormalizedProject (tick-native, tempo-map-aware), NEVER in
 * HarmonicPath (D45). Every analyzer returns an Outcome (D49) -
 * analyzers never throw into the UI (REQ-COMP-15 / NFR-5).
 *
 * Plain-serializable throughout (worker-liftable, D54; future
 * MusicXML import, REQ-IO-60). Versioned per REQ-FND-5.
 *
 * Purity: relative imports only, no clock, no randomness, no console.
 */

import type { Versioned } from "../core/versioned";
import type { Annotation } from "../pedagogy/types";

/** REQ-COMP-15 / NFR-5. Analyzers return outcomes; they never throw. */
export type AnalysisErrorCode =
  | "noNotes" // REQ-COMP-50: empty MIDI
  | "parseFailed" // corrupt / not a MIDI file
  | "unsupported" // SMF format > 2, ppq 0, etc.
  | "tooLarge" // > 30MB cap (checked pre-parse, REQ-COMP-1)
  | "internal"; // bug guard: message is generic, never a stack

export interface AnalysisError {
  readonly code: AnalysisErrorCode;
  readonly message: string; // human-readable, ASCII, UI-safe
}

export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AnalysisError };

/** PRD 11.1 MidiNote. Tick-native (REQ-COMP-14); velocity normalized
 *  0..1 (pinned to @tonejs/midi's convention; adapters converting raw
 *  0..127 bytes divide by 127 - normalize.ts owns this). */
export interface NormalizedNote {
  readonly midi: number; // 0..127 (REQ-FND-1)
  readonly tick: number; // absolute start tick
  readonly durationTicks: number; // >= 1 after normalize (clamped)
  readonly velocity: number; // 0..1
}

export type TrackRole = "melody" | "bass" | "harmony" | "percussion" | "unknown";

/** Parse output track (roles are ANALYSIS output, not parse output -
 *  roles.ts consumes a project and returns assignments). */
export interface NormalizedTrack {
  readonly index: number; // 0-based, parse order
  readonly name: string; // track name meta or ""
  readonly channel: number; // 0..15; per-group accurate for ALL formats:
  // @tonejs/midi's splitTracks() runs for format 0 too and re-groups by
  // (program, channel), so the old F6 "last-seen channel" caveat is
  // falsified (see docs/PHASE-4-COMPOSE.md errata D7)
  readonly program: number; // 0..127 GM program, 128 = unknown
  readonly isPercussion: boolean; // channel === 9 (GM, every format)
  readonly notes: readonly NormalizedNote[]; // ascending by tick (test-pinned)
  readonly endTick: number; // last noteOff across notes
  readonly usesPitchBend: boolean; // REQ-COMP-6 warning source
}

export interface ProjectTempo {
  readonly tick: number;
  readonly bpm: number;
}
export interface ProjectTimeSignature {
  readonly tick: number;
  readonly numerator: number;
  readonly denominator: number;
}
export interface ProjectKeySignature {
  readonly tick: number;
  readonly tonicPc: number;
  readonly mode: "major" | "minor";
}

/** PRD 11.1 NormalizedProject. Plain-serializable (worker + future
 *  MusicXML import, REQ-IO-60). Versioned per REQ-FND-5. */
export interface NormalizedProject extends Versioned {
  readonly format: 0 | 1 | 2;
  readonly ppq: number; // ticks per quarter, > 0
  readonly name: string; // from header/first track
  readonly fileName: string; // upload surface original
  readonly tempos: readonly ProjectTempo[]; // ascending, [0] = {tick:0}
  readonly timeSignatures: readonly ProjectTimeSignature[]; // ascending
  readonly keySignatures: readonly ProjectKeySignature[]; // ascending (may be [])
  readonly tracks: readonly NormalizedTrack[];
  readonly endTick: number; // max across tracks
  readonly durationSec: number; // derived via tempo map
  readonly warnings: readonly string[]; // ASCII, UI-displayable
}

/** Structural view of @tonejs/midi's MidiJSON - declared HERE so engine
 *  never imports the package (D46/F7). Field set = exactly what
 *  normalize.ts reads; extra fields are ignored.
 *
 *  DEVIATION (justified): the design's DTO omits `format`, but
 *  normalize MUST validate "format > 2 -> unsupported". @tonejs/midi's
 *  toJSON() does NOT emit the SMF format (verified: only midi-file's raw
 *  header has it), so the ADAPTER injects `header.format` from the 2-byte
 *  SMF header. It is optional so hand-built DTO fixtures stay ergonomic;
 *  normalize infers it (<=1 track => 0, else 1) when absent. */
export interface MidiJsonLike {
  readonly header: {
    readonly ppq: number;
    readonly name: string;
    readonly format?: number; // 0 | 1 | 2 (adapter-supplied; see above)
    readonly tempos: readonly { readonly ticks: number; readonly bpm: number }[];
    readonly timeSignatures: readonly {
      readonly ticks: number;
      readonly timeSignature: readonly number[];
    }[];
    readonly keySignatures: readonly {
      readonly ticks: number;
      readonly key: string;
      readonly scale: string;
    }[];
  };
  readonly tracks: readonly {
    readonly name: string;
    readonly channel: number;
    readonly instrument: { readonly number: number };
    readonly notes: readonly {
      readonly midi: number;
      readonly ticks: number;
      readonly durationTicks: number;
      readonly velocity: number;
    }[];
    readonly pitchBends?: readonly unknown[];
    readonly endOfTrackTicks?: number;
  }[];
}

/** REQ-COMP-4. */
export interface TrackRoleAssignment {
  readonly trackIndex: number;
  readonly role: TrackRole;
  readonly confidence: number; // 0..1
}

/** REQ-COMP-10. */
export interface KeyCandidate {
  readonly tonicPc: number; // 0..11
  readonly mode: "major" | "minor";
  readonly correlation: number; // Pearson r, -1..1
}
export interface KeyResult {
  readonly candidates: readonly KeyCandidate[]; // ranked, length 3
  readonly declared: ProjectKeySignature | null; // from SMF meta, if any
  readonly chromaticFallback: boolean; // REQ-COMP-52: top r < 0.50 OR
  // < 5 distinct windowed pcs OR < 16 windowed notes
}

/** REQ-COMP-11. */
export interface MelodyResult {
  readonly sourceTrackIndex: number | null; // null = synthesized top line
  readonly synthesized: boolean;
  readonly notes: readonly NormalizedNote[]; // ascending by tick
}

/** REQ-COMP-12/23. One cell = one chord slot. */
export interface ChordCell {
  readonly rootPc: number; // 0..11
  readonly qualitySymbol: string; // core/chords key, e.g. "maj7", "m7", "dom7"
  readonly name: string; // spelled display, e.g. "Dm7" (D11 rules)
  readonly bassPc: number | null; // slash bass if detected != root, else null
  readonly confidence: number; // 0..1 (calibrated, see spec)
  readonly alternatives: readonly ChordCell[]; // top-3 EXCLUDING chosen,
  // confidence descending, each
  // alternatives[].alternatives = []
  readonly isRest: boolean; // empty region -> rest (deletable cell)
}
export interface BarRegions {
  readonly bar: number; // 0-based
  readonly startTick: number;
  readonly endTick: number;
  readonly slots: readonly ChordCell[]; // length = slotsPerBar for this bar
}
export interface ChordGrid {
  readonly slotsPerBar: number; // 1 default; 2 when split (REQ-COMP-23)
  readonly bars: readonly BarRegions[];
}

/** REQ-COMP-53: default analysis window 4 minutes of musical time. */
export interface AnalysisWindow {
  readonly fromTick: number;
  readonly toTick: number; // exclusive; clamped to project.endTick
}

/** The S1 pipeline output. Versioned (future localStorage/URL safety). */
export interface ComposeAnalysis extends Versioned {
  readonly roles: readonly TrackRoleAssignment[];
  readonly key: KeyResult;
  readonly melody: MelodyResult;
  readonly grid: ChordGrid;
  readonly window: AnalysisWindow; // what was ACTUALLY analyzed
  readonly truncated: boolean; // REQ-COMP-53: file longer than window
  readonly percussionOnly: boolean; // REQ-COMP-51
  readonly annotations: readonly Annotation[]; // REQ-PED-1 (truthful only)
}

/** REQ-COMP-21: every detected value overridable. Sparse by design. */
export interface AnalysisOverrides {
  readonly key: KeyCandidate | null;
  readonly tempoBpm: number | null;
  readonly timeSignature: readonly [number, number] | null;
  readonly melodyTrackIndex: number | null;
  readonly chordCells: Readonly<Record<string, ChordCell | null>>; // "bar:slot"; null = rest
  readonly roles: Readonly<Record<string, TrackRole>>; // trackIndex -> role
}

/** A silent / deleted chord cell. qualitySymbol/name empty (a rest has
 *  no quality); renderers key off isRest. */
export function restCell(): ChordCell {
  return {
    rootPc: 0,
    qualitySymbol: "",
    name: "",
    bassPc: null,
    confidence: 0,
    alternatives: [],
    isRest: true,
  };
}

export const EMPTY_OVERRIDES: AnalysisOverrides = Object.freeze({
  key: null,
  tempoBpm: null,
  timeSignature: null,
  melodyTrackIndex: null,
  chordCells: Object.freeze({}),
  roles: Object.freeze({}),
});

/** REQ-COMP-22 tiers. Boundary semantics pinned: >0.80 auto; >=0.50
 *  highlight; >=0.30 radio; else manual. */
export type ConfidenceTier = "auto" | "highlight" | "radio" | "manual";
export function confidenceTier(c: number): ConfidenceTier {
  if (c > 0.8) return "auto";
  if (c >= 0.5) return "highlight";
  if (c >= 0.3) return "radio";
  return "manual";
}

function sameKey(a: KeyCandidate, b: KeyCandidate): boolean {
  return a.tonicPc === b.tonicPc && a.mode === b.mode;
}

/**
 * Pure merged view the S2 card renders (D49 / section 3). NEVER mutates
 * `a` or `o`; returns a fresh ComposeAnalysis.
 *
 * Merged here (fields the ComposeAnalysis itself carries):
 *   - key: an override becomes the default selection (candidates[0]).
 *   - roles: per-track role overrides (confidence -> 1, manual = certain).
 *   - grid: chord-cell overrides ("bar:slot"; null -> rest).
 *   - melody: the selected source track index (note RE-extraction needs
 *     the project and is S2's job; the merged view records the choice).
 *
 * NOT merged (no field on ComposeAnalysis; consumed downstream):
 *   - tempoBpm / timeSignature: project-level, applied by S4's
 *     player/export from the overrides, not by the analysis view.
 */
export function mergeAnalysis(a: ComposeAnalysis, o: AnalysisOverrides): ComposeAnalysis {
  const roles = mergeRoles(a.roles, o.roles);
  const key = mergeKey(a.key, o.key);
  const melody = mergeMelody(a.melody, o.melodyTrackIndex);
  const grid = mergeGrid(a.grid, o.chordCells);
  return {
    version: a.version,
    roles,
    key,
    melody,
    grid,
    window: a.window,
    truncated: a.truncated,
    percussionOnly: a.percussionOnly,
    annotations: a.annotations,
  };
}

function mergeRoles(
  roles: readonly TrackRoleAssignment[],
  over: AnalysisOverrides["roles"],
): readonly TrackRoleAssignment[] {
  const entries = Object.entries(over);
  if (entries.length === 0) return roles;
  const byIndex = new Map<number, TrackRole>();
  for (const [k, v] of entries) {
    const idx = Number(k);
    if (Number.isInteger(idx)) byIndex.set(idx, v);
  }
  return roles.map((r) => {
    const role = byIndex.get(r.trackIndex);
    return role === undefined ? r : { trackIndex: r.trackIndex, role, confidence: 1 };
  });
}

function mergeKey(key: KeyResult, over: AnalysisOverrides["key"]): KeyResult {
  if (over === null) return key;
  const rest = key.candidates.filter((c) => !sameKey(c, over));
  return {
    candidates: [over, ...rest].slice(0, 3),
    declared: key.declared,
    chromaticFallback: key.chromaticFallback,
  };
}

function mergeMelody(melody: MelodyResult, over: AnalysisOverrides["melodyTrackIndex"]): MelodyResult {
  if (over === null || !Number.isInteger(over) || over < 0) return melody;
  return { sourceTrackIndex: over, synthesized: false, notes: melody.notes };
}

function mergeGrid(
  grid: ChordGrid,
  over: AnalysisOverrides["chordCells"],
): ChordGrid {
  const entries = Object.entries(over);
  if (entries.length === 0) return grid;
  // "bar:slot" -> cell (null = rest)
  const patch = new Map<string, ChordCell>();
  for (const [k, v] of entries) {
    patch.set(k, v === null ? restCell() : v);
  }
  const bars = grid.bars.map((region) => {
    let changed = false;
    const slots = region.slots.map((cell, slot) => {
      const next = patch.get(`${region.bar}:${slot}`);
      if (next === undefined) return cell;
      changed = true;
      return next;
    });
    return changed ? { ...region, slots } : region;
  });
  return { slotsPerBar: grid.slotsPerBar, bars };
}
