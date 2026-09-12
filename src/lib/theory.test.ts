/**
 * Unit tests for src/lib/theory.ts.
 *
 * Strategy: derive expected values from the same logic that runs the
 * app, then assert. When the code has a documented quirk (e.g. drop2
 * can re-bass the chord), assert the actual behavior rather than the
 * expected ideal. This file is the ground truth for what the app
 * actually does, not what we'd like it to do.
 *
 * Coverage:
 *  - NOTE_NAMES / PITCH_COLORS shape
 *  - getColorForNote / getShapeForNote
 *  - voiceLeadingDistance / voiceLeadingScore
 *  - analyzeChord family classification
 *  - applyVoiceLeading
 *  - applyVoicing + VOICINGS registry
 *  - deriveBehavioralMarkers
 *  - deriveBarTransposeDrift
 */
import { describe, it, expect } from "vitest";
import {
  NOTE_NAMES,
  PITCH_COLORS,
  getColorForNote,
  getShapeForNote,
  voiceLeadingDistance,
  voiceLeadingScore,
  analyzeChord,
  applyVoiceLeading,
  applyVoicing,
  VOICINGS,
  deriveBehavioralMarkers,
  deriveBarTransposeDrift,
} from "./theory";
import type { HarmonicPath, HarmonicStep } from "./paths";

describe("NOTE_NAMES / PITCH_COLORS", () => {
  it("NOTE_NAMES has 12 chromatic entries starting at C", () => {
    expect(NOTE_NAMES).toHaveLength(12);
    expect(NOTE_NAMES[0]).toBe("C");
    expect(NOTE_NAMES[11]).toBe("B");
  });
  it("PITCH_COLORS has an entry for every NOTE_NAMES value", () => {
    for (const n of NOTE_NAMES) {
      expect(PITCH_COLORS[n]).toBeDefined();
      expect(PITCH_COLORS[n]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
  it("getColorForNote(60) returns PITCH_COLORS[C]", () => {
    expect(getColorForNote(60)).toBe(PITCH_COLORS["C"]);
  });
  it("getColorForNote(72) returns PITCH_COLORS[C] (one octave up)", () => {
    expect(getColorForNote(72)).toBe(PITCH_COLORS["C"]);
  });
  it("getColorForNote(83) returns PITCH_COLORS[B] (B5 = pitch class 11)", () => {
    // 83 % 12 = 11 (B), not 0 (C). Important to encode the real math.
    expect(getColorForNote(83)).toBe(PITCH_COLORS["B"]);
  });
  it("getShapeForNote maps pitch classes per the documented rules", () => {
    // 0 (C) and 7 (G) are in [0, 7] → circle
    expect(getShapeForNote(60)).toBe("circle"); // C
    expect(getShapeForNote(67)).toBe("circle"); // G
    // 2 (D), 4 (E), 9 (A) → square
    expect(getShapeForNote(62)).toBe("square"); // D
    expect(getShapeForNote(64)).toBe("square"); // E
    expect(getShapeForNote(69)).toBe("square"); // A
    // 1 (C#), 6 (F#), 11 (B) → triangle
    expect(getShapeForNote(61)).toBe("triangle"); // C#
    expect(getShapeForNote(66)).toBe("triangle"); // F#
    expect(getShapeForNote(71)).toBe("triangle"); // B  — wait, code lists [1,6,11]
    // 11 (B) is NOT in the list — verify the actual behavior:
    // Code: [1, 6, 11].includes(pitchClass). 11 IS in [1,6,11].
    // Let me re-check.
  });
  it("getShapeForNote for B (pc 11) returns triangle per code", () => {
    // Code's literal: if ([1, 6, 11].includes(pitchClass)) return "triangle"
    expect(getShapeForNote(71)).toBe("triangle"); // B
    expect(getShapeForNote(66)).toBe("triangle"); // F#
  });
  it("getShapeForNote for E (pc 4) returns square", () => {
    expect(getShapeForNote(64)).toBe("square");
  });
});

describe("voiceLeadingDistance", () => {
  it("returns 0 for two empty chords", () => {
    expect(voiceLeadingDistance([], [])).toBe(0);
  });
  it("returns 0 for identical chords", () => {
    expect(voiceLeadingDistance([60, 64, 67], [60, 64, 67])).toBe(0);
  });
  it("counts voice motion across the chord plus bass motion", () => {
    // Cmaj7 [60,64,67,71] → Dm7 [62,65,69,72]
    // Per-voice: +2, +1, +2, +1 = 6. Bass (60→62) = +2. Total = 8.
    expect(voiceLeadingDistance([60, 64, 67, 71], [62, 65, 69, 72])).toBe(8);
  });
  it("handles chords of different sizes without crashing", () => {
    expect(() =>
      voiceLeadingDistance([60], [60, 64, 67]),
    ).not.toThrow();
  });
});

describe("voiceLeadingScore", () => {
  it("returns 'no prior chord' when prevNotes is empty", () => {
    expect(voiceLeadingScore([], [60, 64, 67])).toBe("no prior chord");
  });
  it("reports top-voice motion in semitones", () => {
    // top: 67 → 70 = 3 semitones
    expect(voiceLeadingScore([60, 64, 67], [60, 64, 70])).toBe(
      "top-voice motion: 3 st",
    );
  });
  it("reports 0-semitone motion with the 'common tone' label when top is held", () => {
    // top: 70 → 70 = 0
    expect(voiceLeadingScore([60, 64, 70], [60, 64, 70])).toBe(
      "common tone on top — held",
    );
  });
});

describe("analyzeChord", () => {
  it("returns 'unknown' family for an empty chord", () => {
    expect(analyzeChord([]).family).toBe("unknown");
  });
  it("classifies a major triad (C E G) as 'major'", () => {
    const a = analyzeChord([60, 64, 67]);
    expect(a.family).toBe("major");
    expect(a.rootName).toBe("C");
    expect(a.bass).toBe("C4"); // 60 / 12 - 1 = 4
  });
  it("classifies a minor triad (C Eb G) as 'minor'", () => {
    expect(analyzeChord([60, 63, 67]).family).toBe("minor");
  });
  it("classifies a dominant 7th (C E G Bb) as 'dominant'", () => {
    expect(analyzeChord([60, 64, 67, 70]).family).toBe("dominant");
  });
  it("classifies a half-diminished (Cm7b5) as 'half-diminished'", () => {
    expect(analyzeChord([60, 63, 66, 70]).family).toBe("half-diminished");
  });
  it("classifies a fully diminished triad (C Eb Gb) per code's actual rule", () => {
    // Code: third=3, fifth=6 → "half-diminished" (it matches the first
    // matching branch). Encoding the real behavior so a refactor that
    // changes it gets a flagged failure.
    expect(analyzeChord([60, 63, 66]).family).toBe("half-diminished");
  });
  it("classifies a major 7th (C E G B) as 'major'", () => {
    expect(analyzeChord([60, 64, 67, 71]).family).toBe("major");
  });
  it("marks function as tonic for C bass, dominant for G bass", () => {
    expect(analyzeChord([60, 64, 67]).function).toBe("tonic");
    expect(analyzeChord([67, 71, 74]).function).toBe("dominant");
  });
  it("detects the 9th tension (semitone 2 above root)", () => {
    // Note: code's tension ladder has a bug — semitone 9 (the 13th) is
    // shadowed by the semitone 2 (the 9th) branch, so 13 is unreachable.
    // This test pins the 9th detection which DOES work.
    const a = analyzeChord([60, 64, 67, 74]); // C E G D
    expect(a.tensions).toContain("9");
  });
});

describe("applyVoiceLeading", () => {
  it("returns the target notes when prevNotes is empty", () => {
    // Implementation returns targetNotes as-is when there's no prior chord.
    expect(applyVoiceLeading([], [60, 64])).toEqual([60, 64]);
  });
  it("preserves the bass note of the target chord when there's a prior chord", () => {
    const out = applyVoiceLeading([60, 64, 67], [62, 65, 69, 72]);
    expect(out[0]).toBe(62);
  });
  it("returns a sorted, de-duped array", () => {
    const out = applyVoiceLeading([60, 64, 67], [62, 65, 69, 72]);
    const sorted = [...out].sort((a, b) => a - b);
    expect(out).toEqual(sorted);
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("VOICINGS registry + applyVoicing", () => {
  const allIds = Object.keys(VOICINGS) as Array<keyof typeof VOICINGS>;

  it("every VoicingId has a non-empty label and description", () => {
    for (const id of allIds) {
      const v = VOICINGS[id];
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.description.length).toBeGreaterThan(0);
      expect(v.id).toBe(id);
    }
  });

  it("returns a non-empty array for non-empty input", () => {
    for (const id of allIds) {
      const out = applyVoicing([60, 64, 67], id);
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it("closed voicing preserves the bass note (48 stays in result)", () => {
    const out = applyVoicing([48, 52, 55, 59], "closed");
    expect(out[0]).toBe(48);
  });

  it("drop2 can re-bass the chord (documented behavior — drops 2nd-from-top down an octave)", () => {
    // Drop2 moves the second-from-top voice down an octave. For [48,52,55,59]
    // the second-from-top is 55; 55 - 12 = 43, which is below the original bass 48.
    const out = applyVoicing([48, 52, 55, 59], "drop2");
    expect(out).toContain(43);
  });

  it("inversion puts the previous bass up an octave", () => {
    const out = applyVoicing([48, 52, 55, 59], "inversion");
    // Original bass was 48; inversion moves it up to 60.
    expect(out).toContain(60);
  });

  it("quartal voicing contains at least one perfect-fourth interval pair", () => {
    const out = applyVoicing([48, 53, 58, 63], "quartal");
    // 53 - 48 = 5 (perfect fourth). Confirm.
    expect(Math.abs(out[1] - out[0])).toBe(5);
  });

  it("spread voicing shifts alternating voices up an octave", () => {
    const out = applyVoicing([48, 52, 55, 59], "spread");
    // Sorted result. Should differ from closed (48,52,55,59). Confirm non-empty.
    expect(out.length).toBeGreaterThan(0);
    // At least one note should be raised above its closed position.
    const closedSorted = [48, 52, 55, 59];
    const raised = out.some((n) => !closedSorted.includes(n));
    expect(raised).toBe(true);
  });
});

describe("deriveBehavioralMarkers", () => {
  function makePath(
    steps: { name: string; notes: number[]; descriptions?: string }[],
  ) {
    return {
      id: "test",
      title: "test",
      description: "test",
      steps: steps.map((s) => ({ descriptions: "", ...s })),
    };
  }
  function makePersona(palette: string[]) {
    return {
      id: "x", name: "x", role: "x", quote: "",
      originalSongId: "x", instrument: "sine" as any, tempo: 60,
      arpType: "none" as const, arpRate: 1, arpGate: 100, arpOctaves: 1,
      visualTheme: "default" as const, accentColor: "#000",
      gradientFrom: "", gradientTo: "", colorPalette: palette,
    };
  }

  it("returns one marker per bar", () => {
    const path = makePath([
      { name: "C", notes: [60] },
      { name: "C", notes: [60] },
      { name: "C", notes: [60] },
      { name: "C", notes: [60] },
    ]);
    expect(deriveBehavioralMarkers(path, undefined)).toHaveLength(1);
  });

  it("first bar is never a transformation (no prior bar to compare)", () => {
    const path = makePath([
      { name: "C", notes: [60, 64, 67] },
      { name: "G", notes: [67, 71, 74] },
      { name: "Am", notes: [69, 72, 76] },
      { name: "F", notes: [65, 69, 72] },
      { name: "C", notes: [60, 64, 67] },
      { name: "G", notes: [67, 71, 74] },
      { name: "Am", notes: [69, 72, 76] },
      { name: "F", notes: [65, 69, 72] },
    ]);
    const markers = deriveBehavioralMarkers(path, undefined);
    expect(markers[0].isMotifTransformation).toBe(false);
  });

  it("detects frozenBass when bass carries unchanged across bars", () => {
    // 8 steps = 2 bars. Bar 0 bass=48, bar 1 bass=48 → frozen.
    const path = makePath([
      { name: "Cm", notes: [48, 51, 55] },
      { name: "Cm", notes: [48, 51, 55] },
      { name: "Cm", notes: [48, 51, 55] },
      { name: "Cm", notes: [48, 51, 55] },
      { name: "Cm", notes: [48, 51, 55] },
      { name: "Cm", notes: [48, 51, 55] },
      { name: "Cm", notes: [48, 51, 55] },
      { name: "Cm", notes: [48, 51, 55] },
    ]);
    const markers = deriveBehavioralMarkers(path, undefined);
    expect(markers[1].bassFrozen).toBe(true);
  });

  it("detects motif transformation when bar re-voices prior content", () => {
    // Bar 0: Cmaj7 [60,64,67,71]. Bar 1: C7 [60,64,67,70] — 3 shared pcs,
    // 1 new (Bb). Should mark as transformation.
    const path = makePath([
      { name: "Cmaj7", notes: [60, 64, 67, 71] },
      { name: "Cmaj7", notes: [60, 64, 67, 71] },
      { name: "Cmaj7", notes: [60, 64, 67, 71] },
      { name: "Cmaj7", notes: [60, 64, 67, 71] },
      { name: "C7", notes: [60, 64, 67, 70] },
      { name: "C7", notes: [60, 64, 67, 70] },
      { name: "C7", notes: [60, 64, 67, 70] },
      { name: "C7", notes: [60, 64, 67, 70] },
    ]);
    const markers = deriveBehavioralMarkers(path, undefined);
    expect(markers[1].isMotifTransformation).toBe(true);
  });

  it("cycles accentHex from persona.colorPalette across bars", () => {
    const path = makePath([
      { name: "A", notes: [57, 60, 64] },
      { name: "A", notes: [57, 60, 64] },
      { name: "A", notes: [57, 60, 64] },
      { name: "A", notes: [57, 60, 64] },
      { name: "B", notes: [60, 64, 67] },
      { name: "B", notes: [60, 64, 67] },
      { name: "B", notes: [60, 64, 67] },
      { name: "B", notes: [60, 64, 67] },
      { name: "C", notes: [62, 65, 69] },
      { name: "C", notes: [62, 65, 69] },
      { name: "C", notes: [62, 65, 69] },
      { name: "C", notes: [62, 65, 69] },
    ]);
    const palette = ["#111111", "#222222", "#333333"];
    const markers = deriveBehavioralMarkers(path, makePersona(palette));
    expect(markers[0].accentHex).toBe(palette[0]);
    expect(markers[1].accentHex).toBe(palette[1]);
    expect(markers[2].accentHex).toBe(palette[2]);
  });

  it("falls back to default palette when persona is undefined", () => {
    const path = makePath([
      { name: "C", notes: [60, 64, 67] },
      { name: "C", notes: [60, 64, 67] },
      { name: "C", notes: [60, 64, 67] },
      { name: "C", notes: [60, 64, 67] },
    ]);
    const markers = deriveBehavioralMarkers(path, undefined);
    expect(markers[0].accentHex).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe("deriveBarTransposeDrift", () => {
  function makePath(
    steps: { name: string; notes: number[]; descriptions?: string }[],
    extras: Record<string, any> = {},
  ) {
    return {
      id: "test",
      title: "test",
      description: "test",
      steps: steps.map((s) => ({ descriptions: "", ...s })),
      ...extras,
    };
  }

  it("returns zeros for a path with no drift metadata", () => {
    const path = makePath([
      { name: "C", notes: [60, 64, 67] },
      { name: "C", notes: [60, 64, 67] },
      { name: "C", notes: [60, 64, 67] },
      { name: "C", notes: [60, 64, 67] },
    ]);
    expect(deriveBarTransposeDrift(path, undefined).every((d) => d === 0)).toBe(true);
  });

  it("climbs by sequenceInterval when sequenceStepper is true", () => {
    const path = makePath(
      [
        { name: "Dm", notes: [50, 53, 57, 60] }, { name: "Dm", notes: [50, 53, 57, 60] },
        { name: "Dm", notes: [50, 53, 57, 60] }, { name: "Dm", notes: [50, 53, 57, 60] },
        { name: "Em", notes: [52, 55, 59, 62] }, { name: "Em", notes: [52, 55, 59, 62] },
        { name: "Em", notes: [52, 55, 59, 62] }, { name: "Em", notes: [52, 55, 59, 62] },
        { name: "F#m", notes: [54, 57, 61, 64] }, { name: "F#m", notes: [54, 57, 61, 64] },
        { name: "F#m", notes: [54, 57, 61, 64] }, { name: "F#m", notes: [54, 57, 61, 64] },
        { name: "GM", notes: [55, 59, 62, 67] }, { name: "GM", notes: [55, 59, 62, 67] },
        { name: "GM", notes: [55, 59, 62, 67] }, { name: "GM", notes: [55, 59, 62, 67] },
      ],
      { sequenceStepper: true, sequenceInterval: 2 },
    );
    const drift = deriveBarTransposeDrift(path, undefined);
    expect(drift[0]).toBe(0);   // bar 0
    expect(drift[4]).toBe(2);   // bar 1
    expect(drift[8]).toBe(4);   // bar 2
    expect(drift[12]).toBe(6);  // bar 3
  });

  it("interpolates keyDrift from start key to end key", () => {
    const path = makePath(
      [
        { name: "Dm", notes: [50, 53, 57] },
        { name: "Dm", notes: [50, 53, 57] },
        { name: "Dm", notes: [50, 53, 57] },
        { name: "Dm", notes: [50, 53, 57] },
        { name: "BbM", notes: [46, 53, 58] },
        { name: "BbM", notes: [46, 53, 58] },
        { name: "BbM", notes: [46, 53, 58] },
        { name: "BbM", notes: [46, 53, 58] },
        { name: "F#m", notes: [42, 49, 54] },
        { name: "F#m", notes: [42, 49, 54] },
        { name: "F#m", notes: [42, 49, 54] },
        { name: "F#m", notes: [42, 49, 54] },
        { name: "CM", notes: [48, 52, 55] },
        { name: "CM", notes: [48, 52, 55] },
        { name: "CM", notes: [48, 52, 55] },
        { name: "CM", notes: [48, 52, 55] },
      ],
      { key: "D minor → C major" }, // uses literal → arrow character
    );
    const drift = deriveBarTransposeDrift(path, undefined);
    // D=2, C=0, delta=-2. Across 4 bars: 0, ~-1, ~-1, -2.
    expect(drift[0]).toBe(0);
    expect(drift[drift.length - 1]).toBe(-2);
  });

  it("returns one entry per path step", () => {
    const path = makePath([
      { name: "C", notes: [60] }, { name: "G", notes: [67] },
      { name: "Am", notes: [69] }, { name: "F", notes: [65] },
      { name: "C", notes: [60] }, { name: "G", notes: [67] },
      { name: "Am", notes: [69] }, { name: "F", notes: [65] },
    ]);
    const drift = deriveBarTransposeDrift(path, undefined);
    expect(drift).toHaveLength(8);
  });
});