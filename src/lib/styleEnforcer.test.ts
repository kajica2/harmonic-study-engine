import { describe, it, expect } from "vitest";
import { enforceStyle } from "./styleEnforcer";
import { loadStylePack } from "./stylePack";

describe("enforceStyle", () => {
  it("flags parallel fifths in common-practice style", () => {
    const pack = loadStylePack("common-practice");
    const verdict = enforceStyle({
      steps: [
        { melody: [60], counterline: [67] }, // C-G (P5)
        { melody: [62], counterline: [69] }, // D-A (P5) — parallel
      ],
      style: pack,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.violations.some((v) => v.type === "parallelFifth")).toBe(true);
  });

  it("does NOT flag parallel fifths in jazz style", () => {
    const pack = loadStylePack("jazz");
    const verdict = enforceStyle({
      steps: [
        { melody: [60], counterline: [67] },
        { melody: [62], counterline: [69] },
      ],
      style: pack,
    });
    expect(verdict.violations.some((v) => v.type === "parallelFifth")).toBe(false);
    expect(verdict.ok).toBe(true);
  });

  it("flags parallel octaves in modal style", () => {
    const pack = loadStylePack("modal");
    const verdict = enforceStyle({
      steps: [
        { melody: [60], counterline: [72] }, // C-C (P8)
        { melody: [62], counterline: [74] }, // D-D (P8)
      ],
      style: pack,
    });
    expect(verdict.violations.some((v) => v.type === "parallelOctave")).toBe(true);
  });

  it("returns ok=true for shorter-than-2-bars inputs", () => {
    const pack = loadStylePack("common-practice");
    expect(enforceStyle({ steps: [{ melody: [60], counterline: [67] }], style: pack }).ok).toBe(true);
    expect(enforceStyle({ steps: [], style: pack }).ok).toBe(true);
  });

  it("post-tonal allows parallel fifths", () => {
    const pack = loadStylePack("post-tonal");
    const verdict = enforceStyle({
      steps: [
        { melody: [60], counterline: [67] },
        { melody: [62], counterline: [69] },
      ],
      style: pack,
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.violations.length).toBe(0);
  });

  it("violations include the style name in their explanation", () => {
    const pack = loadStylePack("common-practice");
    const verdict = enforceStyle({
      steps: [
        { melody: [60], counterline: [67] },
        { melody: [62], counterline: [69] },
      ],
      style: pack,
    });
    if (verdict.violations.length > 0) {
      expect(verdict.violations[0].explanation).toContain("Common-Practice");
    }
  });
});
