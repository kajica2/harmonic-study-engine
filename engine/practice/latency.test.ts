/**
 * engine/practice/latency.test.ts - PRD-001 Phase 7 S3 (D134).
 *
 * Median outlier/even-count, the HONESTY law (null when sparse -
 * NEVER a silent 0), clamp bounds 0/500, compensation composition,
 * garbage guards, and the D134.5 perfect-tap zero-residual derivation
 * pinned as a worked example.
 */

import { describe, it, expect } from "vitest";
import {
  clampInputLatency,
  compensationMs,
  medianOffset,
  MIN_TAP_PAIRS,
  OUTPUT_LATENCY_MAX,
} from "./latency";

function seq(base: number, step: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => base + i * step);
}

describe("medianOffset", () => {
  it("constants", () => {
    expect(MIN_TAP_PAIRS).toBe(8);
    expect(OUTPUT_LATENCY_MAX).toBe(500);
  });

  it("odd count: the middle element (outlier REJECTED)", () => {
    // 11 tight offsets around 40 + one wild 9000.
    const clicks = seq(0, 1000, 12);
    const taps = clicks.map((c, i) => (i < 11 ? c + 40 + (i % 3) : c + 9000));
    const med = medianOffset(clicks, taps);
    expect(med).not.toBeNull();
    expect(Math.abs(med! - 40)).toBeLessThanOrEqual(2);
  });

  it("even count: mean of the middle two", () => {
    const clicks = seq(0, 1000, 8);
    const offsets = [30, 32, 34, 36, 38, 40, 42, 44];
    const taps = clicks.map((c, i) => c + offsets[i]);
    const med = medianOffset(clicks, taps);
    expect(med).toBeCloseTo(37, 10); // (36 + 38) / 2
  });

  it("HONESTY: fewer than MIN_TAP_PAIRS -> null, NEVER 0", () => {
    const clicks = seq(0, 1000, 7);
    const taps = clicks.map((c) => c + 50);
    expect(medianOffset(clicks, taps)).toBeNull();
    expect(medianOffset([], [])).toBeNull();
  });

  it("garbage entries dropped; all-garbage -> null", () => {
    const clicks = seq(0, 1000, 10);
    const taps = clicks.map((c, i) => (i < 8 ? c + 45 : Number.NaN));
    expect(medianOffset(clicks, taps)).toBeCloseTo(45, 10);
    expect(
      medianOffset(
        Array(10).fill(Number.NaN),
        Array(10).fill(Number.POSITIVE_INFINITY),
      ),
    ).toBeNull();
  });
});

describe("clampInputLatency", () => {
  it("subtracts the browser output latency (D134 equation)", () => {
    expect(clampInputLatency(60, 20)).toBe(40);
  });

  it("clamps at 0 (negative residual) and OUTPUT_LATENCY_MAX", () => {
    expect(clampInputLatency(5, 20)).toBe(0);
    expect(clampInputLatency(9999, 0)).toBe(OUTPUT_LATENCY_MAX);
  });

  it("NaN/garbage -> 0-safe", () => {
    expect(clampInputLatency(Number.NaN, 10)).toBe(0);
    expect(clampInputLatency(100, Number.NaN)).toBe(100);
  });
});

describe("compensationMs", () => {
  it("composes input + output (the single-sum law, REQ-PRAC-41/42)", () => {
    expect(compensationMs(40, 20)).toBe(60);
  });

  it("clamps 0..800", () => {
    expect(compensationMs(500, 500)).toBe(800);
    expect(compensationMs(-10, 0)).toBe(0);
  });

  it("garbage -> 0-safe", () => {
    expect(compensationMs(Number.NaN, 30)).toBe(30);
    expect(compensationMs(30, Number.POSITIVE_INFINITY)).toBe(30);
  });
});

describe("D134.5 derivation: perfect tap -> EXACTLY zero residual", () => {
  it("stored input = median(rawOffsets) - output leaves 0 for a perfect tap", () => {
    // Emits at E_k; a perfect tap arrives at E_k + output + midiPath +
    // bias (the physical path). rawOffset = tap - click = output +
    // midiPath + bias. median(rawOffsets) - output = midiPath + bias =
    // the STORED input. compensated = tap - input - output = E_k.
    const output = 24;
    const midiPath = 7;
    const bias = 13;
    const clicks = seq(5000, 500, 16);
    const taps = clicks.map((c) => c + output + midiPath + bias);
    const raw = medianOffset(clicks, taps);
    expect(raw).not.toBeNull();
    const input = clampInputLatency(raw!, output);
    expect(input).toBeCloseTo(midiPath + bias, 10);
    const comp = compensationMs(input, output);
    // Every compensated tap lands exactly on its emission.
    for (let i = 0; i < clicks.length; i++) {
      expect(taps[i] - comp).toBeCloseTo(clicks[i], 10);
    }
  });

  it("the clamp floor keeps a negative bias honest (never < 0)", () => {
    // Output reported LARGER than the observed total path (browser
    // quirk): input floors at 0, compensation = output.
    const input = clampInputLatency(10, 25);
    expect(input).toBe(0);
    expect(compensationMs(input, 25)).toBe(25);
  });
});
