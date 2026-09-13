/**
 * Unit tests for the audio-engine pure-logic helpers. We can't test the
 * actual Web Audio nodes without a running AudioContext, but the
 * helpers that compute gain ramps and saturation curves are pure and
 * testable.
 *
 * We export the helpers from audio.ts as a tiny side-band so vitest
 * (running in node env) can import them. The audio.ts module itself
 * imports window-only types, so it's not directly importable here.
 * Instead, the helpers live in audioHelpers.ts (pure module).
 */
import { describe, it, expect } from "vitest";
import { buildWarmthCurve, velocityToGain } from "./audioHelpers";

describe("buildWarmthCurve", () => {
  it("returns a Float32Array of the requested length", () => {
    const curve = buildWarmthCurve(1024, 2.5);
    expect(curve).toBeInstanceOf(Float32Array);
    expect(curve.length).toBe(1024);
  });

  it("maps the midpoint to ~0 (zero crossing preserved)", () => {
    // Midpoint index for length 1024 is 512.
    const curve = buildWarmthCurve(1024, 2.5);
    expect(Math.abs(curve[512])).toBeLessThan(0.01);
  });

  it("saturates to ~1 at the right edge (input = 1)", () => {
    const curve = buildWarmthCurve(1024, 2.5);
    expect(curve[1023]).toBeCloseTo(1.0, 3);
  });

  it("saturates to ~-1 at the left edge (input = -1)", () => {
    const curve = buildWarmthCurve(1024, 2.5);
    expect(curve[0]).toBeCloseTo(-1.0, 3);
  });

  it("is monotonic increasing (no discontinuities)", () => {
    const curve = buildWarmthCurve(1024, 2.5);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
    }
  });

  it("steeper k produces more aggressive saturation at moderate inputs", () => {
    // At x ≈ 0.5, higher k should yield output closer to 1.
    const soft = buildWarmthCurve(1024, 1.0);
    const hard = buildWarmthCurve(1024, 5.0);
    const mid = Math.floor(1024 * 0.75); // x = 0.5
    expect(Math.abs(hard[mid])).toBeGreaterThan(Math.abs(soft[mid]));
  });
});

describe("velocityToGain", () => {
  it("returns the floor (0.15) for velocity 0", () => {
    expect(velocityToGain(0)).toBe(0.15);
  });

  it("returns 1.0 for velocity 127 (max MIDI)", () => {
    expect(velocityToGain(127)).toBe(1.0);
  });

  it("is monotonic increasing for 0..127", () => {
    let prev = velocityToGain(0);
    for (let v = 1; v <= 127; v++) {
      const g = velocityToGain(v);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
  });

  it("returns values strictly in [0.15, 1.0]", () => {
    for (let v = 0; v <= 127; v++) {
      const g = velocityToGain(v);
      expect(g).toBeGreaterThanOrEqual(0.15);
      expect(g).toBeLessThanOrEqual(1.0);
    }
  });

  it("velocity 64 (middle) is roughly halfway between floor and 1", () => {
    const mid = velocityToGain(64);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.8);
  });
});