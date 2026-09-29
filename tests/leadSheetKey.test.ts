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