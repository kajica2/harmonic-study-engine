import { describe, it, expect } from "vitest";
import { checkSpeciesOne } from "./counterpointRules";

describe("checkSpeciesOne", () => {
  it("flags parallel fifths between consecutive bars", () => {
    const v = checkSpeciesOne({
      melody: [60, 62],
      counterline: [67, 69], // C→D in both voices; both arrive on P5 (C-G, D-A)
      barIndex: 0,
    });
    expect(v.some((x) => x.type === "parallel_fifth")).toBe(true);
  });

  it("flags parallel octaves between consecutive bars", () => {
    const v = checkSpeciesOne({
      melody: [60, 62],
      counterline: [72, 74], // both voices move up 2 st, arriving on P8 (C-C, D-D)
      barIndex: 0,
    });
    expect(v.some((x) => x.type === "parallel_octave")).toBe(true);
  });

  it("does NOT flag contrary motion into a perfect consonance", () => {
    const v = checkSpeciesOne({
      melody: [60, 62],   // top moves up 2
      counterline: [60, 57], // bottom moves down 3 → arrives on P5 (D-G)
      barIndex: 0,
    });
    expect(v).toEqual([]);
  });

  it("does NOT flag oblique motion into a perfect consonance", () => {
    const v = checkSpeciesOne({
      melody: [60, 60],   // top stays
      counterline: [60, 67], // bottom moves up 7 → unison → P5
      barIndex: 0,
    });
    // Oblique motion into a unison→P5 should be allowed under species 1.
    expect(v).toEqual([]);
  });

  it("returns empty for melodies shorter than 2 notes", () => {
    expect(checkSpeciesOne({ melody: [60], counterline: [67], barIndex: 0 })).toEqual([]);
    expect(checkSpeciesOne({ melody: [], counterline: [], barIndex: 0 })).toEqual([]);
  });

  it("barIndex is reported correctly in violations", () => {
    const v = checkSpeciesOne({
      melody: [60, 62, 64, 66],
      counterline: [67, 69, 71, 73], // 4 parallel fifths
      barIndex: 10,
    });
    expect(v.length).toBeGreaterThanOrEqual(3);
    expect(v[0].barIndex).toBe(10);
    expect(v[1].barIndex).toBe(11);
  });

  it("throws when melody and counterline lengths differ", () => {
    expect(() =>
      checkSpeciesOne({ melody: [60, 62, 64], counterline: [67, 69], barIndex: 0 }),
    ).toThrow(/equal length/);
  });

  it("accepts stepwise into a third (imperfect consonance)", () => {
    const v = checkSpeciesOne({
      melody: [60, 62],
      counterline: [64, 67], // C-E → D-F (parallel thirds, allowed)
      barIndex: 0,
    });
    expect(v).toEqual([]);
  });
});
