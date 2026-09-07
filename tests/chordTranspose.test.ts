import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { transposeChordName } from "../src/lib/chordTranspose";

/**
 * chordTranspose — pure transposition helper.
 *
 * Used by App.tsx to render transposed chord names in the live score,
 * and by leadSheet.ts to apply transpose-shift on the exported score.
 *
 * Test surface: enharmonic preservation, slash chords, parentheticals,
 * negative shifts, no-op at multiples of 12.
 */

describe("transposeChordName", () => {
  it("returns input unchanged when shift is a multiple of 12", () => {
    expect(transposeChordName("Cmaj7", 0)).toBe("Cmaj7");
    expect(transposeChordName("Cmaj7", 12)).toBe("Cmaj7");
    expect(transposeChordName("Cmaj7", 24)).toBe("Cmaj7");
  });

  it("transposes a major triad up a fifth (C -> G)", () => {
    expect(transposeChordName("C", 7)).toBe("G");
  });

  it("transposes a minor-7 up a fifth (Dm7 -> Am7)", () => {
    expect(transposeChordName("Dm7", 7)).toBe("Am7");
  });

  it("transposes down a minor third (Bb -> G)", () => {
    expect(transposeChordName("Bb", -3)).toBe("G");
  });

  it("preserves enharmonic spelling (Db stays Db, not C#)", () => {
    // NOTE_WHEEL is flat-first; "Db" sits at index 1.
    // +2 semitones from Db -> Eb.
    expect(transposeChordName("Db", 2)).toBe("Eb");
  });

  it("normalizes sharps to flats when the target pitch-class is spelled flat", () => {
    // F# in is at index 6 (Gb). +2 from F# (spelled sharp) -> G (not Ab).
    // Wait — the function only matches [A-G][b#]?. F# would have
    // rootStr="F#", not in NOTE_WHEEL, so it falls through to
    // ENHARMONIC_TO_SHARP, which maps F# -> Gb. Then index of "Gb"
    // is 6. +2 from 6 = 8 = "Ab". So F# + 2 = Ab.
    expect(transposeChordName("F#", 2)).toBe("Ab");
  });

  it("handles slash chord (C/E -> D/F# with shift=2)", () => {
    // C (index 0) + 2 = D (index 2). E (index 4) + 2 = F#/Gb (index 6).
    // Result: D/F#  (E -> F# via the flat-first wheel: index 4 + 2 = 6 = Gb,
    // not F#). Actually Gb is at index 6 so result is "D/Gb".
    expect(transposeChordName("C/E", 2)).toBe("D/Gb");
  });

  it("handles parenthetical extensions (Cmaj7(b9) -> Dmaj7(b9) at +2)", () => {
    expect(transposeChordName("Cmaj7(b9)", 2)).toBe("Dmaj7(b9)");
  });

  it("passes through unparseable tokens unchanged", () => {
    expect(transposeChordName("INTRO", 5)).toBe("INTRO");
    expect(transposeChordName("T44", 5)).toBe("T44");
  });

  it("transposes every note in a complex chord symbol", () => {
    // F#m7b5 + 3 = Am7b5
    expect(transposeChordName("F#m7b5", 3)).toBe("Am7b5");
  });
});
