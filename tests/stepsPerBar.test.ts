/**
 * stepsPerBar — single source of truth for bar <-> step math
 * across the time-signature variants. Critical because:
 *   - The bar-strip in PlaySessionRail shows N bars
 *   - The loop range (loopStartBar / loopEndBar) is in bar units
 *   - LiveScoreDisplay computes a 4-bar context window
 *   - All three used to hard-code / 4 which was only correct for
 *     4/4 — committing the same kind of bug is one of those
 *     things that wouldn't surface until the catalog adds a
 *     non-4/4 study.
 */

import { describe, it, expect } from "vitest";
import { stepsPerBar } from "../src/lib/loopWav";

describe("stepsPerBar", () => {
  it("returns 4 for 4/4 (one chord per quarter note)", () => {
    expect(stepsPerBar("4/4")).toBe(4);
  });

  it("returns 6 for 6/8 (one chord per eighth note)", () => {
    expect(stepsPerBar("6/8")).toBe(6);
  });

  it("returns 7 for 7/8 (one chord per eighth note)", () => {
    expect(stepsPerBar("7/8")).toBe(7);
  });

  it("returns 11 for 11/4", () => {
    expect(stepsPerBar("11/4")).toBe(11);
  });

  it("returns 16 for tintal (16-beat Hindustani cycle)", () => {
    expect(stepsPerBar("tintal")).toBe(16);
  });

  it("falls back to the regex parser for unknown future meters", () => {
    // 3/4 should parse as 3; 5/8 as 5. These aren't in the union
    // but the switch statement's default delegates to beatsPerBar
    // which is just a numeric parser.
    expect(stepsPerBar("3/4")).toBe(3);
    expect(stepsPerBar("5/8")).toBe(5);
  });

  it("returns 4 for completely unparseable input", () => {
    expect(stepsPerBar("garbage")).toBe(4);
    expect(stepsPerBar("")).toBe(4);
  });
});

describe("bar <-> step conversions (boundary cases)", () => {
  // These tests pin the math: totalBars = ceil(steps / stepsPerBar).
  // The previous hard-coded / 4 would compute wrong totals for
  // any non-4/4 study.

  it("16 steps in 4/4 = 4 bars", () => {
    const sig = "4/4";
    const steps = 16;
    const totalBars = Math.ceil(steps / stepsPerBar(sig));
    expect(totalBars).toBe(4);
  });

  it("16 steps in 7/8 = 3 bars (with 2 extra steps in the last bar)", () => {
    // 16/7 = 2.28... rounds up to 3 bars. The last bar has 2
    // steps (16 - 2*7 = 2), not a full 7.
    const sig = "7/8";
    const steps = 16;
    const totalBars = Math.ceil(steps / stepsPerBar(sig));
    expect(totalBars).toBe(3);
  });

  it("16 steps in 11/4 = 2 bars (with 5 steps in the last bar)", () => {
    // 16/11 = 1.45... rounds up to 2 bars. The last bar has
    // 5 steps (16 - 11 = 5).
    const sig = "11/4";
    const steps = 16;
    const totalBars = Math.ceil(steps / stepsPerBar(sig));
    expect(totalBars).toBe(2);
  });

  it("16 steps in tintal = 1 bar (exact fit)", () => {
    expect(Math.ceil(16 / stepsPerBar("tintal"))).toBe(1);
  });

  it("loop range math: bar N starts at step N * stepsPerBar(sig)", () => {
    // 7/8: bar 2 starts at step 7
    expect(2 * stepsPerBar("7/8")).toBe(14);
    // 11/4: bar 2 starts at step 11
    expect(2 * stepsPerBar("11/4")).toBe(22);
    // tintal: bar 1 starts at step 16
    expect(1 * stepsPerBar("tintal")).toBe(16);
  });
});