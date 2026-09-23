/**
 * engine/compose/types.test.ts - PRD-001 Phase 4 Slice 1 (test plan 10).
 *
 * Pins the S2-facing pure helpers that live in types.ts: the
 * confidenceTier boundary table (REQ-COMP-22), mergeAnalysis purity
 * (input frozen, D49), and the EMPTY_OVERRIDES identity round-trip.
 */

import { describe, it, expect } from "vitest";
import {
  confidenceTier,
  mergeAnalysis,
  EMPTY_OVERRIDES,
  restCell,
} from "./types";
import type {
  AnalysisOverrides,
  ChordCell,
  ComposeAnalysis,
  KeyCandidate,
} from "./types";

function cell(rootPc: number, qualitySymbol: string, name: string, confidence: number): ChordCell {
  return { rootPc, qualitySymbol, name, bassPc: null, confidence, alternatives: [], isRest: false };
}

function sampleAnalysis(): ComposeAnalysis {
  return {
    version: 1,
    roles: [
      { trackIndex: 0, role: "melody", confidence: 0.9 },
      { trackIndex: 1, role: "harmony", confidence: 0.6 },
    ],
    key: {
      candidates: [
        { tonicPc: 0, mode: "major", correlation: 0.95 },
        { tonicPc: 7, mode: "major", correlation: 0.4 },
        { tonicPc: 9, mode: "minor", correlation: 0.3 },
      ],
      declared: null,
      chromaticFallback: false,
    },
    melody: { sourceTrackIndex: 0, synthesized: false, notes: [] },
    grid: {
      slotsPerBar: 1,
      bars: [
        { bar: 0, startTick: 0, endTick: 1920, slots: [cell(0, "maj", "C", 0.9)] },
        { bar: 1, startTick: 1920, endTick: 3840, slots: [cell(7, "dom7", "G7", 0.7)] },
      ],
    },
    window: { fromTick: 0, toTick: 3840 },
    truncated: false,
    percussionOnly: false,
    annotations: [],
  };
}

function deepFreeze<T>(x: T): T {
  if (x && typeof x === "object") {
    for (const v of Object.values(x as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(x);
  }
  return x;
}

describe("confidenceTier (REQ-COMP-22 boundaries)", () => {
  const table: readonly (readonly [number, string])[] = [
    [1, "auto"],
    [0.81, "auto"],
    [0.8, "highlight"], // boundary: NOT > 0.80
    [0.5, "highlight"], // boundary: >= 0.50
    [0.49, "radio"],
    [0.3, "radio"], // boundary: >= 0.30
    [0.29, "manual"],
    [0, "manual"],
  ];
  for (const [c, want] of table) {
    it(`${c} -> ${want}`, () => {
      expect(confidenceTier(c)).toBe(want);
    });
  }
});

describe("restCell", () => {
  it("is a silent, zero-confidence, empty-alternatives cell", () => {
    const r = restCell();
    expect(r.isRest).toBe(true);
    expect(r.confidence).toBe(0);
    expect(r.alternatives).toEqual([]);
    expect(r.name).toBe("");
  });
});

describe("mergeAnalysis purity (D49)", () => {
  it("never mutates a frozen input analysis", () => {
    const a = deepFreeze(sampleAnalysis());
    const before = JSON.stringify(a);
    const overrides: AnalysisOverrides = {
      key: { tonicPc: 9, mode: "minor", correlation: 0 } as KeyCandidate,
      tempoBpm: 120,
      timeSignature: [3, 4],
      melodyTrackIndex: 1,
      chordCells: { "0:0": null, "1:0": cell(5, "maj", "F", 1) },
      roles: { "0": "bass" },
    };
    const merged = mergeAnalysis(a, overrides);
    expect(JSON.stringify(a)).toBe(before); // input untouched
    expect(merged).not.toBe(a); // fresh object
  });

  it("applies key / roles / chordCells / melody overrides", () => {
    const a = sampleAnalysis();
    const merged = mergeAnalysis(a, {
      ...EMPTY_OVERRIDES,
      key: { tonicPc: 9, mode: "minor", correlation: 0.2 },
      roles: { "0": "bass" },
      melodyTrackIndex: 1,
      chordCells: { "0:0": null },
    });
    // key override becomes the default selection (candidates[0]).
    expect(merged.key.candidates[0]).toEqual({ tonicPc: 9, mode: "minor", correlation: 0.2 });
    // role override is authoritative (confidence -> 1).
    expect(merged.roles[0].role).toBe("bass");
    expect(merged.roles[0].confidence).toBe(1);
    // untouched role preserved.
    expect(merged.roles[1].role).toBe("harmony");
    // melody selection reflected.
    expect(merged.melody.sourceTrackIndex).toBe(1);
    expect(merged.melody.synthesized).toBe(false);
    // chord cell 0:0 -> rest; 1:0 untouched.
    expect(merged.grid.bars[0].slots[0].isRest).toBe(true);
    expect(merged.grid.bars[1].slots[0].name).toBe("G7");
  });

  it("leaves grid/roles identity when there is nothing to patch", () => {
    const a = sampleAnalysis();
    const merged = mergeAnalysis(a, EMPTY_OVERRIDES);
    expect(merged.grid).toBe(a.grid);
    expect(merged.roles).toBe(a.roles);
  });
});

describe("EMPTY_OVERRIDES round-trip", () => {
  it("merging with EMPTY_OVERRIDES reproduces the analysis deep-equal", () => {
    const a = sampleAnalysis();
    expect(mergeAnalysis(a, EMPTY_OVERRIDES)).toEqual(a);
  });

  it("is frozen (immutable default)", () => {
    expect(Object.isFrozen(EMPTY_OVERRIDES)).toBe(true);
    expect(Object.isFrozen(EMPTY_OVERRIDES.chordCells)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PRD-001 Phase 4 Slice 2 (D60): mergeGrid APPENDS out-of-range slot
// patches - the REQ-COMP-23 split-bar flow must be satisfiable through
// the merge. In-range behavior stays byte-identical (regression pins).
// ---------------------------------------------------------------------------

describe("mergeGrid slot append (D60)", () => {
  /** 2-bar, 1-slot grid: bar0 = C, bar1 = G7. */
  function singleSlotAnalysis(): ComposeAnalysis {
    return {
      ...sampleAnalysis(),
      grid: {
        slotsPerBar: 1,
        bars: [
          { bar: 0, startTick: 0, endTick: 1920, slots: [cell(0, "maj", "C", 0.9)] },
          { bar: 1, startTick: 1920, endTick: 3840, slots: [cell(7, "dom7", "G7", 0.7)] },
        ],
      },
    };
  }

  it("split flow end-to-end at the merge level: write 'b:0' + 'b:1' -> bar b has 2 cells", () => {
    const a = singleSlotAnalysis();
    const split0 = cell(0, "maj", "C", 1);
    const split1 = cell(7, "dom7", "G7", 1);
    const merged = mergeAnalysis(a, {
      ...EMPTY_OVERRIDES,
      chordCells: { "0:0": split0, "0:1": split1 },
    });
    expect(merged.grid.bars[0].slots.length).toBe(2);
    expect(merged.grid.bars[0].slots[0]).toEqual(split0);
    expect(merged.grid.bars[0].slots[1]).toEqual(split1);
    // Untouched bar keeps its single slot.
    expect(merged.grid.bars[1].slots.length).toBe(1);
    // slotsPerBar stays the NOMINAL default (renderers read per-bar).
    expect(merged.grid.slotsPerBar).toBe(1);
  });

  it("out-of-range patch on an unsplit bar appends", () => {
    const a = singleSlotAnalysis();
    const extra = cell(5, "maj", "F", 1);
    const merged = mergeAnalysis(a, { ...EMPTY_OVERRIDES, chordCells: { "1:1": extra } });
    expect(merged.grid.bars[1].slots.length).toBe(2);
    expect(merged.grid.bars[1].slots[0].name).toBe("G7"); // original survives
    expect(merged.grid.bars[1].slots[1]).toEqual(extra);
  });

  it("multiple out-of-range slots land ascending with gap fill = restCell()", () => {
    const a = singleSlotAnalysis();
    const at3 = cell(10, "min", "Bm", 1);
    const at2 = cell(2, "min", "Dm", 1);
    const merged = mergeAnalysis(a, {
      ...EMPTY_OVERRIDES,
      chordCells: { "0:3": at3, "0:2": at2 }, // insertion order reversed on purpose
    });
    const slots = merged.grid.bars[0].slots;
    expect(slots.length).toBe(4);
    expect(slots[0].name).toBe("C"); // in-range original
    expect(slots[1].isRest).toBe(true); // gap filled
    expect(slots[2]).toEqual(at2); // ascending by slot index
    expect(slots[3]).toEqual(at3);
  });

  it("IN-RANGE behavior is byte-identical (regression: no length change, no reordering)", () => {
    const a = singleSlotAnalysis();
    const patch = { "0:0": cell(5, "maj", "F", 1) };
    const merged = mergeAnalysis(a, { ...EMPTY_OVERRIDES, chordCells: patch });
    expect(merged.grid.bars[0].slots.length).toBe(1);
    expect(merged.grid.bars[0].slots[0].name).toBe("F");
    expect(merged.grid.bars[1].slots.length).toBe(1);
    expect(merged.grid.bars[1].slots[0].name).toBe("G7");
  });

  it("null out-of-range patch appends a rest; frozen input never mutates", () => {
    const a = deepFreeze(singleSlotAnalysis());
    const before = JSON.stringify(a);
    const merged = mergeAnalysis(a, { ...EMPTY_OVERRIDES, chordCells: { "0:1": null } });
    expect(JSON.stringify(a)).toBe(before);
    expect(merged.grid.bars[0].slots.length).toBe(2);
    expect(merged.grid.bars[0].slots[1].isRest).toBe(true);
  });

  it("patches for bars the grid does not contain stay dropped (no phantom bars)", () => {
    const a = singleSlotAnalysis();
    const merged = mergeAnalysis(a, {
      ...EMPTY_OVERRIDES,
      chordCells: { "9:0": cell(0, "maj", "C", 1) },
    });
    expect(merged.grid.bars.length).toBe(2);
  });
});
