/**
 * engine/explore/seeds.test.ts - PRD-001 Phase 5 (D93, checklist 1).
 *
 * Pins the resolution order + the 12-preset non-free guarantee.
 */

import { describe, it, expect } from "vitest";
import {
  EXPLORE_PRESETS,
  parseExploreSeed,
  ideaToSeedText,
} from "./seeds";

describe("EXPLORE_PRESETS all parse non-free", () => {
  it("pool holds the 12 stub strings verbatim", () => {
    expect(EXPLORE_PRESETS).toHaveLength(12);
    expect(EXPLORE_PRESETS[0]).toBe("Cmaj7");
    expect(EXPLORE_PRESETS[8]).toBe("Bbmaj7-A7alt");
  });

  const expectedKind: Readonly<Record<string, string>> = {
    Cmaj7: "chord",
    "ii-V-I in C": "progression",
    "D dorian": "scale",
    Fmaj7: "chord",
    "C blues": "scale",
    "12-bar in A": "progression",
    "C lydian": "scale",
    Dm9: "chord",
    "Bbmaj7-A7alt": "progression",
    "G mixolydian": "scale",
    "Cm-Eb-Gm progression": "progression",
    "Phrygian in E": "scale",
  };

  for (const preset of EXPLORE_PRESETS) {
    it(`"${preset}" -> ${expectedKind[preset]} (never free)`, () => {
      const seed = parseExploreSeed(preset);
      expect(seed.kind).toBe(expectedKind[preset]);
      expect(seed.kind).not.toBe("free");
    });
  }
});

describe("resolution order fixtures", () => {
  it("whole-string chord wins (slash-bass included)", () => {
    const seed = parseExploreSeed("Dm7");
    expect(seed.kind).toBe("chord");
    expect(seed.chord).toBe("Dm7");
  });

  it("hyphen form normalizes to a two-symbol progression", () => {
    const seed = parseExploreSeed("Bbmaj7-A7alt");
    expect(seed.kind).toBe("progression");
    expect(seed.progression).toEqual(["Bbmaj7", "A7alt"]);
  });

  it("numeral head realizes bare triads per D21 (ii-V-I in C -> Dm G C)", () => {
    const seed = parseExploreSeed("ii-V-I in C");
    expect(seed.kind).toBe("progression");
    expect(seed.progression).toEqual(["Dm", "G", "C"]);
  });

  it("12-bar in A realizes the standard blues changes (12 bars, A7 first)", () => {
    const seed = parseExploreSeed("12-bar in A");
    expect(seed.kind).toBe("progression");
    expect(seed.progression).toHaveLength(12);
    expect(seed.progression?.[0]).toBe("A7");
    expect(seed.progression?.[4]).toBe("D7");
    expect(seed.progression?.[8]).toBe("E7");
  });

  it("scale forms: root-mode and mode-in-key", () => {
    const d = parseExploreSeed("D dorian");
    expect(d.kind).toBe("scale");
    expect(d.scale).toEqual({ rootPc: 2, modeName: "dorian" });
    const blues = parseExploreSeed("C blues");
    expect(blues.scale).toEqual({ rootPc: 0, modeName: "blues" });
    const phrygian = parseExploreSeed("Phrygian in E");
    expect(phrygian.scale).toEqual({ rootPc: 4, modeName: "phrygian" });
  });

  it("interval forms: bare, space-direction, underscore-direction", () => {
    expect(parseExploreSeed("P5 up").interval).toEqual({
      semitones: 7,
      direction: "up",
    });
    expect(parseExploreSeed("m2_down").interval).toEqual({
      semitones: 1,
      direction: "down",
    });
    expect(parseExploreSeed("oct").interval).toEqual({
      semitones: 12,
      direction: "up",
    });
  });

  it("inner-whitespace junk falls to free (never throws)", () => {
    const seed = parseExploreSeed("C sus4");
    expect(seed.kind).toBe("free");
    expect(seed.raw).toBe("C sus4");
  });

  it("plain prose and blanks fall to free", () => {
    expect(parseExploreSeed("hello world").kind).toBe("free");
    expect(parseExploreSeed("   ").kind).toBe("free");
    expect(parseExploreSeed("").kind).toBe("free");
  });

  it("never throws on hostile input", () => {
    expect(() => parseExploreSeed("{key: C}\n%C".repeat(40))).not.toThrow();
    expect(() =>
      parseExploreSeed("Bb7#9sus4alt13".repeat(10)),
    ).not.toThrow();
  });
});

describe("ideaToSeedText carriers", () => {
  it("chord / progression / scale round-trip through the parser", () => {
    expect(parseExploreSeed(ideaToSeedText({ kind: "chord", chord: "Fmaj7", progression: null, scale: null, melody: null, seed: null })).kind).toBe("chord");
    const prog = parseExploreSeed(
      ideaToSeedText({ kind: "progression", chord: null, progression: ["Dm7", "G7", "Cmaj7"], scale: null, melody: null, seed: null }),
    );
    expect(prog.kind).toBe("progression");
    expect(prog.progression).toEqual(["Dm7", "G7", "Cmaj7"]);
    expect(
      parseExploreSeed(
        ideaToSeedText({ kind: "scale", chord: null, progression: null, scale: "D dorian", melody: null, seed: null }),
      ).kind,
    ).toBe("scale");
  });

  it("seed kind maps to a preset by index (non-free)", () => {
    const text = ideaToSeedText({ kind: "seed", chord: null, progression: null, scale: null, melody: null, seed: 8 });
    expect(text).toBe(EXPLORE_PRESETS[8]);
    expect(parseExploreSeed(text).kind).not.toBe("free");
  });

  it("melody kind yields space-joined MIDI (parses as free - the melody seeds the vary panel, not the parser)", () => {
    const text = ideaToSeedText({ kind: "melody", chord: null, progression: null, scale: null, melody: [60, 64, 67], seed: null });
    expect(text).toBe("60 64 67");
    expect(parseExploreSeed(text).kind).toBe("free");
  });
});
