/**
 * countIn.test.ts - PRD-001 Phase 3 Slice 3 (T3). Node project
 * (src/lib pure logic).
 */

import { describe, it, expect } from "vitest";
import {
  countInBeats,
  countInDurationMs,
  countInMsPerBeat,
} from "./countIn";

describe("countInBeats (T3)", () => {
  it("one bar of 4 -> [4, 3, 2, 1]", () => {
    expect(countInBeats(1, 4)).toEqual([4, 3, 2, 1]);
  });

  it("two bars of 4 -> 8 ticks ending at 1", () => {
    const seq = countInBeats(2, 4);
    expect(seq).toHaveLength(8);
    expect(seq[0]).toBe(8);
    expect(seq[seq.length - 1]).toBe(1);
  });

  it("zero bars -> empty sequence", () => {
    expect(countInBeats(0, 4)).toEqual([]);
  });

  it("compound meter: 1 bar of 6/8 -> [6..1]", () => {
    expect(countInBeats(1, 6)).toEqual([6, 5, 4, 3, 2, 1]);
  });

  it("fractional inputs are rejected defensively", () => {
    expect(countInBeats(1.5, 4)).toEqual([]);
    expect(countInBeats(1, 3.5)).toEqual([]);
  });
});

describe("countInDurationMs / countInMsPerBeat (T3)", () => {
  // FIX ROUND (REVIEWER L3): the ORIGINAL T3 pins encoded the
  // design's flat quarter-pulse formula (60000/tempo for EVERY
  // meter). That is only correct for simple meters; in compound
  // meters (6/8, 7/8) the sequence counts eighth-beats while the
  // pace stayed quarter -> the pre-roll ran 2x slow vs the incoming
  // grid. The pins below were RE-DERIVED against the corrected
  // meter-aware formula (countInMsPerBeat -> stepsPerBeatFor, the
  // same beat-unit source rhythm.ts uses). Simple-meter numbers
  // are deliberately unchanged - the fix is compound-only.
  it("2 bars of 4/4 at 80 BPM -> 8 quarter-beats * 750 ms", () => {
    expect(countInDurationMs(2, 4, 80, "4/4")).toBe((2 * 4 * 60000) / 80);
  });

  it("simple meters keep the quarter pulse (stepsPerBeat 4)", () => {
    expect(countInMsPerBeat(120, "4/4")).toBe(500);
    expect(countInMsPerBeat(120, "11/4")).toBe(500);
    expect(countInMsPerBeat(120, "tintal")).toBe(500);
  });

  it("compound meters pace at the EIGHTH beat (fix round)", () => {
    // 6/8 at 120: engine grid beat = eighth = 250 ms (BEFORE the fix
    // this was 500 ms - 2x slow vs the grid while counting 6 ticks).
    expect(countInMsPerBeat(120, "6/8")).toBe(250);
    expect(countInMsPerBeat(120, "7/8")).toBe(250);
    // 1 bar of 6/8 at 120 -> 6 eighth-beats * 250 ms = ONE REAL
    // 6/8 bar (12 sixteenth steps * 125 ms), not two.
    expect(countInDurationMs(1, 6, 120, "6/8")).toBe(1500);
  });

  it("non-positive tempo -> 0 (no division blow-up)", () => {
    expect(countInDurationMs(1, 4, 0, "4/4")).toBe(0);
    expect(countInDurationMs(1, 4, -60, "4/4")).toBe(0);
    expect(countInMsPerBeat(0, "6/8")).toBe(0);
  });
});
