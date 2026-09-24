/**
 * src/lib/playbackClock.test.ts - F3 (D110/D113) step-math pins.
 *
 * The two extracted pure formulas (secPerBarGrid, stepOfElapsed)
 * carry the clock's bar<->step truth; the class methods compose
 * them. Node-safe pure imports only, but the module pulls the
 * audio-engine chain via rhythm.ts -> registered in JSDOM_FILES.
 */
import { describe, it, expect } from "vitest";
import { secPerBarGrid, stepOfElapsed } from "./playbackClock";

describe("secPerBarGrid (blast-table #11)", () => {
  it("4/4 is byte-identical to the legacy 4-beats constant", () => {
    // legacy: (steps * 4 * 60) / bpm  ->  per step: 4 * 60/bpm
    expect(secPerBarGrid(120, 16)).toBe((16 / 4) * (60 / 120)); // 2s
    expect(secPerBarGrid(60, 16)).toBe(4);
    expect(secPerBarGrid(240, 16)).toBeCloseTo(1, 10);
  });

  it("compound meters stop lying (6/8 = 3 quarter-seconds)", () => {
    // 6/8: stepsPerMeasure 12 -> 12/4 = 3 quarter-note beats.
    expect(secPerBarGrid(120, 12)).toBeCloseTo(1.5, 10);
    // 7/8: 14/4 = 3.5 quarters; 11/4: 44/4 = 11 quarters.
    expect(secPerBarGrid(120, 14)).toBeCloseTo(1.75, 10);
    expect(secPerBarGrid(120, 44)).toBeCloseTo(5.5, 10);
  });
});

describe("stepOfElapsed (blast-table #12)", () => {
  it("advances ONE step per bar, not four", () => {
    const secPerBar = secPerBarGrid(240, 16); // 1s at 240 BPM 4/4
    expect(stepOfElapsed(0, secPerBar, 96)).toBe(0);
    expect(stepOfElapsed(0.999, secPerBar, 96)).toBe(0);
    expect(stepOfElapsed(1.0, secPerBar, 96)).toBe(1);
    expect(stepOfElapsed(3.5, secPerBar, 96)).toBe(3);
    // The legacy "* 4" law would have said 14 here.
  });

  it("wraps at the padded step count", () => {
    expect(stepOfElapsed(96, 1, 96)).toBe(0);
    expect(stepOfElapsed(97, 1, 96)).toBe(1);
  });

  it("degenerate inputs never divide by zero", () => {
    expect(stepOfElapsed(12, 0, 96)).toBe(12 % 96);
    // A zero/negative step count collapses to a single-slot track.
    expect(stepOfElapsed(12, 1, 0)).toBe(0);
    expect(stepOfElapsed(12, -1, -5)).toBe(0);
  });
});
