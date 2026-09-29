/**
 * src/lib/composerChartAudio.ts — derive an audible chord sequence
 * from a ComposerChart for play-through audition.
 *
 * Per-kind semantics:
 *   - "bar": every ChartBar's chord is parsed via parseChordToMidi;
 *     chords that fail to parse are dropped (the chart's `kind === "bar"`
 *     UI still shows them with their textual chord symbol, but the
 *     audio engine has nothing to play).
 *   - "bitonal": each pair's two triads are stacked and played in
 *     alternation as `[t1, t2, t1, t2]` — 4 chords. Each triad is
 *     built on the major triad shape `[60 + r, 64 + r, 67 + r]`
 *     (matches composerSectionSeed.triad).
 *   - "row": P0 is rendered as four 3-note groups → 4 chords. The
 *     player walks the row three pitches at a time, one beat per
 *     group. (Mirrors seedRowPath's 3-notes-per-bar walk.)
 *   - "axis": one stacked triad per tonicAxis entry (major triad shape).
 *   - "duration" / "layer" / "section": `[]` — no pitch content. The
 *     UI disables Play/MIDI buttons for these and shows the honest
 *     tooltip "No pitch content for this chart kind".
 *
 * Pure: no React, no audio engine. Output is a list of MIDI-pitch
 * arrays the caller feeds to audioEngine.playChord(notes).
 */

import type { ComposerChart } from "./composerCatalog";
import { parseChordToMidi } from "./ireal";

/**
 * Major triad built on `rootPc` (0-11): root at MIDI 60, third +4,
 * fifth +7. Encodes the engine's seeded-triad shape so charts play
 * back on the same voicing the persona paths use.
 */
const TRIAD_MAJOR_INTERVALS = [0, 4, 7] as const;

function majorTriad(rootPc: number): number[] {
  return TRIAD_MAJOR_INTERVALS.map((iv) => 60 + rootPc + iv);
}

/**
 * Return the audible chord sequence for a ComposerChart. Empty for
 * duration / layer / section charts (honest empty — callers disable
 * audio controls).
 */
export function chartChordSequence(chart: ComposerChart): number[][] {
  switch (chart.kind) {
    case "bar":
      return chart.bars
        .map((b) => parseChordToMidi(b.chord) ?? [])
        .filter((notes) => notes.length > 0);
    case "bitonal":
      return chart.pairs.flatMap((pair) => [
        majorTriad(pair.root1),
        majorTriad(pair.root2),
        majorTriad(pair.root1),
        majorTriad(pair.root2),
      ]);
    case "row": {
      const seq: number[][] = [];
      const p0 = chart.forms.P0;
      for (let i = 0; i + 3 <= p0.length; i += 3) {
        seq.push([60 + p0[i], 60 + p0[i + 1], 60 + p0[i + 2]]);
      }
      return seq;
    }
    case "axis":
      return chart.tonicAxis.map((r) => majorTriad(r));
    case "duration":
    case "layer":
    case "section":
      return [];
  }
}