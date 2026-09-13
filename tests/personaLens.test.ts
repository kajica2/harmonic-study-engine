import { describe, it, expect } from "vitest";
import {
  hasBehavioralLens,
  lensForPersona,
  curatedLensIds,
} from "../src/lib/personaLens";
import { voiceLeadingScore } from "../src/lib/theory";

/**
 * personaLens — pure mapping from persona id to behavioral shifts.
 *
 * Tests pin:
 *   - 3 curated personas return their lens (Bach / Coltrane / Miles)
 *   - 14 visual-only personas return the empty lens
 *   - voiceLeadingScore is Bach-aware and triggers STRICT: prefix
 *     only when both chords have parallel motion
 *   - voiceLeadingScore without personaId stays backward-compatible
 *     (no STRICT: prefix)
 */

describe("lensForPersona", () => {
  it("returns Bach's lens with strictness > 1 and prompt text", () => {
    const lens = lensForPersona("bach");
    expect(lens.voiceLeadingStrictness).toBeGreaterThan(1);
    expect(lens.prompt).toContain("two voices stepwise");
  });

  it("returns Coltrane's lens with a substitution-focused prompt", () => {
    const lens = lensForPersona("coltrane");
    expect(lens.prompt).toContain("tritone-sub");
    expect(lens.backingVolumeScale).toBe(1.0);
  });

  it("returns Miles's lens with a 30% volume drop", () => {
    const lens = lensForPersona("miles");
    expect(lens.backingVolumeScale).toBe(0.7);
    expect(lens.prompt.toLowerCase()).toContain("three notes");
  });

  it("returns the empty lens for the 14 visual-only personas", () => {
    const visualOnly = [
      "kandinsky",
      "debussy",
      "eno",
      "glass",
      "monk",
      "chet",
      "dizzy",
      "hubbard",
      "shorter",
      "simone",
      "novaro",
      "getz",
      "rollins",
      "henderson",
    ];
    for (const id of visualOnly) {
      const lens = lensForPersona(id);
      expect(lens.prompt).toBe("");
      expect(lens.backingVolumeScale).toBe(1.0);
      expect(lens.voiceLeadingStrictness).toBe(1.0);
    }
  });

  it("returns the empty lens for undefined / unknown ids", () => {
    expect(lensForPersona(undefined).prompt).toBe("");
    expect(lensForPersona("").prompt).toBe("");
    expect(lensForPersona("nonexistent").prompt).toBe("");
  });
});

describe("hasBehavioralLens", () => {
  it("returns true for the 3 curated personas", () => {
    expect(hasBehavioralLens("bach")).toBe(true);
    expect(hasBehavioralLens("coltrane")).toBe(true);
    expect(hasBehavioralLens("miles")).toBe(true);
  });

  it("returns false for visual-only personas and undefined", () => {
    expect(hasBehavioralLens("kandinsky")).toBe(false);
    expect(hasBehavioralLens(undefined)).toBe(false);
    expect(hasBehavioralLens("")).toBe(false);
  });
});

describe("curatedLensIds", () => {
  it("returns exactly the three curated ids", () => {
    expect(curatedLensIds().sort()).toEqual(["bach", "coltrane", "miles"]);
  });
});

describe("voiceLeadingScore — persona-aware", () => {
  it("is backward-compatible without a persona id", () => {
    const result = voiceLeadingScore([60, 64, 67], [65, 69, 72]);
    expect(result).toMatch(/top-voice motion/);
    expect(result).not.toMatch(/STRICT:/);
  });

  it("returns STRICT: prefix under Bach when parallel motion is detected", () => {
    // C major triad [60,64,67] (top=67 = G4) and D major triad
    // [62,66,69] (top=69 = A4). Top voice moves up 2 st; inner
    // voice (E4=64 → F#4=66) also moves up 2 st. That's parallel
    // motion — Bach's lens should flag it.
    const result = voiceLeadingScore(
      [60, 64, 67],
      [62, 66, 69],
      "bach",
    );
    expect(result).toMatch(/^STRICT:/);
    expect(result).toContain("parallel motion");
  });

  it("does NOT flag Bach on contrary motion", () => {
    // Top moves 67 → 69 (+2); inner was 64, now 64 (0). Not parallel.
    const result = voiceLeadingScore(
      [60, 64, 67],
      [57, 64, 67, 69],
      "bach",
    );
    expect(result).not.toMatch(/^STRICT:/);
    expect(result).toMatch(/top-voice motion/);
  });

  it("Bach lens still produces normal motion feedback on common-tone cases", () => {
    const result = voiceLeadingScore(
      [60, 64, 67],
      [60, 65, 67],
      "bach",
    );
    expect(result).toMatch(/common tone/);
    expect(result).not.toMatch(/STRICT:/);
  });

  it("Bach lens returns early without STRICT: if either chord has fewer than 2 notes", () => {
    const result = voiceLeadingScore([60], [62, 66], "bach");
    expect(result).not.toMatch(/^STRICT:/);
  });

  it("non-Bach persona does not trigger STRICT:", () => {
    const result = voiceLeadingScore(
      [60, 64, 67],
      [62, 66, 69],
      "coltrane",
    );
    expect(result).not.toMatch(/STRICT:/);
    expect(result).toMatch(/top-voice motion/);
  });
});
