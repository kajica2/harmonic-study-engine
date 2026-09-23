/**
 * src/lib/etudeAbc.ts - PRD-001 Phase 3 Slice 2 (D26).
 *
 * PURE ABC builder for the etude staff view: no abcjs import, no DOM,
 * node-testable. One line per bar over an eighth-note grid (L:1/8,
 * 8 slots per 4/4 bar), chord symbol on the bar's first token, rests
 * filling every gap so each bar sums to exactly 8 eighths.
 *
 * Documented simplifications (D26):
 *  - K:C + explicit accidentals for every mode. abcjs renders each
 *    accidental correctly; key-signature computation per mode is out
 *    of scope and this keeps the output deterministic + golden-testable.
 *  - Chord symbols stay CONCERT (the repo's concert-key convention);
 *    transposeShift moves only the melody note names, so the staff
 *    matches the sounding pitch like LiveScoreDisplay does.
 *  - A note whose durationSlots crosses the barline splits into the
 *    abcjs tie pair: "c2- | -c2".
 */

import type { Etude } from "../../engine/etude/types";
import { midiToABCName } from "./scoreGenerator";

const SLOTS_PER_BAR = 8;

interface AbcSegment {
  readonly slot: number; // absolute slot of this segment
  readonly len: number; // slots within the bar (never crosses)
  readonly midi: number;
  readonly tieStart: boolean; // continues into the next bar
  readonly tieStop: boolean; // continues from the previous bar
}

/** Split bar-crossing notes into per-bar segments (same rule as the
 *  MusicXML export, D27). */
function splitSegments(etude: Etude): AbcSegment[] {
  const segs: AbcSegment[] = [];
  const notes = [...etude.melody].sort((a, b) => a.slot - b.slot);
  for (const n of notes) {
    let cur = n.slot;
    let remaining = Math.max(1, n.durationSlots);
    let first = true;
    while (remaining > 0) {
      const barEnd = (Math.floor(cur / SLOTS_PER_BAR) + 1) * SLOTS_PER_BAR;
      const len = Math.min(remaining, barEnd - cur);
      segs.push({
        slot: cur,
        len,
        midi: n.midi,
        tieStop: !first,
        tieStart: remaining - len > 0,
      });
      cur += len;
      remaining -= len;
      first = false;
    }
  }
  return segs;
}

/** Duration suffix: 1 slot = bare eighth (L:1/8), d slots = "<d>". */
function durationSuffix(len: number): string {
  return len === 1 ? "" : String(len);
}

/**
 * Build the full ABC string for an etude. Deterministic: the only
 * inputs are etude fields + transposeShift (instanceId is NOT used).
 */
export function buildEtudeAbc(
  etude: Etude,
  opts: { transposeShift?: number } = {},
): string {
  const shift = opts.transposeShift ?? 0;
  const lines: string[] = [
    `X:${etude.canonicalId}`,
    `T:${etude.title}`,
    "M:4/4",
    "L:1/8",
    `Q:1/4=${etude.tempo}`,
    "K:C",
  ];

  const segs = splitSegments(etude);
  for (let bar = 0; bar < etude.bars; bar++) {
    const barStart = bar * SLOTS_PER_BAR;
    const barEnd = barStart + SLOTS_PER_BAR;
    const tokens: string[] = [];
    const chord = etude.chords[bar];
    if (chord) tokens.push(`"^${chord.name}"`);

    let cursor = barStart;
    for (const s of segs) {
      if (s.slot < barStart || s.slot >= barEnd) continue;
      if (s.slot > cursor) {
        tokens.push(`z${durationSuffix(s.slot - cursor)}`);
      }
      cursor = s.slot + s.len;
      const name = midiToABCName(s.midi + shift);
      tokens.push(
        `${s.tieStop ? "-" : ""}${name}${durationSuffix(s.len)}${s.tieStart ? "-" : ""}`,
      );
    }
    if (cursor < barEnd) {
      tokens.push(`z${durationSuffix(barEnd - cursor)}`);
    }

    const last = bar === etude.bars - 1;
    lines.push(`| ${tokens.join(" ")}${last ? " |]" : ""}`);
  }

  return lines.join("\n");
}
