/**
 * src/lib/countIn.ts - PRD-001 Phase 3 Slice 3 (D35). Pure count-in
 * sequence math for the pre-roll gate.
 *
 * The visible "3.. 2.. 1.." countdown renders EXACTLY the numbers
 * this module produces; the timing lives in src/hooks/useCountIn.ts.
 * The pre-roll counts BEATS, not bars ("8..7..6..5..4..3..2..1.."
 * for 2 bars of 4/4) - the big number is beatsLeft, the subline
 * derives the bar.
 */

import { stepsPerBeatFor } from "./metronomePatterns";
import type { TimeSignature } from "./rhythm";

/** Beat sequence for a pre-roll: bars * beatsPerBar ticks counted
 *  DOWN from the total to 1. e.g. (1, 4) -> [4, 3, 2, 1].
 *  Non-positive or fractional inputs yield [] (defensive - the App
 *  gate only calls start() when countInBars > 0). */
export function countInBeats(bars: number, beatsPerBar: number): number[] {
  if (!Number.isInteger(bars) || !Number.isInteger(beatsPerBar)) return [];
  const total = bars * beatsPerBar;
  if (total <= 0) return [];
  const out: number[] = [];
  for (let b = total; b >= 1; b -= 1) out.push(b);
  return out;
}

/** Wall-clock ms per count-in BEAT for this meter at this tempo.
 *  FIX ROUND (REVIEWER L3): the design's formula was a flat quarter
 *  pulse (60000/tempo) while the sequence counts beatsPerMeasureFor
 *  ticks - in compound meters (6/8, 7/8: eighth-note beats) that
 *  paced the pre-roll 2x slow vs the incoming grid. This derives the
 *  pace from stepsPerBeatFor, the SAME beat-unit source rhythm.ts
 *  playStep uses, so the count-in establishes the tempo the grid
 *  will actually run at. Returns 0 for a non-positive tempo. */
export function countInMsPerBeat(tempo: number, ts: TimeSignature): number {
  if (!(tempo > 0)) return 0;
  return (60000 / tempo) * (stepsPerBeatFor(ts) / 4);
}

/** Wall-clock length of the pre-roll in ms. Beats - not bars - pace
 *  the countdown, so total beats * the METER-CORRECT ms-per-beat
 *  (countInMsPerBeat). beatsPerBar must come from
 *  beatsPerMeasureFor(ts) - the same source the hook uses.
 *  Returns 0 for a non-positive tempo (defensive). */
export function countInDurationMs(
  bars: number,
  beatsPerBar: number,
  tempo: number,
  ts: TimeSignature,
): number {
  const total = Math.max(0, bars) * Math.max(0, beatsPerBar);
  return total * countInMsPerBeat(tempo, ts);
}
