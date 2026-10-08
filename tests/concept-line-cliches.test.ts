/**
 * Regression pins for the `concept-line-cliches` HarmonicPath.
 *
 * 5 → ♯9 → 1 → 2 line cliché on a single dominant 7♯9 chord (G7♯9
 * in root position: G, B, D, F, A♯). The chord stays G7♯9 for all
 * 4 bars; the player practices the 4-note motif repeatedly.
 * Voicings are 5-note root-position dominant 7♯9 in C3–C5
 * (G3=55, B3=59, D4=62, F4=65, A♯4=70). If a refactor changes the
 * progression, the chord quality, or the voicings, the relevant
 * assertion below fails.
 */

import { describe, it, expect } from "vitest";
import { CONCEPT_PATHS } from "../src/lib/conceptPaths";
import { analyzeChord } from "../src/lib/theory";

describe("concept-line-cliches path data", () => {
  const path = CONCEPT_PATHS.find((p) => p.id === "concept-line-cliches");

  it("is present in CONCEPT_PATHS with id 'concept-line-cliches'", () => {
    expect(path).toBeDefined();
    expect(path?.id).toBe("concept-line-cliches");
  });

  it("has 16 steps (4 bars × 4 steps)", () => {
    expect(path?.steps.length).toBe(16);
  });

  it("uses the G7#9 chord across all four bars", () => {
    const names = path?.steps.map((s) => s.name);
    expect(names).toEqual(Array(16).fill("G7#9"));
  });

  it("every step has 5 notes (root-position dominant 7♯9) in C3–C5 with the pinned voicings", () => {
    for (const step of path?.steps ?? []) {
      expect(step.notes.length).toBe(5);
      for (const n of step.notes) {
        // C3=48, C5=72; the path uses C3–C5 as its voicing window.
        expect(n).toBeGreaterThanOrEqual(48);
        expect(n).toBeLessThanOrEqual(72);
      }
    }
    // Pinned voicing: G3, B3, D4, F4, A♯4 = [55, 59, 62, 65, 70].
    // A re-voice breaks this explicitly.
    for (const step of path?.steps ?? []) {
      expect(step.notes).toEqual([55, 59, 62, 65, 70]);
    }
  });

  it("each step is a dominant 7♯9 — analyzeChord returns family 'dominant'", () => {
    for (const [i, step] of (path?.steps ?? []).entries()) {
      const analysis = analyzeChord(step.notes);
      expect(
        analysis.family,
        `step ${i} (${step.name}) should analyze as dominant`,
      ).toBe("dominant");
    }
  });
});
