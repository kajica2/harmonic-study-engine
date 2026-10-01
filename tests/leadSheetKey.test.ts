/**
 * tests/leadSheetKey.test.ts - behavior pins for buildLeadSheetAbc's
 * key-signature derivation (A1) and the one-step-per-bar layout (A2).
 *
 * Environment: pure logic. Vitest's node project picks this file up
 * automatically (no jsdom, no audio singletons, no React).
 */

import { describe, it, expect } from "vitest";
import {
  abcKeySignature,
  buildLeadSheetAbc,
} from "../src/lib/leadSheet";
import type { HarmonicPath } from "../src/lib/paths";

describe("abcKeySignature (A1: real key signatures)", () => {
  it("defaults to C when key is undefined or empty", () => {
    expect(abcKeySignature(undefined, 0)).toBe("C");
    expect(abcKeySignature("", 0)).toBe("C");
    expect(abcKeySignature("   ", 0)).toBe("C");
  });

  it("returns the bare root when no transposition is applied", () => {
    expect(abcKeySignature("F", 0)).toBe("F");
    expect(abcKeySignature("Eb", 0)).toBe("Eb");
    expect(abcKeySignature("Bb", 0)).toBe("Bb");
    expect(abcKeySignature("F#", 0)).toBe("F#");
  });

  it("transposes by whole step for Bb trumpet", () => {
    expect(abcKeySignature("F", 2)).toBe("G");
    expect(abcKeySignature("Eb", 2)).toBe("F");
  });

  it("transposes by perfect fifth for F horn", () => {
    expect(abcKeySignature("Bb", 7)).toBe("F");
  });

  it("detects minor by trailing dash (repo convention, e.g. 'G-')", () => {
    expect(abcKeySignature("G-", 0)).toBe("Gm");
    expect(abcKeySignature("G-", 2)).toBe("Am");
  });

  it("detects minor by trailing m / min / minor (case-insensitive)", () => {
    expect(abcKeySignature("Gm", 0)).toBe("Gm");
    expect(abcKeySignature("Gmin", 0)).toBe("Gm");
    expect(abcKeySignature("G minor", 0)).toBe("Gm");
    expect(abcKeySignature("G MINOR", 0)).toBe("Gm");
  });

  it("uses the starting key for progressive-tonality drift ('D minor → C major')", () => {
    expect(abcKeySignature("D minor → C major", 0)).toBe("Dm");
    // Transposed: D + 2 = E
    expect(abcKeySignature("D minor → C major", 2)).toBe("Em");
  });
});

describe("buildLeadSheetAbc — one step = one bar (A2: form-truthful)", () => {
  it("emits one ABC bar per HarmonicStep, with K: from path.key", () => {
    const path: HarmonicPath = {
      id: "f-test",
      title: "F test",
      description: "",
      key: "F",
      steps: [
        { name: "Fmaj7", notes: [60, 64, 67, 71], descriptions: "" },
        { name: "Bm7b5", notes: [65, 68, 72, 75], descriptions: "" },
        { name: "E7", notes: [64, 68, 71, 74], descriptions: "" },
        { name: "Am7", notes: [69, 72, 76, 79], descriptions: "" },
      ],
    };
    const abc = buildLeadSheetAbc(path, "Concert");
    // Header uses the path's real key, NOT the legacy hardcoded "K:C".
    expect(abc).toContain("K:F");
    // Exactly 4 bar tokens (one per step); one symbol per bar.
    const symbolCount = (abc.match(/"\^/g) || []).length;
    expect(symbolCount).toBe(4);
    const barCount = (abc.match(/\|/g) || []).length;
    expect(barCount).toBe(8); // 4 bars × 2 `|` per bar
  });

  it("defaults K: to C when path.key is not set", () => {
    const path: HarmonicPath = {
      id: "no-key",
      title: "No key",
      description: "",
      steps: [
        { name: "C", notes: [60, 64, 67], descriptions: "" },
        { name: "G", notes: [67, 71, 74], descriptions: "" },
      ],
    };
    const abc = buildLeadSheetAbc(path, "Concert");
    expect(abc).toContain("K:C");
    expect(abc).not.toContain("Modulates:");
  });

  it("emits a %%text Modulates footer for progressive-tonality keys", () => {
    const path: HarmonicPath = {
      id: "prog",
      title: "Progressive",
      description: "",
      key: "D minor → C major",
      steps: [
        { name: "Dm", notes: [62, 65, 69], descriptions: "" },
        { name: "C", notes: [60, 64, 67], descriptions: "" },
      ],
    };
    const abc = buildLeadSheetAbc(path, "Concert");
    expect(abc).toContain("K:Dm");
    expect(abc).toContain("%%text Modulates: D minor → C major");
  });

  it("emits one bar per step for an 8-step C-major fixture (no form truncation)", () => {
    const path: HarmonicPath = {
      id: "c8",
      title: "8 bars C",
      description: "",
      key: "C",
      steps: [
        { name: "C", notes: [60], descriptions: "" },
        { name: "C", notes: [60], descriptions: "" },
        { name: "C", notes: [60], descriptions: "" },
        { name: "C", notes: [60], descriptions: "" },
        { name: "G", notes: [67], descriptions: "" },
        { name: "G", notes: [67], descriptions: "" },
        { name: "G", notes: [67], descriptions: "" },
        { name: "G", notes: [67], descriptions: "" },
      ],
    };
    const abc = buildLeadSheetAbc(path, "Concert");
    // 8 steps × 2 `|` per bar = 16
    expect((abc.match(/\|/g) || []).length).toBe(16);
  });

  it("truncates to form and adds a repeats footer when steps exceed formLen", () => {
    // 4-step form repeated 3x = 12 steps. detectFormPeriod -> 4;
    // totalFormBars -> 4. Footer reports the repeats.
    const form = [
      { name: "C", notes: [60], descriptions: "" },
      { name: "F", notes: [65], descriptions: "" },
      { name: "G", notes: [67], descriptions: "" },
      { name: "C", notes: [60], descriptions: "" },
    ];
    const padded: HarmonicPath = {
      id: "form3x",
      title: "Form x3",
      description: "",
      steps: [...form, ...form, ...form],
    };
    const abc = buildLeadSheetAbc(padded, "Concert");
    // 4 form bars rendered (each contributes 2 `|`).
    expect((abc.match(/\|/g) || []).length).toBe(8);
    expect(abc).toContain("%%text Form: 4 bars, repeats 3x in practice.");
  });
});

describe("buildLeadSheetAbc — opt-in arpStyle (even arpeggiation)", () => {
  const path: HarmonicPath = {
    id: "arp-style",
    title: "Arp style",
    description: "",
    key: "C",
    steps: [
      { name: "Cmaj7", notes: [60, 64, 67, 71], descriptions: "" },
      { name: "Fmaj7", notes: [65, 69, 72, 76], descriptions: "" },
    ],
  };

  it("default output is byte-identical to explicit quarters", () => {
    expect(buildLeadSheetAbc(path, "Concert")).toBe(
      buildLeadSheetAbc(path, "Concert", "quarters"),
    );
  });

  it("default quarters keeps the legacy overflow bracket for 5+ note chords", () => {
    const five: HarmonicPath = {
      id: "five",
      title: "Five",
      description: "",
      key: "C",
      steps: [{ name: "Cmaj9", notes: [60, 64, 67, 71, 74], descriptions: "" }],
    };
    const abc = buildLeadSheetAbc(five, "Concert");
    // Frozen legacy: first 4 notes as quarters, 5th tacked on as an
    // 8th inside the (malformed) bracket syntax.
    expect(abc).toContain("c'4 e'4 g'4 b'4 [d''8]");
  });

  it("eighths emits 8 eighth notes per bar with no overflow brackets", () => {
    const abc = buildLeadSheetAbc(path, "Concert", "eighths");
    // 2 bars x 8 eighth tokens = 16 "8" duration tokens.
    expect((abc.match(/[a-g][',]*8/g) || []).length).toBe(16);
    // No overflow bracket syntax, no mixed quarter durations.
    expect(abc).not.toContain("[");
    expect(abc).not.toContain("]");
    expect((abc.match(/[a-g][',]*4/g) || []).length).toBe(0);
  });

  it("eighths repeats the chord ascending (2 passes of a 4-note chord)", () => {
    const abc = buildLeadSheetAbc(path, "Concert", "eighths");
    const bar = abc.match(/\| [^|]+ \|/g)?.[0] ?? "";
    // First bar: C E G B C E G B (concert pitches, abcjs octave suffix).
    expect(bar).toContain("c'8 e'8 g'8 b'8 c'8 e'8 g'8 b'8");
  });

  it("triplets emits 12 triplet eighths grouped by the (3 prefix", () => {
    const abc = buildLeadSheetAbc(path, "Concert", "triplets");
    // 2 bars x 4 triplet groups = 8 "(3" prefixes.
    expect((abc.match(/\(3/g) || []).length).toBe(8);
    // 2 bars x 12 eighth tokens = 24.
    expect((abc.match(/[a-g][',]*8/g) || []).length).toBe(24);
    expect(abc).not.toContain("[");
    expect(abc).not.toContain("]");
  });

  it("triplets groups every 3 notes into a tuplet", () => {
    const abc = buildLeadSheetAbc(path, "Concert", "triplets");
    const bar = abc.match(/\| [^|]+ \|/g)?.[0] ?? "";
    // 4 groups of (3 + 3 eighths = 12 notes = 4 beats.
    expect(bar).toContain("(3c'8 e'8 g'8 (3b'8 c'8 e'8 (3g'8 b'8 c'8 (3e'8 g'8 b'8");
  });
});