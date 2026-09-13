import { describe, it, expect } from "vitest";
import { applyPersonaFilter, angularRatio } from "./personaMelodyFilter";

describe("applyPersonaFilter", () => {
  it("neutral profile (default) returns melody unchanged", () => {
    const melody = [60, 64, 67, 65];
    const out = applyPersonaFilter({ melody, personaId: "eno", seed: 42 });
    expect(out).toEqual(melody);
  });

  it("unknown persona id → neutral behavior", () => {
    const melody = [60, 64, 67, 65];
    const out = applyPersonaFilter({ melody, personaId: "does-not-exist", seed: 42 });
    expect(out).toEqual(melody);
  });

  it("Coltrane profile (leaping) raises average interval", () => {
    // Start with all stepwise; the filter should push toward leaps.
    const seedMelody = [60, 62, 64, 65, 67, 69, 71, 72];
    const filtered = applyPersonaFilter({
      melody: seedMelody,
      personaId: "coltrane",
      seed: 42,
    });
    const avgLeap =
      filtered.slice(1).reduce((s, n, i) => s + Math.abs(n - filtered[i]), 0) /
      (filtered.length - 1);
    expect(avgLeap).toBeGreaterThan(4);
  });

  it("Coltrane is deterministic with the same seed", () => {
    const melody = [60, 62, 64, 65, 67];
    const a = applyPersonaFilter({ melody, personaId: "coltrane", seed: 7 });
    const b = applyPersonaFilter({ melody, personaId: "coltrane", seed: 7 });
    expect(a).toEqual(b);
  });

  it("Coltrane with different seeds → different output", () => {
    const melody = [60, 62, 64, 65, 67, 69, 71, 72];
    const a = applyPersonaFilter({ melody, personaId: "coltrane", seed: 1 });
    const b = applyPersonaFilter({ melody, personaId: "coltrane", seed: 2 });
    expect(a).not.toEqual(b);
  });

  it("Chet profile (stepwise) clamps max leap to ≤ 2 semitones", () => {
    const seedMelody = [60, 64, 67, 71]; // huge leaps
    const filtered = applyPersonaFilter({
      melody: seedMelody,
      personaId: "chet",
      seed: 42,
    });
    const maxLeap = Math.max(
      ...filtered.slice(1).map((n, i) => Math.abs(n - filtered[i])),
    );
    expect(maxLeap).toBeLessThanOrEqual(2);
  });

  it("Monk profile (angular) forces contour sign-alternation", () => {
    const seedMelody = [60, 62, 64, 66]; // all ascending
    const filtered = applyPersonaFilter({
      melody: seedMelody,
      personaId: "monk",
      seed: 42,
    });
    expect(angularRatio(filtered)).toBeGreaterThanOrEqual(0.66);
  });

  it("preserves length", () => {
    const melody = [60, 64, 67, 70, 72];
    expect(applyPersonaFilter({ melody, personaId: "coltrane", seed: 1 })).toHaveLength(5);
    expect(applyPersonaFilter({ melody, personaId: "chet", seed: 1 })).toHaveLength(5);
    expect(applyPersonaFilter({ melody, personaId: "monk", seed: 1 })).toHaveLength(5);
    expect(applyPersonaFilter({ melody, personaId: "eno", seed: 1 })).toHaveLength(5);
  });

  it("handles 1-note melody", () => {
    expect(applyPersonaFilter({ melody: [60], personaId: "coltrane", seed: 1 })).toEqual([60]);
  });

  it("handles empty melody", () => {
    expect(applyPersonaFilter({ melody: [], personaId: "chet", seed: 1 })).toEqual([]);
  });
});

describe("angularRatio", () => {
  it("returns 1 for fully alternating contour", () => {
    expect(angularRatio([60, 62, 60, 62, 60])).toBe(1);
  });
  it("returns 0 for monotone ascent", () => {
    expect(angularRatio([60, 62, 64, 66, 68])).toBe(0);
  });
  it("returns 1 for too-short melody", () => {
    expect(angularRatio([60])).toBe(1);
    expect(angularRatio([60, 62])).toBe(1);
  });
});
