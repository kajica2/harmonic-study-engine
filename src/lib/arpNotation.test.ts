/**
 * src/lib/arpNotation.test.ts - PIN-001 for the pure arpeggiation math.
 * Node project (no DOM, no abcjs).
 */

import { describe, it, expect } from "vitest";
import {
  arpNoteSequence,
  arpDurationTokens,
  ABC_TRIPLET_PREFIX,
  TRIPLET_GROUP_SIZE,
  type ArpStyle,
} from "./arpNotation";

const TRIAD = [60, 64, 67];
const SEVENTH = [60, 64, 67, 71];
const PENTATONIC = [60, 62, 64, 67, 69];

describe("arpNoteSequence quarters (legacy, frozen)", () => {
  it("takes the first 4 notes of a 4-note chord", () => {
    expect(arpNoteSequence(SEVENTH, "quarters")).toEqual(SEVENTH);
  });

  it("takes the first 4 notes of a 5-note chord (no repetition)", () => {
    expect(arpNoteSequence(PENTATONIC, "quarters")).toEqual([60, 62, 64, 67]);
  });

  it("takes all notes of a 3-note chord (no repetition)", () => {
    expect(arpNoteSequence(TRIAD, "quarters")).toEqual(TRIAD);
  });

  it("honors beatsPerBar", () => {
    expect(arpNoteSequence(SEVENTH, "quarters", 3)).toEqual([60, 64, 67]);
    expect(arpNoteSequence(SEVENTH, "quarters", 2)).toEqual([60, 64]);
  });

  it("returns empty for an empty note list", () => {
    expect(arpNoteSequence([], "quarters")).toEqual([]);
  });
});

describe("arpNoteSequence eighths", () => {
  it("fills 8 slots with 2 passes of a 4-note chord", () => {
    expect(arpNoteSequence(SEVENTH, "eighths")).toEqual([
      60, 64, 67, 71, 60, 64, 67, 71,
    ]);
  });

  it("fills 8 slots with 2 full passes plus 2 notes of the 3rd pass for a 3-note chord", () => {
    expect(arpNoteSequence(TRIAD, "eighths")).toEqual([
      60, 64, 67, 60, 64, 67, 60, 64,
    ]);
  });

  it("fills 8 slots with 1 full pass plus 3 notes of the 2nd pass for a 5-note chord", () => {
    expect(arpNoteSequence(PENTATONIC, "eighths")).toEqual([
      60, 62, 64, 67, 69, 60, 62, 64,
    ]);
  });

  it("honors beatsPerBar (6 slots at 3 beats)", () => {
    expect(arpNoteSequence(SEVENTH, "eighths", 3)).toEqual([
      60, 64, 67, 71, 60, 64,
    ]);
  });

  it("returns empty for an empty note list", () => {
    expect(arpNoteSequence([], "eighths")).toEqual([]);
  });
});

describe("arpNoteSequence triplets", () => {
  it("fills 12 slots with 3 passes of a 4-note chord", () => {
    expect(arpNoteSequence(SEVENTH, "triplets")).toEqual([
      60, 64, 67, 71, 60, 64, 67, 71, 60, 64, 67, 71,
    ]);
  });

  it("fills 12 slots with 4 full passes of a 3-note chord", () => {
    expect(arpNoteSequence(TRIAD, "triplets")).toEqual([
      60, 64, 67, 60, 64, 67, 60, 64, 67, 60, 64, 67,
    ]);
  });

  it("fills 12 slots with 2 full passes plus 2 notes of the 3rd pass for a 5-note chord", () => {
    expect(arpNoteSequence(PENTATONIC, "triplets")).toEqual([
      60, 62, 64, 67, 69, 60, 62, 64, 67, 69, 60, 62,
    ]);
  });

  it("honors beatsPerBar (9 slots at 3 beats)", () => {
    expect(arpNoteSequence(SEVENTH, "triplets", 3)).toEqual([
      60, 64, 67, 71, 60, 64, 67, 71, 60,
    ]);
  });

  it("returns empty for an empty note list", () => {
    expect(arpNoteSequence([], "triplets")).toEqual([]);
  });
});

describe("arpDurationTokens", () => {
  it("quarters: 4 quarter notes", () => {
    expect(arpDurationTokens("quarters")).toEqual({ duration: "4", count: 4 });
  });

  it("eighths: 8 eighth notes", () => {
    expect(arpDurationTokens("eighths")).toEqual({ duration: "8", count: 8 });
  });

  it("triplets: 12 triplet eighths", () => {
    expect(arpDurationTokens("triplets")).toEqual({ duration: "8", count: 12 });
  });

  it("every style sums to exactly 4 beats in 4/4", () => {
    const beatsPerBar = 4;
    for (const style of ["quarters", "eighths", "triplets"] as ArpStyle[]) {
      const { duration, count } = arpDurationTokens(style);
      // Quarter = 1 beat, eighth = 1/2 beat, triplet eighth = 1/3 beat.
      const noteBeats =
        count * (duration === "4" ? 1 : style === "triplets" ? 1 / 3 : 0.5);
      expect(noteBeats).toBeCloseTo(beatsPerBar, 9);
    }
  });
});

describe("triplet ABC syntax", () => {
  it("uses the abcjs (3 tuplet prefix with 3 notes per group", () => {
    expect(ABC_TRIPLET_PREFIX).toBe("(3");
    expect(TRIPLET_GROUP_SIZE).toBe(3);
  });

  it("12 triplet notes form 4 complete (3 groups", () => {
    const seq = arpNoteSequence(SEVENTH, "triplets");
    expect(seq.length).toBe(12);
    const groups = seq.filter((_, i) => i % TRIPLET_GROUP_SIZE === 0).length;
    expect(groups).toBe(4);
  });
});