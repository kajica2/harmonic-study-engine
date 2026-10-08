/**
 * Tap-tempo math: pure decision layer extracted from App.tsx so the
 * rolling-history + bpm-clamp logic is testable without React.
 */

import { describe, it, expect } from "vitest";
import { computeTapTempo } from "../src/lib/tapTempo";

describe("computeTapTempo", () => {
  it("returns null bpm when there are no taps yet", () => {
    const r = computeTapTempo([], 1000);
    expect(r.bpm).toBe(null);
    expect(r.reset).toBe(false);
  });

  it("returns null bpm when there are fewer than 3 taps", () => {
    const r = computeTapTempo([1000, 1500], 2000);
    expect(r.bpm).toBe(null);
    expect(r.reset).toBe(false);
  });

  it("computes bpm from 3 taps at 120bpm intervals (500ms apart)", () => {
    // 60000ms / 500ms = 120 bpm
    const r = computeTapTempo([0, 500, 1000, 1500], 1500);
    expect(r.bpm).toBe(120);
    expect(r.reset).toBe(false);
  });

  it("clamps below MIN_BPM (30)", () => {
    // 4000ms intervals = 15 bpm, clamped to 30
    const r = computeTapTempo([0, 4000, 8000, 12000], 12000);
    expect(r.bpm).toBe(30);
  });

  it("clamps above MAX_BPM (240)", () => {
    // 200ms intervals = 300 bpm, clamped to 240
    const r = computeTapTempo([0, 200, 400, 600], 600);
    expect(r.bpm).toBe(240);
  });

  it("signals reset when the most recent tap was more than 2s ago", () => {
    // last tap was 3s ago — caller should clear and start over
    const r = computeTapTempo([0, 500, 1000], 4000);
    expect(r.bpm).toBe(null);
    expect(r.reset).toBe(true);
  });

  it("uses the last 4 taps, not the full history", () => {
    // Slow taps at the start (0..1200) + fast taps at the end
    // (1500..2100). The slow taps should be excluded by the WINDOW=4
    // rolling window; only [1200, 1500, 1800, 2100] participate →
    // intervals [300, 300, 300] → avg 300ms → 200 bpm.
    const r = computeTapTempo([0, 600, 1200, 1500, 1800, 2100], 2100);
    expect(r.bpm).toBe(200);
  });

  it("handles zero-interval taps without dividing by zero", () => {
    // pathological: two taps at the same instant (avgMs = 0)
    const r = computeTapTempo([0, 0, 0, 0], 0);
    expect(r.bpm).toBe(null);
  });
});
