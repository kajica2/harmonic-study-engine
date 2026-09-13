/**
 * sliceBarForRepeat — Coltrane-style slice-and-repeat subdivider.
 *
 * Given a bar's 4 steps (one per beat), produce 4 single-beat "cells"
 * so the live score can render the bar as a recurring motif. Each cell
 * carries:
 *   - the step's notes (unchanged)
 *   - the beat index (0..3)
 *   - a label of the chord at that beat (for abcjs rendering)
 *
 * When the source bar has fewer than 4 steps, pads with the last
 * step (so the rhythm is consistent across the bar). When the source
 * bar is empty, returns 4 empty cells.
 *
 * This is purely a data transform — rendering is the caller's job.
 *
 * Tests: src/lib/sliceAndRepeat.test.ts
 */
import { HarmonicStep } from "./paths";

export interface BeatCell {
  /** Beat index 0..3 within the bar */
  beat: number;
  /** Notes at this beat (copied, not referenced) */
  notes: number[];
  /** Display label — the step's `name` field, e.g. "Cmaj7" */
  chordName: string;
}

/**
 * Slice a bar's 4 steps into 4 single-beat cells. Used when
 * `path.sliceAndRepeat === true` (Coltrane-style recurring motifs).
 *
 * @param steps the path's full step array
 * @param barIndex which bar to slice (0-indexed)
 * @returns exactly 4 BeatCells, one per beat
 */
export function sliceBarForRepeat(
  steps: HarmonicStep[],
  barIndex: number,
): BeatCell[] {
  const start = barIndex * 4;
  const slice = steps.slice(start, start + 4);
  // Pad with the last step so a bar with 1-3 steps still has 4 cells.
  const last = slice[slice.length - 1] ?? { notes: [], name: "" };
  while (slice.length < 4) slice.push(last);
  return slice.map((s, beat) => ({
    beat,
    notes: [...s.notes],
    chordName: s.name ?? "",
  }));
}

/**
 * Apply slice-and-repeat to an entire path: returns an array of
 * BeatCells[] per bar. Convenience wrapper for callers that want to
 * pre-compute the subdivision for the live score.
 *
 * @param steps the path's full step array
 * @returns BeatCells grouped by bar (length = Math.ceil(steps.length / 4))
 */
export function slicePathForRepeat(steps: HarmonicStep[]): BeatCell[][] {
  const totalBars = Math.ceil(steps.length / 4);
  const out: BeatCell[][] = [];
  for (let b = 0; b < totalBars; b++) out.push(sliceBarForRepeat(steps, b));
  return out;
}