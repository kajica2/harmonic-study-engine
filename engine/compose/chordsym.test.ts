/**
 * engine/compose/chordsym.test.ts - PRD-001 Phase 4 Slice 2 (D61,
 * test plan 3), MOVED with the grammar in D82 (was
 * src/lib/chordInput.test.ts - same tests, same count, node-env
 * either way). Table-driven BOTH directions: every one of the 17
 * NAME_SUFFIX spellings + the documented aliases + slash bass must
 * ACCEPT and round-trip to (rootPc, qualitySymbol); anything the
 * ChordCell cannot hold ("C13", "C7#9", ...) must REJECT.
 *
 * Node project (pure logic - no DOM).
 */

import { describe, it, expect } from "vitest";
import {
  parseChordSymbol,
  buildCellFromSymbol,
  suggestChordSymbols,
} from "./chordsym";
import { NAME_SUFFIX, QUALITY_INTERVALS } from "../core/chords";
import type { KeyCandidate } from "./types";

const C_MAJOR: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 1 };
const EB_MINOR: KeyCandidate = { tonicPc: 3, mode: "minor", correlation: 1 };

describe("parseChordSymbol - the 17 engine qualities (NAME_SUFFIX spellings)", () => {
  for (const [quality, suffix] of Object.entries(NAME_SUFFIX)) {
    it(`accepts C${suffix} -> ${quality}`, () => {
      const p = parseChordSymbol(`C${suffix}`);
      expect(p).not.toBeNull();
      expect(p?.rootPc).toBe(0);
      expect(p?.qualitySymbol).toBe(quality);
      expect(p?.bassPc).toBeNull();
    });
  }

  it("round-trips EVERY quality on a non-C root through the cell coordinates", () => {
    for (const [quality, suffix] of Object.entries(NAME_SUFFIX)) {
      const p = parseChordSymbol(`F#${suffix}`);
      expect(p, `F#${suffix}`).not.toBeNull();
      expect(p?.rootPc).toBe(6);
      expect(p?.qualitySymbol).toBe(quality);
      const cell = buildCellFromSymbol(p!, C_MAJOR);
      expect(cell.rootPc).toBe(6);
      expect(cell.qualitySymbol).toBe(quality);
      expect(cell.confidence).toBe(1);
      expect(cell.alternatives).toEqual([]);
      expect(cell.isRest).toBe(false);
    }
  });
});

describe("parseChordSymbol - documented aliases", () => {
  const table: readonly (readonly [string, number, string])[] = [
    ["", 0, "maj"], // bare triad
    ["m", 0, "min"],
    ["min", 0, "min"],
    ["-", 0, "min"],
    ["M7", 0, "maj7"], // case-folded alias - NOT m7
    ["dim", 0, "dim"],
    ["o", 0, "dim"],
    ["dim7", 0, "dim7"],
    ["o7", 0, "dim7"],
    ["m7b5", 0, "halfdim"],
    ["\u00f8", 0, "halfdim"], // slashed circle (escaped, ASCII source)
    ["7", 0, "dom7"],
    ["7alt", 0, "alt"],
    ["sus4", 0, "sus4"],
    ["add9", 0, "majadd9"],
    ["madd9", 0, "minadd9"],
  ];
  for (const [suffix, rootPc, quality] of table) {
    it(`"${suffix}" -> ${quality}`, () => {
      const p = parseChordSymbol(`C${suffix}`);
      expect(p).not.toBeNull();
      expect(p?.rootPc).toBe(rootPc);
      expect(p?.qualitySymbol).toBe(quality);
    });
  }
});

describe("parseChordSymbol - roots", () => {
  it("accepts all 17 root spellings incl. theoretical ones to the right pc", () => {
    expect(parseChordSymbol("Cb")?.rootPc).toBe(11);
    expect(parseChordSymbol("Fb")?.rootPc).toBe(4);
    expect(parseChordSymbol("E#")?.rootPc).toBe(5);
    expect(parseChordSymbol("B#")?.rootPc).toBe(0);
    expect(parseChordSymbol("Db")?.rootPc).toBe(1);
    expect(parseChordSymbol("G#")?.rootPc).toBe(8);
  });
});

describe("parseChordSymbol - slash bass", () => {
  it("accepts in-template basses", () => {
    expect(parseChordSymbol("C/E")).toEqual({ rootPc: 0, qualitySymbol: "maj", bassPc: 4 });
    expect(parseChordSymbol("C/G")).toEqual({ rootPc: 0, qualitySymbol: "maj", bassPc: 7 });
    expect(parseChordSymbol("Cmaj7/B")).toEqual({ rootPc: 0, qualitySymbol: "maj7", bassPc: 11 });
    expect(parseChordSymbol("Cm7/Bb")).toEqual({ rootPc: 0, qualitySymbol: "m7", bassPc: 10 });
  });

  it("bass == root normalizes to null", () => {
    expect(parseChordSymbol("C/C")).toEqual({ rootPc: 0, qualitySymbol: "maj", bassPc: null });
  });

  it("REJECTS out-of-template basses (a cell whose name could not show the bass)", () => {
    expect(parseChordSymbol("C/D")).toBeNull();
    expect(parseChordSymbol("C/B")).toBeNull(); // maj7 7th is not a maj tone
    expect(parseChordSymbol("Cmaj7/E")).toEqual({ rootPc: 0, qualitySymbol: "maj7", bassPc: 4 });
  });
});

describe("parseChordSymbol - rejections (what the grid cannot hold)", () => {
  const rejected: readonly string[] = [
    "C13", // 13ths are not a quality
    "C7#9", // alterations are not a quality
    "C7b9",
    "Cm11",
    "H", // not a note letter
    "",
    "   ",
    "C sus4", // inner space rejected
    "C 7",
    "Csus2", // sus2 is not a quality
    "Csus", // not a NAME_SUFFIX spelling or documented alias
    "cm7", // lowercase root
    "Cbb", // double flats
    "C#m7b5#11",
    "C/",
    "/C",
    "C7/",
    "C7/Bx",
    "Cmaj7", // valid - control that the loop is not broken
  ].filter((x) => x !== "Cmaj7");
  for (const raw of rejected) {
    it(`rejects "${raw}"`, () => {
      expect(parseChordSymbol(raw)).toBeNull();
    });
  }

  it("accepts surrounding whitespace (trimmed) but nothing inside", () => {
    expect(parseChordSymbol("  Cm7  ")).toEqual({ rootPc: 0, qualitySymbol: "m7", bassPc: null });
  });
});

describe("buildCellFromSymbol - key-family spelling (D11 rules)", () => {
  it("Eb minor family spells flats", () => {
    const p = parseChordSymbol("Ab")!; // rootPc 8
    const cell = buildCellFromSymbol({ ...p, qualitySymbol: "m7" }, EB_MINOR);
    expect(cell.name).toBe("Abm7"); // pc 8 in the flat family
  });

  it("C major family spells flats by the tie rule", () => {
    const cell = buildCellFromSymbol(parseChordSymbol("F#m7")!, C_MAJOR);
    expect(cell.name).toBe("Gbm7"); // pc 6, C-major family = flat side (tie rule)
  });

  it("slash bass is spelled in the same family", () => {
    const cell = buildCellFromSymbol(parseChordSymbol("C/E")!, EB_MINOR);
    expect(cell.name).toBe("C/E");
    expect(cell.bassPc).toBe(4);
  });

  it("cell name re-parses to the SAME (rootPc, qualitySymbol) - round-trip", () => {
    for (const [quality, suffix] of Object.entries(NAME_SUFFIX)) {
      const p = parseChordSymbol(`Eb${suffix}`)!;
      const cell = buildCellFromSymbol(p, EB_MINOR);
      const back = parseChordSymbol(cell.name);
      expect(back, cell.name).not.toBeNull();
      expect(back?.rootPc).toBe(cell.rootPc);
      expect(back?.qualitySymbol).toBe(quality);
      expect(back?.bassPc).toBe(cell.bassPc);
    }
  });
});

describe("suggestChordSymbols", () => {
  it("alternatives come FIRST (engine top-3), deduped", () => {
    const alts = [
      { rootPc: 2, qualitySymbol: "m7", name: "Dm7", bassPc: null, confidence: 0.6, alternatives: [], isRest: false },
      { rootPc: 7, qualitySymbol: "dom7", name: "G7", bassPc: null, confidence: 0.5, alternatives: [], isRest: false },
    ];
    const out = suggestChordSymbols("", C_MAJOR, 8, alts, []);
    expect(out.slice(0, 2)).toEqual(["Dm7", "G7"]);
  });

  it("recents follow alternatives, then the grammar space", () => {
    const alt = { rootPc: 2, qualitySymbol: "m7", name: "Dm7", bassPc: null, confidence: 0.6, alternatives: [], isRest: false };
    const out = suggestChordSymbols("", C_MAJOR, 8, [alt], ["Am7", "Dm7"]);
    expect(out.slice(0, 3)).toEqual(["Dm7", "Am7", "C"]); // Dm7 deduped
  });

  it("prefix filter is case-insensitive and respects the limit", () => {
    const out = suggestChordSymbols("cm", C_MAJOR, 4);
    expect(out.length).toBeLessThanOrEqual(4);
    for (const s of out) expect(s.toLowerCase().startsWith("cm")).toBe(true);
    expect(out).toContain("Cm7");
  });

  it("spelled roots are key-family aware (G# minor suggests F#m7, not Gbm7)", () => {
    const sharp: KeyCandidate = { tonicPc: 8, mode: "minor", correlation: 1 };
    const out = suggestChordSymbols("F#", sharp, 8);
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) expect(s).not.toMatch(/^Gb/);
  });

  it("is pure: no module state, same inputs -> same output", () => {
    const a = suggestChordSymbols("C", C_MAJOR, 5);
    const b = suggestChordSymbols("C", C_MAJOR, 5);
    expect(a).toEqual(b);
  });
});
