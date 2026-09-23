/**
 * engine/core/chords.test.ts - PRD-001 Phase 4 Slice 1 (test plan 9).
 *
 * Pins the D47 extraction: the moved tables are internally complete
 * (QUALITY_INTERVALS keys <-> NAME_SUFFIX keys), the accessors behave,
 * the spelling is byte-identical to the old etude/harmony pins, and -
 * crucially - engine/etude/harmony re-exports the SAME function
 * references (so etude tests + every importer are provably unchanged).
 */

import { describe, it, expect } from "vitest";
import {
  QUALITY_INTERVALS,
  NAME_SUFFIX,
  spellChordName,
  keyUsesFlats,
  chordQualities,
  qualityIntervals,
} from "./chords";
import {
  spellChordName as harmonySpellChordName,
  QUALITY_INTERVALS as harmonyQualityIntervals,
  NAME_SUFFIX as harmonyNameSuffix,
  keyUsesFlats as harmonyKeyUsesFlats,
} from "../etude/harmony";

describe("core/chords tables (D47 extraction)", () => {
  it("QUALITY_INTERVALS and NAME_SUFFIX share the exact key set", () => {
    const intervalKeys = Object.keys(QUALITY_INTERVALS).sort();
    const suffixKeys = Object.keys(NAME_SUFFIX).sort();
    expect(suffixKeys).toEqual(intervalKeys);
    expect(intervalKeys.length).toBe(17); // 17 quality symbols (design says "16", table has 17)
  });

  it("every quality starts on the root (0) and ascends", () => {
    for (const [q, iv] of Object.entries(QUALITY_INTERVALS)) {
      expect(iv[0], q).toBe(0);
      for (let i = 1; i < iv.length; i++) {
        expect(iv[i], `${q}[${i}]`).toBeGreaterThan(iv[i - 1]);
      }
    }
  });

  it("every NAME_SUFFIX value is ASCII", () => {
    for (const [q, s] of Object.entries(NAME_SUFFIX)) {
      expect(/^[ -~]*$/.test(s), q).toBe(true);
    }
  });

  it("chordQualities() lists every key once, in table order", () => {
    const q = chordQualities();
    expect(q).toEqual(Object.keys(QUALITY_INTERVALS));
    expect(new Set(q).size).toBe(q.length);
    expect(q).toContain("maj7");
    expect(q).toContain("halfdim");
  });

  it("qualityIntervals() returns the table row or null", () => {
    expect(qualityIntervals("maj7")).toEqual([0, 4, 7, 11]);
    expect(qualityIntervals("nope")).toBeNull();
  });
});

describe("core/chords spelling (identical to the old etude/harmony pins)", () => {
  it("uses flats in flat keys, sharps in sharp keys, ties flat", () => {
    expect(spellChordName(2, "m7", 0, "major")).toBe("Dm7"); // C major
    expect(spellChordName(1, "dom7", 0, "major")).toBe("Db7"); // tie flat
    expect(spellChordName(10, "dom7", 9, "major")).toBe("A#7"); // A major
    expect(spellChordName(3, "maj7", 3, "major")).toBe("Ebmaj7"); // Eb major
    expect(spellChordName(6, "dom7", 6, "minor")).toBe("F#7"); // F# minor
    expect(spellChordName(10, "dom7", 2, "minor")).toBe("Bb7"); // D minor
  });

  it("keyUsesFlats agrees with the family rule", () => {
    expect(keyUsesFlats(0, "major")).toBe(true); // C tie -> flat
    expect(keyUsesFlats(7, "major")).toBe(false); // G sharp side
    expect(keyUsesFlats(4, "minor")).toBe(false); // E minor sharp side
    expect(keyUsesFlats(9, "minor")).toBe(true); // A minor tie -> flat
  });
});

describe("etude/harmony re-export identity (zero behavior change)", () => {
  it("harmony re-exports the SAME bindings as core/chords", () => {
    expect(harmonySpellChordName).toBe(spellChordName);
    expect(harmonyQualityIntervals).toBe(QUALITY_INTERVALS);
    expect(harmonyNameSuffix).toBe(NAME_SUFFIX);
    expect(harmonyKeyUsesFlats).toBe(keyUsesFlats);
  });
});
