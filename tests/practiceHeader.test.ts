import { describe, it, expect } from "vitest";
import {
  formatChordReadout,
  currentBarNumber,
  formatStepEyebrow,
  formatTempo,
} from "../src/lib/practiceHeader";
import type { HarmonicPath } from "../src/lib/paths";

/**
 * practiceHeader — pure formatters for the PracticeHeader.
 *
 * The test cases pin:
 *   - bar math (1-based, handles 4/4 vs 6/8 differently)
 *   - empty/missing path fallback
 *   - rounding for tempo
 *   - eyebrow wording (matches existing "Step N of M" copy)
 */

function makePath(stepCount: number): HarmonicPath {
  return {
    id: "test",
    title: "Test",
    description: "",
    steps: Array.from({ length: stepCount }, (_, i) => ({
      name: `Cmaj${i % 7 === 0 ? 7 : ""}`,
      notes: [60, 64, 67],
      descriptions: "",
    })),
  };
}

describe("formatChordReadout", () => {
  it("renders bar / total — chord", () => {
    const path = makePath(16); // 4 bars at 4/4
    expect(formatChordReadout(path, 0, "Cmaj7", "4/4")).toBe("Bar 1/4 — Cmaj7");
    expect(formatChordReadout(path, 4, "Fmaj7", "4/4")).toBe("Bar 2/4 — Fmaj7");
    expect(formatChordReadout(path, 12, "Cmaj7", "4/4")).toBe("Bar 4/4 — Cmaj7");
  });

  it("handles 6/8 with 6 steps per bar", () => {
    const path = makePath(12); // 2 bars at 6/8
    expect(formatChordReadout(path, 0, "Cmaj7", "6/8")).toBe("Bar 1/2 — Cmaj7");
    expect(formatChordReadout(path, 6, "Fmaj7", "6/8")).toBe("Bar 2/2 — Fmaj7");
  });

  it("falls back to a placeholder when path is empty", () => {
    expect(formatChordReadout(undefined, 0, "Cmaj7", "4/4")).toBe("—");
    expect(formatChordReadout(makePath(0), 0, "Cmaj7", "4/4")).toBe("—");
  });

  it("substitutes em-dash when chord name is empty", () => {
    const path = makePath(4);
    expect(formatChordReadout(path, 0, "", "4/4")).toBe("Bar 1/1 — —");
  });
});

describe("currentBarNumber", () => {
  it("returns 1-based current and total", () => {
    expect(currentBarNumber(makePath(16), 0, "4/4")).toEqual({ current: 1, total: 4 });
    expect(currentBarNumber(makePath(16), 8, "4/4")).toEqual({ current: 3, total: 4 });
  });

  it("returns null for an empty path", () => {
    expect(currentBarNumber(undefined, 0)).toBeNull();
    expect(currentBarNumber(makePath(0), 0)).toBeNull();
  });
});

describe("formatStepEyebrow", () => {
  it("renders 'Step N of M' wording", () => {
    expect(formatStepEyebrow(makePath(16), 0)).toBe("Step 1 of 16");
    expect(formatStepEyebrow(makePath(16), 15)).toBe("Step 16 of 16");
  });

  it("returns empty string for missing path", () => {
    expect(formatStepEyebrow(undefined, 0)).toBe("");
    expect(formatStepEyebrow(makePath(0), 0)).toBe("");
  });
});

describe("formatTempo", () => {
  it("renders whole-number tempos with ' bpm' suffix", () => {
    expect(formatTempo(120)).toBe("120 bpm");
    expect(formatTempo(60)).toBe("60 bpm");
    expect(formatTempo(240)).toBe("240 bpm");
  });

  it("rounds fractional tempos", () => {
    expect(formatTempo(120.4)).toBe("120 bpm");
    expect(formatTempo(120.6)).toBe("121 bpm");
  });
});
