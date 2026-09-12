/**
 * Tests for sliceBarForRepeat + slicePathForRepeat.
 *
 * Pin:
 *  - Bar with 4 steps → 4 BeatCells, one per beat, notes match
 *  - Bar with fewer than 4 steps → padded with the last step
 *  - Bar with zero steps → 4 empty cells (graceful empty)
 *  - barIndex out of range → 4 empty cells (graceful empty)
 *  - Notes arrays are copied (mutating the cell doesn't mutate source)
 *  - beat index runs 0..3 monotonically
 *  - slicePathForRepeat returns ceil(steps.length / 4) bars
 */
import { describe, it, expect } from "vitest";
import { sliceBarForRepeat, slicePathForRepeat } from "./sliceAndRepeat";
import type { HarmonicStep } from "./paths";

const mkStep = (name: string, notes: number[]): HarmonicStep => ({
  name,
  notes,
  descriptions: "",
});

describe("sliceBarForRepeat", () => {
  it("returns 4 BeatCells from a full bar of 4 steps", () => {
    const steps = [
      mkStep("Cmaj7", [60, 64, 67, 71]),
      mkStep("Cmaj7", [60, 64, 67, 71]),
      mkStep("Cmaj7", [60, 64, 67, 71]),
      mkStep("G7", [67, 71, 74, 77]),
    ];
    const cells = sliceBarForRepeat(steps, 0);
    expect(cells).toHaveLength(4);
    expect(cells[0]).toEqual({ beat: 0, notes: [60, 64, 67, 71], chordName: "Cmaj7" });
    expect(cells[3]).toEqual({ beat: 3, notes: [67, 71, 74, 77], chordName: "G7" });
  });

  it("pads a bar with 1 step to 4 cells using the last step", () => {
    const steps = [mkStep("Fm7", [65, 68, 72, 75])];
    const cells = sliceBarForRepeat(steps, 0);
    expect(cells).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      expect(cells[i].beat).toBe(i);
      expect(cells[i].notes).toEqual([65, 68, 72, 75]);
      expect(cells[i].chordName).toBe("Fm7");
    }
  });

  it("pads a bar with 3 steps using the 3rd step", () => {
    const steps = [
      mkStep("A", [69]),
      mkStep("B", [71]),
      mkStep("C", [72]),
    ];
    const cells = sliceBarForRepeat(steps, 0);
    expect(cells).toHaveLength(4);
    expect(cells[0].chordName).toBe("A");
    expect(cells[1].chordName).toBe("B");
    expect(cells[2].chordName).toBe("C");
    expect(cells[3].chordName).toBe("C"); // padded
  });

  it("returns 4 empty cells when given an empty steps array", () => {
    const cells = sliceBarForRepeat([], 0);
    expect(cells).toHaveLength(4);
    for (const c of cells) {
      expect(c.notes).toEqual([]);
      expect(c.chordName).toBe("");
    }
  });

  it("returns 4 empty cells when barIndex is past the end", () => {
    const steps = [mkStep("X", [60])];
    const cells = sliceBarForRepeat(steps, 5);
    expect(cells).toHaveLength(4);
    expect(cells[0].notes).toEqual([]);
  });

  it("returns the right bar when barIndex=1 (steps 4..7)", () => {
    const steps = [
      mkStep("a", [60]),
      mkStep("b", [62]),
      mkStep("c", [64]),
      mkStep("d", [65]),
      mkStep("e", [67]),
      mkStep("f", [69]),
      mkStep("g", [71]),
      mkStep("h", [72]),
    ];
    const cells = sliceBarForRepeat(steps, 1);
    expect(cells.map((c) => c.chordName)).toEqual(["e", "f", "g", "h"]);
  });

  it("copies the notes array (mutation doesn't affect source)", () => {
    const steps = [mkStep("C", [60, 64])];
    const cells = sliceBarForRepeat(steps, 0);
    cells[0].notes.push(99);
    expect(steps[0].notes).toEqual([60, 64]);
  });

  it("beat indices run 0..3 monotonically", () => {
    const cells = sliceBarForRepeat(
      [mkStep("A", [60]), mkStep("B", [62]), mkStep("C", [64]), mkStep("D", [65])],
      0,
    );
    expect(cells.map((c) => c.beat)).toEqual([0, 1, 2, 3]);
  });
});

describe("slicePathForRepeat", () => {
  it("returns ceil(steps.length / 4) bars", () => {
    // 10 steps = 3 bars (4+4+2)
    const steps = Array.from({ length: 10 }, (_, i) =>
      mkStep(`S${i}`, [60 + i]),
    );
    const bars = slicePathForRepeat(steps);
    expect(bars).toHaveLength(3);
    expect(bars[0]).toHaveLength(4);
    expect(bars[1]).toHaveLength(4);
    expect(bars[2]).toHaveLength(4); // padded
  });

  it("returns an empty array for an empty path", () => {
    expect(slicePathForRepeat([])).toEqual([]);
  });

  it("returns one bar for a single bar (4 steps)", () => {
    const steps = [
      mkStep("A", [60]),
      mkStep("B", [62]),
      mkStep("C", [64]),
      mkStep("D", [65]),
    ];
    const bars = slicePathForRepeat(steps);
    expect(bars).toHaveLength(1);
    expect(bars[0].map((c) => c.chordName)).toEqual(["A", "B", "C", "D"]);
  });
});