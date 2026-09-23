/**
 * engine/compose/harmony.test.ts - PRD-001 Phase 4 Slice 1 (test plan 6).
 *
 * Pins the per-region inference: unambiguous triads, the 7th-over-triad
 * preference, inversion slash naming, a ii-V-I in D minor spelled with
 * the minor key's flats, split-bar reinfer, the silent-bar rest, and the
 * top-3 alternatives shape.
 */

import { describe, it, expect } from "vitest";
import { segmentGrid, inferChords, reinferBar, HARMONY_WEIGHTS } from "./harmony";
import type { AnalysisWindow, NormalizedNote, NormalizedProject, NormalizedTrack, KeyCandidate } from "./types";

function note(midi: number, tick: number, durationTicks: number, velocity = 0.8): NormalizedNote {
  return { midi, tick, durationTicks, velocity };
}

function chord(midis: readonly number[], tick: number, durationTicks: number): NormalizedNote[] {
  return midis.map((m) => note(m, tick, durationTicks));
}

function proj(notes: NormalizedNote[], format: 0 | 1 | 2 = 1): NormalizedProject {
  const sorted = notes.slice().sort((a, b) => a.tick - b.tick);
  let endTick = 0;
  for (const n of sorted) endTick = Math.max(endTick, n.tick + n.durationTicks);
  const track: NormalizedTrack = {
    index: 0,
    name: "t",
    channel: 0,
    program: 0,
    isPercussion: false,
    notes: sorted,
    endTick,
    usesPitchBend: false,
  };
  return {
    version: 1,
    format,
    ppq: 480,
    name: "t",
    fileName: "t.mid",
    tempos: [{ tick: 0, bpm: 120 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [],
    tracks: [track],
    endTick,
    durationSec: 1,
    warnings: [],
  };
}

const C_MAJ: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 1 };
const D_MIN: KeyCandidate = { tonicPc: 2, mode: "minor", correlation: 1 };

function analyze(notes: NormalizedNote[], key: KeyCandidate, slotsPerBar = 1) {
  const p = proj(notes);
  const window: AnalysisWindow = { fromTick: 0, toTick: p.endTick };
  const grid = segmentGrid(p, window, slotsPerBar);
  return { p, grid, filled: inferChords(p, grid, key) };
}

describe("inferChords - unambiguous triads", () => {
  it("C major block chord -> C maj, confidence > 0.8", () => {
    const { filled } = analyze(chord([60, 64, 67], 0, 1920), C_MAJ);
    const cell = filled.bars[0].slots[0];
    expect(cell.rootPc).toBe(0);
    expect(cell.qualitySymbol).toBe("maj");
    expect(cell.name).toBe("C");
    expect(cell.confidence).toBeGreaterThan(0.8);
    expect(cell.isRest).toBe(false);
  });
});

describe("inferChords - 7th over triad", () => {
  it("adding the 7th (Bb) prefers a 7th chord over the plain triad", () => {
    // C-E-G-Bb is C7 (dominant). The design's "Cmaj7/Bb" line is musically
    // a dominant 7th; the honest assertion is: a 7th quality is chosen,
    // NOT the bare triad.
    const { filled } = analyze(chord([60, 64, 67, 70], 0, 1920), C_MAJ);
    const cell = filled.bars[0].slots[0];
    expect(cell.rootPc).toBe(0);
    expect(cell.qualitySymbol).not.toBe("maj");
    expect(cell.qualitySymbol).toContain("7");
  });
  it("a plain triad does NOT inflate to a 7th", () => {
    const { filled } = analyze(chord([60, 64, 67], 0, 1920), C_MAJ);
    expect(filled.bars[0].slots[0].qualitySymbol).toBe("maj");
  });
});

describe("inferChords - inversion slash", () => {
  it("C with E in the bass -> C/E (bassPc set, slash name)", () => {
    const { filled } = analyze(chord([52, 60, 67], 0, 1920), C_MAJ); // E3 C4 G4
    const cell = filled.bars[0].slots[0];
    expect(cell.rootPc).toBe(0);
    expect(cell.bassPc).toBe(4);
    expect(cell.name).toBe("C/E");
  });
});

describe("inferChords - ii-V-I in D minor", () => {
  it("Dm7 | G7 | Cm7 spelled with the minor key's flats", () => {
    const notes = [
      ...chord([50, 53, 57, 60], 0, 1920), // Dm7
      ...chord([55, 59, 62, 65], 1920, 1920), // G7
      ...chord([60, 63, 67, 70], 3840, 1920), // Cm7
    ];
    const { filled } = analyze(notes, D_MIN);
    expect(filled.bars.length).toBe(3);
    expect(filled.bars[0].slots[0]).toMatchObject({ rootPc: 2, qualitySymbol: "m7", name: "Dm7" });
    expect(filled.bars[1].slots[0]).toMatchObject({ rootPc: 7, qualitySymbol: "dom7", name: "G7" });
    expect(filled.bars[2].slots[0]).toMatchObject({ rootPc: 0, qualitySymbol: "m7", name: "Cm7" });
  });
});

describe("inferChords - carry-over (mutation-d coverage)", () => {
  it("single-pc region after a chord -> carry-over applies (x0.5)", () => {
    // Bar 1 has only ONE pitch class (a pedal C): distinct < 2 cannot be
    // template-scored, so the previous cell carries over at
    // confidence * carryOverFactor. Removing the carry-over branch used
    // to leave this path entirely untested (mutation survivor).
    const notes = [
      ...chord([60, 64, 67], 0, 1920), // bar 0: C major
      note(60, 1920, 480), // bar 1: single pc (C), three onsets
      note(60, 2400, 480),
      note(60, 2880, 960),
    ];
    const { filled } = analyze(notes, C_MAJ);
    const first = filled.bars[0].slots[0];
    const carried = filled.bars[1].slots[0];
    expect(first.isRest).toBe(false);
    expect(carried.isRest).toBe(false); // carry-over, NOT rest, NOT re-scored
    expect(carried.rootPc).toBe(first.rootPc);
    expect(carried.qualitySymbol).toBe(first.qualitySymbol);
    expect(carried.name).toBe(first.name);
    expect(carried.confidence).toBeCloseTo(first.confidence * HARMONY_WEIGHTS.carryOverFactor, 10);
    expect(carried.alternatives).toEqual([]);
  });

  it("single-pc FIRST region (no previous cell) -> rest", () => {
    const { filled } = analyze([note(60, 0, 1920)], C_MAJ);
    expect(filled.bars[0].slots[0].isRest).toBe(true);
  });
});

describe("inferChords - symmetric-set tie-break prefers root position", () => {
  it("Bm7b5 in A minor is NOT reported as Dm6/B (identical pc sets)", () => {
    // {B,D,F,A} == {D,F,A,B} as a pc set: halfdim-on-B and min6-on-D
    // score identically. v1's root-ascending tie-break handed the cell
    // to Dm6 with a slash bass (conf 1.00). The comparator must prefer
    // ROOT POSITION (bass == root) and demote the inversion reading to
    // alternatives.
    const A_MIN: KeyCandidate = { tonicPc: 9, mode: "minor", correlation: 1 };
    const { filled } = analyze(chord([59, 62, 65, 69], 0, 1920), A_MIN); // B3 D4 F4 A4
    const cell = filled.bars[0].slots[0];
    expect(cell.rootPc).toBe(11); // B
    expect(cell.qualitySymbol).toBe("halfdim");
    expect(cell.name).toBe("Bm7b5");
    expect(cell.bassPc).toBeNull(); // root position: no slash
    expect(cell.confidence).toBeGreaterThan(0.9);
    // the inversion reading survives as an alternative, slash-marked
    const dm6 = cell.alternatives.find((a) => a.rootPc === 2 && a.qualitySymbol === "min6");
    expect(dm6).toBeDefined();
    expect(dm6!.bassPc).toBe(11);
    expect(dm6!.name).toBe("Dm6/B");
  });

  it("C/E slash STILL works (root position not tied there)", () => {
    // reverse direction pin: with no exact-score rival, the inversion
    // reading must remain the chosen cell (existing E-bass test above
    // covers the same path; this guards the comparator order change).
    const { filled } = analyze(chord([52, 60, 67], 0, 1920), C_MAJ); // E3 C4 G4
    const cell = filled.bars[0].slots[0];
    expect(cell.rootPc).toBe(0);
    expect(cell.bassPc).toBe(4);
    expect(cell.name).toBe("C/E");
  });
});

describe("inferChords - split + rest + alternatives", () => {
  it("reinferBar at 2 slots recovers F then G in one bar", () => {
    const notes = [
      ...chord([53, 57, 60], 0, 960), // F (first half)
      ...chord([55, 59, 62], 960, 960), // G (second half)
    ];
    const p = proj(notes);
    const window: AnalysisWindow = { fromTick: 0, toTick: p.endTick };
    const grid = segmentGrid(p, window, 1);
    const cells = reinferBar(p, grid, 0, C_MAJ, 2);
    expect(cells.length).toBe(2);
    expect(cells[0].rootPc).toBe(5); // F
    expect(cells[1].rootPc).toBe(7); // G
  });

  it("a silent bar -> rest cell", () => {
    // A single note whose ONSET is in bar 0 but whose tail spans bar 1;
    // bar 1 has no onsets -> rest.
    const { filled } = analyze([note(60, 0, 3840)], C_MAJ);
    expect(filled.bars.length).toBe(2);
    expect(filled.bars[1].slots[0].isRest).toBe(true);
  });

  it("alternatives: top-3, confidence descending, empty nested", () => {
    const { filled } = analyze(chord([60, 64, 67], 0, 1920), C_MAJ);
    const cell = filled.bars[0].slots[0];
    expect(cell.alternatives.length).toBe(3);
    for (let i = 1; i < cell.alternatives.length; i++) {
      expect(cell.alternatives[i - 1].confidence).toBeGreaterThanOrEqual(cell.alternatives[i].confidence);
    }
    for (const alt of cell.alternatives) {
      expect(alt.alternatives).toEqual([]);
    }
  });
});
