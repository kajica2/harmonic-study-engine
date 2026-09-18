/**
 * src/lib/practiceHeader.test.ts — pure-formatter tests.
 *
 * Covers formatChordReadout, currentBarNumber, formatStepEyebrow,
 * formatTempo, and the new formatGuideToneTally (FUTURE_PLANNING
 * near-term #1: live guide-tone streak chip).
 */
import { describe, it, expect } from "vitest";
import {
  currentBarNumber,
  formatChordReadout,
  formatGuideToneTally,
  formatStepEyebrow,
  formatTempo,
} from "./practiceHeader";
import type { HarmonicPath } from "./paths";
import { emptyTrail } from "./guideToneTrail";

const makePath = (steps: number[]): HarmonicPath => ({
  id: "test",
  title: "Test Path",
  description: "",
  steps: steps.map((_, i) => ({
    name: `C${i}`,
    notes: [48, 52, 55],
    descriptions: "",
  })),
});

describe("formatChordReadout", () => {
  it("renders the bar and chord with a dash separator", () => {
    const p = makePath(Array(16).fill(0)); // 16 steps = 4 bars in 4/4
    expect(formatChordReadout(p, 4, "Cmaj7", "4/4")).toBe(
      "Bar 2/4 — Cmaj7",
    );
  });

  it("renders 1-based bar at step 0", () => {
    const p = makePath(Array(16).fill(0));
    expect(formatChordReadout(p, 0, "Cmaj7", "4/4")).toBe(
      "Bar 1/4 — Cmaj7",
    );
  });

  it("returns a placeholder for an empty path", () => {
    const p = makePath([]);
    expect(formatChordReadout(p, 0, "Cmaj7", "4/4")).toBe("—");
  });

  it("returns a placeholder for an undefined path", () => {
    expect(formatChordReadout(undefined, 0, "Cmaj7", "4/4")).toBe("—");
  });

  it("falls back to 4/4 when timeSignature is omitted", () => {
    const p = makePath(Array(16).fill(0));
    // No time sig arg -> uses DEFAULT_TIME_SIG (4/4).
    expect(formatChordReadout(p, 0, "Cmaj7")).toBe("Bar 1/4 — Cmaj7");
  });
});

describe("currentBarNumber", () => {
  it("returns null for an empty path", () => {
    const p = makePath([]);
    expect(currentBarNumber(p, 0, "4/4")).toBeNull();
  });

  it("returns null for undefined path", () => {
    expect(currentBarNumber(undefined, 0, "4/4")).toBeNull();
  });

  it("computes 1-based current and total bars", () => {
    const p = makePath(Array(32).fill(0)); // 8 bars
    expect(currentBarNumber(p, 12, "4/4")).toEqual({ current: 4, total: 8 });
  });
});

describe("formatStepEyebrow", () => {
  it("renders 1-based step count", () => {
    const p = makePath(Array(16).fill(0));
    expect(formatStepEyebrow(p, 0)).toBe("Step 1 of 16");
    expect(formatStepEyebrow(p, 4)).toBe("Step 5 of 16");
  });

  it("returns empty string for an empty path", () => {
    const p = makePath([]);
    expect(formatStepEyebrow(p, 0)).toBe("");
  });
});

describe("formatTempo", () => {
  it("rounds fractional tempos", () => {
    expect(formatTempo(120)).toBe("120 bpm");
    expect(formatTempo(120.4)).toBe("120 bpm");
    expect(formatTempo(120.6)).toBe("121 bpm");
  });
});

describe("formatGuideToneTally", () => {
  it("returns null when no notes have landed yet (don't distract)", () => {
    expect(formatGuideToneTally(emptyTrail())).toBeNull();
  });

  it("renders a check + cross tally when notes have landed", () => {
    // Simulate a trail with 3 guide hits and 1 missed.
    const trail = { totalNotes: 4, guideHits: 3, chordToneHits: 1, offNotes: 0 };
    expect(formatGuideToneTally(trail)).toBe("✓ 3 · ✗ 1");
  });

  it("counts chord-tone hits as missed (not guide tone)", () => {
    // totalNotes=5, guideHits=2 -> 3 missed (2 chord-tone + 1 off-note).
    const trail = { totalNotes: 5, guideHits: 2, chordToneHits: 2, offNotes: 1 };
    expect(formatGuideToneTally(trail)).toBe("✓ 2 · ✗ 3");
  });

  it("renders zero-zero when all notes are off (rare, but possible)", () => {
    const trail = { totalNotes: 2, guideHits: 0, chordToneHits: 0, offNotes: 2 };
    expect(formatGuideToneTally(trail)).toBe("✓ 0 · ✗ 2");
  });
});
