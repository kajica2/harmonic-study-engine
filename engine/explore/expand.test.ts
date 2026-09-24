/**
 * engine/explore/expand.test.ts - PRD-001 Phase 5 (checklist 3).
 */

import { describe, it, expect } from "vitest";
import { buildCellFromSymbol } from "../compose/chordsym";
import { QUALITY_INTERVALS } from "../core/chords";
import type { ChordCell, KeyCandidate } from "../compose/types";
import { expandChord, isExtension, isAlteration } from "./expand";

const C_MAJOR: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 1 };

function cell(rootPc: number, qualitySymbol: string): ChordCell {
  return buildCellFromSymbol({ rootPc, qualitySymbol, bassPc: null }, C_MAJOR);
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function pcs(rootPc: number, quality: string): Set<number> {
  return new Set(
    (QUALITY_INTERVALS[quality] as readonly number[]).map((iv) =>
      mod12(rootPc + iv),
    ),
  );
}

describe("expandChord", () => {
  it("Cmaj7 -> {Cmaj9}", () => {
    const out = expandChord(cell(0, "maj7"), C_MAJOR);
    expect(out.map((c) => c.cell.name)).toEqual(["Cmaj9"]);
    expect(out[0]?.technique).toBe("extension");
    expect(out[0]?.conceptId).toBeNull();
  });

  it("Dm7 -> {Dm9}", () => {
    const out = expandChord(cell(2, "m7"), C_MAJOR);
    expect(out.map((c) => c.cell.name)).toEqual(["Dm9"]);
  });

  it("G7 -> {G9, G7alt} (extension + the single alteration)", () => {
    const out = expandChord(cell(7, "dom7"), C_MAJOR);
    expect(out.map((c) => c.cell.name)).toEqual(["G9", "G7alt"]);
    expect(out.map((c) => c.technique)).toEqual(["extension", "alteration"]);
    expect(isAlteration(cell(7, "dom7"), out[1]?.cell as ChordCell)).toBe(true);
  });

  it("triad Cmaj -> {Cmaj7, Cmaj9, C6, Cadd9}", () => {
    const out = expandChord(cell(0, "maj"), C_MAJOR);
    expect(out.map((c) => c.cell.name)).toEqual([
      "Cmaj7",
      "Cmaj9",
      "C6",
      "Cadd9",
    ]);
  });

  it("dim7 / sus4 honestly empty", () => {
    expect(expandChord(cell(0, "dim7"), C_MAJOR)).toEqual([]);
    expect(expandChord(cell(5, "sus4"), C_MAJOR)).toEqual([]);
  });

  it("every emission is a true mod12 superset with the same root", () => {
    const quals = ["maj", "min", "m7", "maj7", "dom7"];
    for (const q of quals) {
      const orig = cell(0, q);
      const origPcs = pcs(0, q);
      for (const c of expandChord(orig, C_MAJOR)) {
        expect(c.cell.rootPc).toBe(0);
        expect(isExtension(orig, c.cell)).toBe(true);
        const candPcs = pcs(0, c.cell.qualitySymbol);
        for (const p of origPcs) expect(candPcs.has(p)).toBe(true);
        expect(candPcs.size).toBeGreaterThan(origPcs.size);
      }
    }
  });
});
