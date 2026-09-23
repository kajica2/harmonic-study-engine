/**
 * engine/compose/tempo.test.ts - PRD-001 Phase 4 Slice 1 (test plan 2).
 *
 * The classic SMF denominator trap is pinned FIRST (the DTO already
 * carries the REAL denominator - @tonejs/midi converts the byte code),
 * then exact-rational tempo-map math, meter-aware bar boundaries, and
 * the 4-minute default window.
 */

import { describe, it, expect } from "vitest";
import {
  ticksPerBar,
  barBoundaries,
  ticksToSeconds,
  secondsToTicks,
  defaultWindow,
} from "./tempo";
import type { NormalizedProject, ProjectTimeSignature } from "./types";

function ts(numerator: number, denominator: number, tick = 0): ProjectTimeSignature {
  return { tick, numerator, denominator };
}

function proj(over: Partial<NormalizedProject> = {}): NormalizedProject {
  return {
    version: 1,
    format: 1,
    ppq: 480,
    name: "t",
    fileName: "t.mid",
    tempos: [{ tick: 0, bpm: 120 }],
    timeSignatures: [ts(4, 4)],
    keySignatures: [],
    tracks: [],
    endTick: 0,
    durationSec: 0,
    warnings: [],
    ...over,
  };
}

describe("ticksPerBar (REAL denominator; the SMF-code trap)", () => {
  it("4/4 at ppq 480 -> 1920 ticks", () => {
    expect(ticksPerBar(480, ts(4, 4))).toBe(1920);
  });
  it("3/4 -> 1440", () => {
    expect(ticksPerBar(480, ts(3, 4))).toBe(1440);
  });
  it("6/8 -> 3*ppq = 1440 (six eighths = three quarters)", () => {
    // DESIGN NOTE: the S1 test-plan line says "720" - that is a doc
    // typo (720 is 3/8). The authoritative formula num*ppq*4/den AND the
    // design's own rhythm.ts cross-check (12 sixteenth-steps x ppq/4)
    // both give 1440. Pinned here against the formula.
    expect(ticksPerBar(480, ts(6, 8))).toBe(1440);
  });
  it("5/4 -> 2400; 7/8 -> 1680 (3.5 quarters)", () => {
    expect(ticksPerBar(480, ts(5, 4))).toBe(2400);
    expect(ticksPerBar(480, ts(7, 8))).toBe(1680);
  });
  it("consumes the REAL denominator (8), never the raw code (3)", () => {
    // A raw-code 3 (=> eighth) would compute 6*480*4/3 = 3840 (wrong).
    // The DTO carries 8, so we get 1440. normalize owns conversion.
    expect(ticksPerBar(480, ts(6, 8))).toBe(1440);
    expect(ticksPerBar(480, ts(6, 3))).toBe(3840); // proof the code value is not what we store
  });
});

describe("ticksToSeconds / secondsToTicks (piecewise tempo map)", () => {
  const map = proj({
    tempos: [
      { tick: 0, bpm: 120 },
      { tick: 1920, bpm: 60 },
    ],
    endTick: 2400,
  });

  it("exact rational: 1920 ticks at 120bpm = 2.0s", () => {
    expect(ticksToSeconds(map, 1920)).toBeCloseTo(2.0, 10);
  });
  it("exact rational: +480 ticks at 60bpm = +1.0s", () => {
    expect(ticksToSeconds(map, 2400)).toBeCloseTo(3.0, 10);
  });
  it("secondsToTicks inverts across the change", () => {
    expect(secondsToTicks(map, 2.0)).toBeCloseTo(1920, 6);
    expect(secondsToTicks(map, 3.0)).toBeCloseTo(2400, 6);
  });
  it("round-trip identity at the 4-minute mark (constant tempo)", () => {
    const p = proj({ endTick: 300000 });
    const t = secondsToTicks(p, 240);
    expect(t).toBeCloseTo(230400, 6); // 240s * 480ppq * 120bpm / 60
    expect(ticksToSeconds(p, t)).toBeCloseTo(240, 6);
  });
});

describe("barBoundaries (meter-change aware, tick-derived)", () => {
  it("tiles 4/4 bars up to endTick", () => {
    const p = proj({ endTick: 5760 }); // 3 bars of 1920
    const bars = barBoundaries(p);
    expect(bars.length).toBe(3);
    expect(bars[0]).toEqual({ startTick: 0, endTick: 1920, timeSignature: ts(4, 4) });
    expect(bars[2].endTick).toBe(5760);
  });
  it("switches bar length at a mid-file meter change", () => {
    const p = proj({
      timeSignatures: [ts(4, 4, 0), ts(3, 4, 1920)],
      endTick: 3360,
    });
    const bars = barBoundaries(p);
    expect(bars.length).toBe(2);
    expect(bars[0].endTick).toBe(1920);
    expect(bars[1].timeSignature.numerator).toBe(3);
    expect(bars[1].endTick).toBe(3360);
  });
  it("rounds a pathological odd-ppq 7/8 bar to integer ticks", () => {
    // 7 * 91 * 4 / 8 = 318.5 -> Math.round -> 319
    const p = proj({ ppq: 91, timeSignatures: [ts(7, 8)], endTick: 640 });
    const bars = barBoundaries(p);
    expect(bars[0].endTick).toBe(319);
    expect(bars[1].startTick).toBe(319);
  });
});

describe("defaultWindow (REQ-COMP-53)", () => {
  it("toTick is the 4-minute mark in ticks (not clamped)", () => {
    const p = proj({ endTick: 300000 });
    const w = defaultWindow(p);
    expect(w.fromTick).toBe(0);
    expect(w.toTick).toBe(230400);
    // truncated is the caller's job: endTick > toTick
    expect(p.endTick > w.toTick).toBe(true);
  });
  it("a short file yields a window past its end (not truncated)", () => {
    const p = proj({ endTick: 100000 });
    const w = defaultWindow(p);
    expect(p.endTick > w.toTick).toBe(false);
  });
});
