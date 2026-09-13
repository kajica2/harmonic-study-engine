import { describe, it, expect } from "vitest";
import { loadStylePack, validateStylePack, allStylePacks, allStylePackIds } from "./stylePack";

describe("stylePack", () => {
  it("loads all 5 packs at module init", () => {
    expect(allStylePacks().length).toBe(5);
  });

  it("common-practice bans parallel 5ths", () => {
    const pack = loadStylePack("common-practice");
    expect(pack.constraints.forbiddenIntervals).toContain("parallelFifth");
    expect(pack.constraints.forbiddenIntervals).toContain("parallelOctave");
  });

  it("jazz does NOT ban parallel 5ths", () => {
    const pack = loadStylePack("jazz");
    expect(pack.constraints.forbiddenIntervals).not.toContain("parallelFifth");
  });

  it("modal bans parallel 5ths but allows modal mixture", () => {
    const pack = loadStylePack("modal");
    expect(pack.constraints.forbiddenIntervals).toContain("parallelFifth");
    expect(pack.constraints.allowedNCTs).toContain("modalMixture");
  });

  it("post-tonal allows everything", () => {
    const pack = loadStylePack("post-tonal");
    expect(pack.constraints.forbiddenIntervals.length).toBe(0);
    expect(pack.constraints.allowedNCTs.length).toBeGreaterThan(0);
  });

  it("validateStylePack rejects a pack missing constraints", () => {
    const r = validateStylePack({ id: "broken", name: "Broken" });
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("validateStylePack rejects non-object input", () => {
    expect(validateStylePack("not an object").ok).toBe(false);
    expect(validateStylePack(null).ok).toBe(false);
  });

  it("validateStylePack accepts a well-formed pack", () => {
    const pack = loadStylePack("jazz");
    expect(validateStylePack(pack).ok).toBe(true);
  });

  it("throws on unknown pack id", () => {
    expect(() => loadStylePack("does-not-exist" as any)).toThrow(/Unknown style pack/);
  });

  it("axis-system pack loads with empty forbiddenIntervals and a descriptive name", () => {
    const pack = loadStylePack("axis-system");
    expect(pack.id).toBe("axis-system");
    expect(pack.name).toMatch(/Axis system/i);
    expect(pack.constraints.forbiddenIntervals.length).toBe(0);
    // Modal mixture is the key device — axis modulation borrows from
    // parallel modes freely.
    expect(pack.constraints.allowedNCTs).toContain("modalMixture");
    // No required resolutions — axis modulations don't resolve to V.
    expect(pack.constraints.requiredResolutions.length).toBe(0);
  });

  it("allStylePackIds includes axis-system", () => {
    expect(allStylePackIds()).toContain("axis-system");
  });
});
