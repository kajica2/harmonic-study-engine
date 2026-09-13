import { describe, it, expect } from "vitest";
import { suggestMelody, pcSet } from "./melodyMarkov";

describe("suggestMelody", () => {
  it("returns the requested number of notes", () => {
    const melody = suggestMelody({
      notes: [60, 64, 67], // C major triad
      stepsPerBar: 4,
      seed: 42,
    });
    expect(melody.length).toBe(4);
  });

  it("all generated notes are in the active chord-tone pc-set", () => {
    const chord = [60, 64, 67, 70, 74]; // Cmaj9
    const melody = suggestMelody({
      notes: chord,
      stepsPerBar: 8,
      seed: 42,
    });
    const chordTones = pcSet(chord);
    for (const midi of melody) {
      const pc = ((midi % 12) + 12) % 12;
      expect(chordTones).toContain(pc);
    }
  });

  it("determinism: same args → byte-equal output", () => {
    const a = suggestMelody({ notes: [60, 64, 67], stepsPerBar: 4, seed: 42 });
    const b = suggestMelody({ notes: [60, 64, 67], stepsPerBar: 4, seed: 42 });
    expect(a).toEqual(b);
  });

  it("different seeds → different output (probabilistically)", () => {
    const a = suggestMelody({ notes: [60, 64, 67, 70, 72, 74, 76], stepsPerBar: 4, seed: 1 });
    const b = suggestMelody({ notes: [60, 64, 67, 70, 72, 74, 76], stepsPerBar: 4, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it("returns empty array when notes are empty", () => {
    expect(suggestMelody({ notes: [], stepsPerBar: 4, seed: 42 })).toEqual([]);
  });

  it("returns empty array when stepsPerBar <= 0", () => {
    expect(suggestMelody({ notes: [60, 64, 67], stepsPerBar: 0, seed: 42 })).toEqual([]);
  });

  it("handles duplicate pitch classes in input", () => {
    const chordTones = pcSet([60, 72, 84]); // all C
    expect(chordTones).toEqual([0]);
    const melody = suggestMelody({ notes: [60, 72, 84], stepsPerBar: 4, seed: 42 });
    for (const midi of melody) {
      expect(((midi % 12) + 12) % 12).toBe(0);
    }
  });
});

describe("pcSet", () => {
  it("strips duplicates and preserves first-appearance order", () => {
    expect(pcSet([60, 64, 67, 72, 76, 79])).toEqual([0, 4, 7]);
  });
  it("normalizes negative mod to 0-11", () => {
    expect(pcSet([60, 60 - 12])).toEqual([0]);
  });
});
