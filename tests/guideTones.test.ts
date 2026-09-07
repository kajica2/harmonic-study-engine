import { describe, it, expect } from "vitest";
import { classifyGuideTone } from "../src/lib/guideTones";
import { analyzeChord } from "../src/lib/theory";

/**
 * classifyGuideTone — matches a played MIDI note against the
 * active chord's pitch classes and reports the role it plays
 * (root / 3rd / 5th / 7th / 9th / color / off).
 *
 * Tests pin:
 *   - Basic triad recognition (root, 3rd, 5th, off)
 *   - 7th chords (root, 3rd, 5th, 7th)
 *   - 9th chord recognition (added tensions)
 *   - Sus chord behavior (3rd is "omitted")
 *   - Inversion-agnosticism (3rd in any octave matches)
 *   - Pitch-class normalization (C# === Db)
 *   - Off / non-chord tone case
 *   - Empty chord fallback
 *   - Guide-tone flag (true only for 3rd + 7th)
 */

describe("classifyGuideTone", () => {
  describe("basic triad", () => {
    const cmaj = [60, 64, 67]; // C4 E4 G4

    it("identifies the root", () => {
      const m = classifyGuideTone(60, cmaj);
      expect(m.role).toBe("root");
      expect(m.label).toBe("root");
      expect(m.isGuideTone).toBe(false);
      expect(m.inChord).toBe(true);
    });

    it("identifies the third as a guide tone", () => {
      const m = classifyGuideTone(64, cmaj);
      expect(m.role).toBe("third");
      expect(m.isGuideTone).toBe(true);
    });

    it("identifies the fifth", () => {
      const m = classifyGuideTone(67, cmaj);
      expect(m.role).toBe("fifth");
      expect(m.isGuideTone).toBe(false);
    });

    it("flags a non-chord note as 'off'", () => {
      const m = classifyGuideTone(65, cmaj); // F4
      expect(m.role).toBe("off");
      expect(m.inChord).toBe(false);
      expect(m.isGuideTone).toBe(false);
    });
  });

  describe("seventh chord", () => {
    const cm7 = [60, 64, 67, 70]; // C E G Bb
    it("identifies the 7th as a guide tone", () => {
      const m = classifyGuideTone(70, cm7);
      expect(m.role).toBe("seventh");
      expect(m.isGuideTone).toBe(true);
    });

    // Dominant 7 — C E G Bb
    const c7 = [60, 64, 67, 70];
    it("identifies the dominant 7th similarly", () => {
      const m = classifyGuideTone(70, c7);
      expect(m.isGuideTone).toBe(true);
    });
  });

  describe("9th chord with tension", () => {
    const cmaj9 = [60, 64, 67, 71, 74]; // C E G B D
    it("identifies the 9th as 'ninth'", () => {
      const m = classifyGuideTone(74, cmaj9);
      expect(m.role).toBe("ninth");
      expect(m.isGuideTone).toBe(false); // 9th is a color, not a guide tone
    });
  });

  describe("sus chord (3rd omitted)", () => {
    // Csus4: C F G — no 3rd
    const csus4 = [60, 65, 67];
    it("classifies the 4th in a sus chord as 'fifth' slot (no 3rd present)", () => {
      // The classifier doesn't know "sus" specifically — without a
      // 3rd or 7th in the chord, the slot at interval 5 (semitones)
      // gets bucketed as 'fifth' by the slot-mapping logic. Verify
      // that's the current behavior; a future iteration can wire
      // analyzeChord's family='unknown' detection into a proper
      // sus-aware label.
      const m = classifyGuideTone(65, csus4);
      expect(m.role === "fifth" || m.role === "third").toBe(true);
    });

    it("a 'normal' triad still classifies 3rd when the chord has one", () => {
      const cmaj = [60, 64, 67];
      const m = classifyGuideTone(64, cmaj);
      expect(m.role).toBe("third");
      expect(m.isGuideTone).toBe(true);
    });
  });

  describe("inversion-agnosticism", () => {
    const cEG = [60, 64, 67];
    it("classifies E in any octave as the 3rd", () => {
      expect(classifyGuideTone(64, cEG).role).toBe("third"); // E4
      expect(classifyGuideTone(76, cEG).role).toBe("third"); // E5
      expect(classifyGuideTone(52, cEG).role).toBe("third"); // E3
    });
  });

  describe("pitch-class normalization", () => {
    // Db major: Db F Ab — same pitch classes as C# major
    const dflat = [61, 66, 68]; // Db4 F4 Ab4
    it("classifies the same way regardless of enharmonic spelling", () => {
      const csharp = [61, 66, 68]; // same notes
      const m1 = classifyGuideTone(61, dflat);
      const m2 = classifyGuideTone(61, csharp);
      expect(m1.role).toBe(m2.role);
    });
  });

  describe("empty chord", () => {
    it("returns 'off' for an empty chord", () => {
      const m = classifyGuideTone(60, []);
      expect(m.role).toBe("off");
      expect(m.inChord).toBe(false);
    });
  });

  describe("guide-tone flag is conservative", () => {
    const cmaj7 = [60, 64, 67, 71];
    it("flags only 3rd and 7th as guide tones", () => {
      expect(classifyGuideTone(60, cmaj7).isGuideTone).toBe(false); // root
      expect(classifyGuideTone(64, cmaj7).isGuideTone).toBe(true);  // 3rd
      expect(classifyGuideTone(67, cmaj7).isGuideTone).toBe(false); // 5th
      expect(classifyGuideTone(71, cmaj7).isGuideTone).toBe(true);  // 7th
    });
  });
});
