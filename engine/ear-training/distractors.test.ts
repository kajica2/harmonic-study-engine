/**
 * engine/ear-training/distractors.test.ts - PRD-001 Phase 6 (checklist 3).
 *
 * Same-pool 4-option shape; ENHARMONIC FILTER pin; short-pool
 * recycle never emits the answer pc; shuffle copy-identity.
 */

import { describe, it, expect } from "vitest";
import { createRng } from "../core/rng";
import { distractorsFor, pitchClassOfToken } from "./distractors";

describe("pitchClassOfToken table (D113)", () => {
  it("pins Cb==B, Fb==E, B#==C, E#==F", () => {
    expect(pitchClassOfToken("B")).toBe(11);
    expect(pitchClassOfToken("Cb")).toBe(11);
    expect(pitchClassOfToken("E")).toBe(4);
    expect(pitchClassOfToken("Fb")).toBe(4);
    expect(pitchClassOfToken("C")).toBe(0);
    expect(pitchClassOfToken("B#")).toBe(0);
    expect(pitchClassOfToken("F")).toBe(5);
    expect(pitchClassOfToken("E#")).toBe(5);
  });

  it("pins double-sharp/flat pairs", () => {
    expect(pitchClassOfToken("A##")).toBe(11);
    expect(pitchClassOfToken("D##")).toBe(4);
    expect(pitchClassOfToken("Dbb")).toBe(0);
    expect(pitchClassOfToken("Gbb")).toBe(5);
    expect(pitchClassOfToken("C#")).toBe(1);
    expect(pitchClassOfToken("Db")).toBe(1);
  });

  it("returns null for unparseable tokens", () => {
    expect(pitchClassOfToken("")).toBeNull();
    expect(pitchClassOfToken("maj7")).toBeNull();
    expect(pitchClassOfToken("ii-V-I")).toBeNull();
    expect(pitchClassOfToken("H#")).toBeNull();
  });
});

describe("distractorsFor shape + enharmonic filter", () => {
  it("returns exactly count items from the same pool", () => {
    const rng = createRng(1);
    const pool = ["P5", "P4", "M3", "m3", "M2", "m7"];
    const out = distractorsFor("P5", pool, rng, 3);
    expect(out).toHaveLength(3);
    for (const d of out) expect(pool).toContain(d);
    expect(out).not.toContain("P5");
  });

  it("ENHARMONIC FILTER: Bb never distracts A# (same pc excluded)", () => {
    const rng = createRng(2);
    const pool = ["A#", "Bb", "C", "D", "E"];
    const out = distractorsFor("A#", pool, rng, 3);
    expect(out).not.toContain("Bb");
    expect(out).not.toContain("A#");
  });

  it("ENHARMONIC FILTER: Cb never distracts B; E# never distracts F", () => {
    const rng = createRng(3);
    expect(distractorsFor("B", ["B", "Cb", "C", "D"], rng, 2)).not.toContain("Cb");
    const rng2 = createRng(4);
    expect(distractorsFor("F", ["F", "E#", "G", "A"], rng2, 2)).not.toContain("E#");
  });

  it("short-pool recycle never emits the answer pc", () => {
    const rng = createRng(5);
    const out = distractorsFor("C", ["C", "G"], rng, 3);
    expect(out).toHaveLength(3);
    for (const d of out) {
      const pc = pitchClassOfToken(d.split(" ")[0]);
      // Recycled items carry an 8va suffix; the base pc still differs.
      if (pc !== null) expect(pc).not.toBe(0);
    }
  });

  it("shuffle copy-identity: input pool untouched", () => {
    const rng = createRng(6);
    const pool = ["a", "b", "c", "d", "e"];
    const copy = [...pool];
    distractorsFor("a", pool, rng, 3);
    expect(pool).toEqual(copy);
  });

  it("throws RangeError on empty pool (programmer error)", () => {
    expect(() => distractorsFor("C", [], createRng(1), 3)).toThrow(RangeError);
  });
});
