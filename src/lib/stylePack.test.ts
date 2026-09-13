import { describe, it, expect } from "vitest";
import { loadStylePack, validateStylePack, allStylePacks } from "./stylePack";

describe("stylePack", () => {
  it("loads all 4 packs at module init", () => {
    expect(allStylePacks().length).toBe(4);
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
});
