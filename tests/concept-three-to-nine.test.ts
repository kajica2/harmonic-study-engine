/**
 * Regression pins for the `concept-three-to-nine` HarmonicPath.
 *
 * 3-to-9 voice-leading concept: a single ii-V-I in C (Cmaj7 | Dm7 | G7
 * | Cmaj7) where each bar is held for 4 steps. Voicings are
 * root-position 7th chords (root, 3, 5, 7) in C3–C5. If a refactor
 * changes the progression, the chord qualities, or the voicings, the
 * relevant assertion below fails.
 */

import { describe, it, expect } from "vitest";
import { CONCEPT_PATHS } from "../src/lib/conceptPaths";
import { analyzeChord } from "../src/lib/theory";

describe("concept-three-to-nine path data", () => {
  const path = CONCEPT_PATHS.find((p) => p.id === "concept-three-to-nine");

  // 1. The path exists in CONCEPT_PATHS with the expected id.
  it("is present in CONCEPT_PATHS with id 'concept-three-to-nine'", () => {
    expect(path).toBeDefined();
    expect(path?.id).toBe("concept-three-to-nine");
  });

  // 2. Length = 4 bars × 4 steps.
  it("has 16 steps (4 bars × 4 steps)", () => {
    expect(path?.steps.length).toBe(16);
  });

  // 3. Chord names per bar: Cmaj7, Dm7, G7, Cmaj7.
  it("uses the chord progression Cmaj7 | Dm7 | G7 | Cmaj7 across the four bars", () => {
    const names = path?.steps.map((s) => s.name);
    expect(names).toEqual([
      "Cmaj7", "Cmaj7", "Cmaj7", "Cmaj7",
      "Dm7",   "Dm7",   "Dm7",   "Dm7",
      "G7",    "G7",    "G7",    "G7",
      "Cmaj7", "Cmaj7", "Cmaj7", "Cmaj7",
    ]);
  });

  // 4. Every step has exactly 4 notes, each within C3–C5 (MIDI 48–72),
  //    and the actual voicings per bar are pinned so a re-voice still breaks.
  it("every step has 4 notes in C3–C5 (MIDI 48–72) with the pinned voicings", () => {
    for (const step of path?.steps ?? []) {
      expect(step.notes.length).toBe(4);
      for (const n of step.notes) {
        expect(n).toBeGreaterThanOrEqual(48);
        expect(n).toBeLessThanOrEqual(72);
      }
    }
    // Per-bar voicings pinned explicitly (the 4 unique shapes in the
    // path). If these change, the voicings changed.
    const byBar = [
      path?.steps.slice(0, 4).map((s) => s.notes),
      path?.steps.slice(4, 8).map((s) => s.notes),
      path?.steps.slice(8, 12).map((s) => s.notes),
      path?.steps.slice(12, 16).map((s) => s.notes),
    ];
    expect(byBar[0]).toEqual([[48, 52, 55, 59], [48, 52, 55, 59], [48, 52, 55, 59], [48, 52, 55, 59]]);
    expect(byBar[1]).toEqual([[50, 53, 57, 60], [50, 53, 57, 60], [50, 53, 57, 60], [50, 53, 57, 60]]);
    expect(byBar[2]).toEqual([[55, 59, 62, 65], [55, 59, 62, 65], [55, 59, 62, 65], [55, 59, 62, 65]]);
    expect(byBar[3]).toEqual([[48, 52, 55, 59], [48, 52, 55, 59], [48, 52, 55, 59], [48, 52, 55, 59]]);
  });

  // 5. Each step is a root-position 7th chord (root/3/5/7 = 4 distinct
  // pitch classes) and analyzeChord classifies it correctly.
  it("each step is a root-position 7th chord with the expected analyzeChord family", () => {
    for (const [i, step] of (path?.steps ?? []).entries()) {
      // 4 distinct pitch classes per step.
      const pcs = new Set(step.notes.map((n) => ((n % 12) + 12) % 12));
      expect(pcs.size).toBe(4);

      const analysis = analyzeChord(step.notes);
      const bar = Math.floor(i / 4); // 0..3
      const expected = ["major", "minor", "dominant", "major"][bar];
      expect(
        analysis.family,
        `step ${i} (${step.name}, bar ${bar}) should analyze as ${expected}`,
      ).toBe(expected);
    }
  });
});
