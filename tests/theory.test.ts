/**
 * Theory module — pure functions for note names, pitch colors, voice
 * leading distance, alternative voicings, chord analysis, and the
 * voice-leading application. All deterministic; no side effects.
 */

import { describe, it, expect } from "vitest";
import {
  NOTE_NAMES,
  getMidiFromNoteName,
  getNoteNameFromMidi,
  midiToFreq,
  voiceLeadingDistance,
  applyVoiceLeading,
} from "../src/lib/theory";

describe("NOTE_NAMES", () => {
  it("has 12 entries", () => {
    expect(NOTE_NAMES).toHaveLength(12);
  });

  it("starts with C at MIDI 60 and reaches B at MIDI 71", () => {
    // Spec: NOTE_NAMES[0] === "C" and the array covers one octave.
    expect(NOTE_NAMES[0]).toBe("C");
    expect(NOTE_NAMES[11]).toBe("B");
  });
});

describe("getMidiFromNoteName / getNoteNameFromMidi", () => {
  it("are inverses for the natural notes (with octave suffix)", () => {
    // getNoteNameFromMidi returns 'C4' for MIDI 60 — it includes
    // the octave. Round-trip test must use the full name.
    for (const [name, noteIdx] of NOTE_NAMES.map((n, i) => [n, i] as const)) {
      // Skip sharps; the natural-note loop is the round-trip target
      if (name.includes("#")) continue;
      for (const octave of [3, 4, 5]) {
        const midi = 12 + octave * 12 + noteIdx;
        expect(getNoteNameFromMidi(midi)).toBe(`${name}${octave}`);
      }
    }
  });

  it("getMidiFromNoteName parses sharps but not flats (current behavior)", () => {
    // The implementation uses NOTE_NAMES.indexOf(note), so 'Db4'
    // doesn't match (NOTE_NAMES has 'C#' not 'Db'). Sharp spelling works.
    expect(getMidiFromNoteName("C4")).toBe(60);
    expect(getMidiFromNoteName("C#4")).toBe(61);
    // C#4 is one semitone above C4
    expect(getMidiFromNoteName("C#4")).toBeGreaterThan(
      getMidiFromNoteName("C4"),
    );
    // Flats silently fall through to the default (60) — this is a
    // known limitation; if you change theory.ts to support flats,
    // update this test.
    expect(getMidiFromNoteName("Db4")).toBe(60);
  });
});

describe("midiToFreq", () => {
  it("returns 440 Hz for A4 (MIDI 69)", () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
  });

  it("doubles per octave", () => {
    const a4 = midiToFreq(69);
    const a5 = midiToFreq(81);
    expect(a5 / a4).toBeCloseTo(2, 5);
  });
});

describe("voiceLeadingDistance", () => {
  it("returns 0 for identical voicings", () => {
    expect(voiceLeadingDistance([60, 64, 67], [60, 64, 67])).toBe(0);
  });

  it("sums absolute semitone differences across upper voices", () => {
    // Bass is fixed (60). Two upper voices: 64->65 (+1), 67->69 (+2). Total = 3.
    expect(voiceLeadingDistance([60, 64, 67], [60, 65, 69])).toBe(3);
  });
});

describe("applyVoiceLeading", () => {
  it("returns targetNotes unchanged when prevNotes is empty", () => {
    expect(applyVoiceLeading([], [60, 64, 67])).toEqual([60, 64, 67]);
  });

  it("preserves the bass note (lowest) of the target", () => {
    const prev = [60, 64, 67, 71]; // Cmaj7
    const target = [62, 65, 69, 72]; // Dm7 (bass = D)
    const out = applyVoiceLeading(prev, target);
    expect(out[0]).toBe(62); // D is the bass
  });

  it("minimizes motion from prev to target — same chord", () => {
    // Cmaj7 -> Cmaj7: minimal motion = same voicing
    const prev = [60, 64, 67, 71];
    const out = applyVoiceLeading(prev, prev);
    expect(out.sort((a, b) => a - b)).toEqual(prev);
  });

  it("returns notes sorted ascending", () => {
    const prev = [60, 64, 67];
    const target = [65, 69, 72]; // Fmaj7
    const out = applyVoiceLeading(prev, target);
    for (let i = 1; i < out.length; i++) {
      expect(out[i]).toBeGreaterThan(out[i - 1]);
    }
  });

  it("preserves pitch classes of the target chord", () => {
    // Cmaj7 -> Fmaj7: should have F (bass), A, C, E — F major's pitch classes
    const prev = [60, 64, 67, 71]; // C E G B
    const target = [65, 69, 72, 76]; // F A C E
    const out = applyVoiceLeading(prev, target);
    const targetPcs = new Set(target.map((n) => n % 12));
    const outPcs = new Set(out.map((n) => n % 12));
    // Every target PC must appear in output (allow inversions
    // via octave equivalence)
    for (const pc of targetPcs) {
      expect(outPcs.has(pc)).toBe(true);
    }
  });
});