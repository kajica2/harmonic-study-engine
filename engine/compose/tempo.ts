/**
 * engine/compose/tempo.ts - PRD-001 Phase 4 Slice 1 (REQ-COMP-13/14/53).
 *
 * Pure tempo-map + meter math over a NormalizedProject. One tempo-map
 * truth shared by the analyzer (S1), the player scheduler and the
 * export writer (S4) - D46/D50/D51.
 *
 * BAR LENGTH: ticksPerBar = numerator * ppq * 4 / denominator, where
 * `denominator` is the REAL (not SMF-code) denominator. NOTE: the SMF
 * time-signature denominator BYTE is a power-of-two code (3 => eighth),
 * but @tonejs/midi's midi-file parser ALREADY converts it
 * (`1 << code`) before it reaches the DTO, so normalize stores the real
 * value and this module consumes it directly. (The design's "den = 2 **
 * code" note describes the raw byte; applying it to @tonejs/midi output
 * would double-convert. Verified empirically: a 6/8 file parses to
 * timeSignature [6, 8].)
 *
 * Purity: relative imports only, no clock, no randomness, no console.
 */

import type {
  AnalysisWindow,
  NormalizedProject,
  ProjectTimeSignature,
} from "./types";

/** Ticks in one bar. May be fractional for an odd ppq + odd-eighth
 *  meter (e.g. 7/8 at ppq 91); barBoundaries rounds to integer ticks. */
export function ticksPerBar(ppq: number, ts: ProjectTimeSignature): number {
  const den = ts.denominator > 0 ? ts.denominator : 4;
  return (ts.numerator * ppq * 4) / den;
}

/** The active time signature at a tick: the last event at or before
 *  tick, else a 4/4 fallback (normalize guarantees [0] at tick 0). */
function activeTimeSignature(
  project: NormalizedProject,
  tick: number,
): ProjectTimeSignature {
  const list = project.timeSignatures;
  let active: ProjectTimeSignature | null = null;
  for (const ts of list) {
    if (ts.tick <= tick) active = ts;
    else break;
  }
  return active ?? { tick: 0, numerator: 4, denominator: 4 };
}

export interface BarBoundary {
  readonly startTick: number;
  readonly endTick: number;
  readonly timeSignature: ProjectTimeSignature;
}

/**
 * Meter-change-aware bar boundaries derived from TICKS (REQ-COMP-13/14),
 * never seconds. Bars tile from tick 0; each bar uses the time signature
 * active at its start. Generation stops once a bar would start at or
 * beyond `upToTick` (default: project.endTick). The final bar's endTick
 * may extend past upToTick (a full bar is emitted).
 */
export function barBoundaries(
  project: NormalizedProject,
  upToTick?: number,
): readonly BarBoundary[] {
  const end = upToTick === undefined ? project.endTick : upToTick;
  const out: BarBoundary[] = [];
  let tick = 0;
  // Guard against a zero/negative bar length looping forever.
  let guard = 0;
  const maxBars = 1_000_000;
  while (tick < end && guard++ < maxBars) {
    const ts = activeTimeSignature(project, tick);
    const rawLen = ticksPerBar(project.ppq, ts);
    const len = Math.max(1, Math.round(rawLen)); // integer tick grid
    out.push({ startTick: tick, endTick: tick + len, timeSignature: ts });
    tick += len;
  }
  return out;
}

/** Piecewise tick -> seconds across the tempo map. tempos[0].tick === 0
 *  is guaranteed by normalize (a default is prepended when absent). */
export function ticksToSeconds(project: NormalizedProject, tick: number): number {
  const ppq = project.ppq;
  const tempos = project.tempos;
  if (tempos.length === 0 || ppq <= 0) return 0;
  const target = Math.max(0, tick);
  let secs = 0;
  for (let i = 0; i < tempos.length; i++) {
    const cur = tempos[i];
    if (target <= cur.tick) break;
    const nextTick = i + 1 < tempos.length ? tempos[i + 1].tick : Infinity;
    const segEnd = Math.min(target, nextTick);
    const segTicks = segEnd - cur.tick;
    secs += (segTicks * 60) / (ppq * cur.bpm);
  }
  return secs;
}

/** Inverse of ticksToSeconds (may return a fractional tick; callers that
 *  need an integer grid round it). */
export function secondsToTicks(project: NormalizedProject, sec: number): number {
  const ppq = project.ppq;
  const tempos = project.tempos;
  if (tempos.length === 0 || ppq <= 0 || sec <= 0) return 0;
  let accSec = 0;
  for (let i = 0; i < tempos.length; i++) {
    const cur = tempos[i];
    const nextTick = i + 1 < tempos.length ? tempos[i + 1].tick : Infinity;
    const secPerTick = 60 / (ppq * cur.bpm);
    const segTicks = nextTick - cur.tick;
    const segSec = segTicks * secPerTick;
    if (nextTick === Infinity || sec <= accSec + segSec) {
      const remSec = Math.max(0, sec - accSec);
      return cur.tick + remSec / secPerTick;
    }
    accSec += segSec;
  }
  return 0;
}

/** REQ-COMP-53: the first 4 minutes of musical time, expressed in ticks.
 *  toTick is the 4-min mark (NOT clamped to endTick) so the caller can
 *  compute `truncated = project.endTick > window.toTick`. Analyzers
 *  clamp their note collection to endTick themselves. */
export function defaultWindow(project: NormalizedProject): AnalysisWindow {
  const toTick = Math.round(secondsToTicks(project, 240));
  return { fromTick: 0, toTick };
}

/**
 * PRD-001 Phase 4 Slice 4 (D79, TD-043 CLOSE-OUT): the tempo override
 * as a PURE project transform, applied at the single effectiveProject
 * choke point so preview / mixer / WAV / MIDI all inherit the truth.
 *
 * Semantics (documented honesty): a fixed PRACTICE tempo, not a
 * tempo-map edit - the override REPLACES the file's map with a single
 * tick-0 tempo. `bpm === null` returns the SAME object (identity
 * preserved - memo-friendly). A non-finite or non-positive bpm is
 * treated as null (defensive: garbage must never poison
 * ticksToSeconds).
 */
export function withTempoOverride(
  project: NormalizedProject,
  bpm: number | null,
): NormalizedProject {
  if (bpm === null || !Number.isFinite(bpm) || bpm <= 0) return project;
  return { ...project, tempos: [{ tick: 0, bpm }] };
}

/**
 * D79: the meter override hoisted from ComposeSurface's inline patch
 * (byte-identical to the shipped S2 behavior - one truth, no change).
 * `ts === null` returns the SAME object (identity preserved).
 */
export function withTimeSignatureOverride(
  project: NormalizedProject,
  ts: readonly [number, number] | null,
): NormalizedProject {
  if (ts === null) return project;
  const [num, den] = ts;
  return {
    ...project,
    timeSignatures: [{ tick: 0, numerator: num, denominator: den }],
  };
}
