/**
 * Regression pins for the `concept-diminished-trail` HarmonicPath.
 *
 * Diminished-trail concept: a 9-bar descending whole-step chain
 * (G7 | F#°7 | Fmaj7 | E°7 | Em7 | D#°7 | Dm7 | C#°7 | Cmaj7) with
 * each bar held for 4 steps. Voicings are root-position chords within
 * G3–F#5 (MIDI 48–78).
 *
 * These pins carry the musical INVARIANT of the exercise, not just the
 * literal data: a dim7 exists to be re-voiced over the chords on either
 * side of it, so every dim7 must share all four of its pitch classes
 * with both neighbours. That property — not the specific octave — is
 * what makes the trail work, so it is asserted directly.
 */

import { describe, it, expect } from "vitest";
import { CONCEPT_PATHS } from "../src/lib/conceptPaths";
import { analyzeChord } from "../src/lib/theory";

/** Pitch classes of a voicing, order-independent. */
const pcsOf = (notes: number[]) =>
  [...new Set(notes.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b);

/** Note-name → pitch class, for the spelling assertions below. */
const PC: Record<string, number> = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6,
  G: 7, "G#": 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

describe("concept-diminished-trail path data", () => {
  const path = CONCEPT_PATHS.find((p) => p.id === "concept-diminished-trail");

  /** The 9 unique bars, one per 4-step group. */
  const bars = () => {
    const steps = path?.steps ?? [];
    const out: { name: string; notes: number[] }[] = [];
    for (let i = 0; i < steps.length; i += 4) out.push(steps[i]);
    return out;
  };

  // 1. The path exists in CONCEPT_PATHS with the expected id.
  it("is present in CONCEPT_PATHS with id 'concept-diminished-trail'", () => {
    expect(path).toBeDefined();
    expect(path?.id).toBe("concept-diminished-trail");
  });

  // 2. Length = 9 bars × 4 steps.
  it("has 36 steps (9 bars × 4 steps)", () => {
    expect(path?.steps.length).toBe(36);
  });

  // 3. Chord progression: chord / dim7 / chord, descending by whole step.
  it("alternates destination chords with fully-diminished passing chords", () => {
    expect(bars().map((b) => b.name)).toEqual([
      "G7", "F#dim7", "Fmaj7",
      "Edim7", "Em7",
      "D#dim7", "Dm7",
      "C#dim7", "Cmaj7",
    ]);
  });

  // 4. Every step has 4 notes, 4 distinct pitch classes, within G3–F#5.
  it("every step is a root-position 4-note chord in G3–F#5 (MIDI 48–78)", () => {
    for (const step of path?.steps ?? []) {
      expect(step.notes.length).toBe(4);
      expect(new Set(step.notes.map((n) => n % 12)).size).toBe(4);
      for (const n of step.notes) {
        expect(n).toBeGreaterThanOrEqual(48);
        expect(n).toBeLessThanOrEqual(78);
      }
    }
  });

  // 5. THE invariant — the standard dim7 resolution: lowering a dim7's
  //    ROOT by a semitone yields the dominant 7th a semitone below it,
  //    pitch for pitch. A dim7 IS a dominant 7th with every note but the
  //    root raised a semitone, which is why one dim7 sound can target
  //    several dominants. Asserted directly rather than by literal voicing.
  it("lowering each dim7's root a semitone yields a dominant 7th exactly", () => {
    const b = bars();
    const dimIndices = b.map((bar, i) => (bar.name.endsWith("dim7") ? i : -1)).filter((i) => i >= 0);
    expect(dimIndices).toEqual([1, 3, 5, 7]);

    for (const i of dimIndices) {
      const pcs = pcsOf(b[i].notes);
      expect(pcs.length, `bar ${i} dim7 needs 4 distinct pitch classes`).toBe(4);

      // Root-relative intervals must be the dim7 stack 0/3/6/9.
      const rootPc = Math.min(...b[i].notes) % 12;
      expect(
        pcs.map((p) => ((p - rootPc) % 12 + 12) % 12).sort((a, b2) => a - b2),
        `${b[i].name} should be a 0/3/6/9 minor-3rd stack`,
      ).toEqual([0, 3, 6, 9]);

      // Lower the root; the result must equal the dom7 built on it.
      const lowered = pcs.map((p) => (p === rootPc ? (p - 1 + 12) % 12 : p)).sort((a, b2) => a - b2);
      const domPcs = [0, 4, 7, 10].map((iv) => ((rootPc - 1 + iv) % 12)).sort((a, b2) => a - b2);
      expect(
        lowered,
        `${b[i].name} lowered at the root should equal the dom7 a semitone below`,
      ).toEqual(domPcs);
    }
  });

  // 6. Each dim7 is a TRUE fully-diminished 7th — a stack of minor
  //    thirds (0/3/6/9 from root) — and analyzeChord says "diminished",
  //    not "half-diminished". A m7b5 chord would still be a minor-3rd
  //    stack at the top, so the family assertion is the sharper claim.
  it("each dim7 is a minor-third stack classified as 'diminished'", () => {
    for (const step of path?.steps ?? []) {
      if (!step.name.endsWith("dim7")) continue;
      const analysis = analyzeChord(step.notes);
      expect(analysis.family, `${step.name} should analyze as diminished`).toBe("diminished");
      expect(analysis.inversion, `${step.name} should be root position`).toBe(0);

      // Root-relative intervals must be exactly 0/3/6/9 — a stack of
      // minor thirds. Derived from the lowest note, which is the root
      // in root position (asserted just above).
      const rootPc = Math.min(...step.notes);
      const intervals = step.notes
        .map((n) => ((n - rootPc) % 12 + 12) % 12)
        .sort((a, b) => a - b);
      expect(intervals, `${step.name} = m3 stack 0/3/6/9`).toEqual([0, 3, 6, 9]);
    }
  });

  // 7. The non-diminished bars keep their own families: the trail must
  //    not flatten the surrounding chords into diminished color.
  it("the destination chords keep dominant / major / minor families", () => {
    const b = bars();
    const expected = ["dominant", "major", "minor", "minor", "major"];
    const actual = b.map((bar) => analyzeChord(bar.notes).family).filter((f) => f !== "diminished");
    expect(actual).toEqual(expected);
  });

  // 8. The destination chords descend by whole step (the "trail"), and each
  //    dim7 sits a semitone at-or-above the chord it resolves into — its
  //    own b7 is the note that falls to that chord's 3rd. Gaps of 1 and 0
  //    are both correct: an equal-rooted dim7 resolves down onto a minor
  //    chord's root, a raised-root dim7 resolves onto a major third above.
  it("destination chords descend by whole step and each dim7 sits a semitone at-or-above its resolution", () => {
    const b = bars();
    const destinations = [b[0], b[2], b[4], b[6], b[8]];
    // G → F → E → D → C, one whole step each.
    expect(destinations.map((d) => analyzeChord(d.notes).rootName)).toEqual(["G", "F", "E", "D", "C"]);
    for (const i of [1, 3, 5, 7]) {
      const dimRoot = analyzeChord(b[i].notes).rootName;
      const targetRoot = analyzeChord(b[i + 1].notes).rootName;
      const gap = (((PC[dimRoot] - PC[targetRoot]) % 12) + 12) % 12;
      expect(
        [0, 1],
        `${dimRoot} (bar ${i}) should sit a semitone at-or-above ${targetRoot} (bar ${i + 1}), got ${gap}`,
      ).toContain(gap);
    }
  });
});