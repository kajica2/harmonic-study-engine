import { describe, it, expect } from "vitest";
import {
  seedSectionPathFromComposer,
  seedAllSectionDemoPaths,
  SECTION_COMPOSER_IDS,
} from "./composerSectionSeed";
import { MIN_PATH_BARS, MAX_PATH_BARS, STEPS_PER_BAR } from "./pathsHelpers";

describe("composerSectionSeed", () => {
  describe("seedSectionPathFromComposer", () => {
    it("generates a path for Stravinsky (bitonal)", () => {
      const path = seedSectionPathFromComposer("stravinsky");
      expect(path).toBeTruthy();
      expect(path!.composer).toBe("Stravinsky");
      // The Petrushka chord: C + F# (alternating)
      expect(path!.description).toMatch(/bitonal|tritone/i);
      expect(path!.techniques).toContain("kind:bitonal");
    });

    it("generates a path for Schoenberg (row)", () => {
      const path = seedSectionPathFromComposer("schoenberg");
      expect(path).toBeTruthy();
      expect(path!.techniques).toContain("kind:row");
      // First step should reference a row group
      expect(path!.steps[0].name).toMatch(/Row group 1/);
    });

    it("generates a path for Bartók (axis)", () => {
      const path = seedSectionPathFromComposer("bartok");
      expect(path).toBeTruthy();
      expect(path!.techniques).toContain("kind:axis");
      // Tonic axis: A C Eb F#
      expect(path!.steps[0].name).toMatch(/A.*tonic axis/);
    });

    it("generates a path for Cage (duration — silence)", () => {
      const path = seedSectionPathFromComposer("cage");
      expect(path).toBeTruthy();
      expect(path!.techniques).toContain("kind:duration");
      // All steps are silence placeholders (C4)
      expect(path!.steps[0].name).toMatch(/Silence/);
      expect(path!.steps[0].notes).toEqual([60]); // C4
    });

    it("generates a path for Eno (layer)", () => {
      const path = seedSectionPathFromComposer("brian-eno");
      expect(path).toBeTruthy();
      expect(path!.techniques).toContain("kind:layer");
      // Drone + Layer X description
      expect(path!.steps[0].name).toMatch(/Drone.*Layer/);
    });

    it("generates paths for generic-section composers (Stockhausen, Minimalists, Coleman, Shankar)", () => {
      for (const id of ["stockhausen", "minimalists", "ornette-coleman", "ravi-shankar"] as const) {
        const path = seedSectionPathFromComposer(id);
        expect(path).toBeTruthy();
        expect(path!.techniques).toContain("kind:section");
      }
    });

    it("returns null for a bar-chart composer", () => {
      expect(seedSectionPathFromComposer("beethoven")).toBeNull();
      expect(seedSectionPathFromComposer("coltrane")).toBeNull();
    });

    it("satisfies the 24-64 bar invariant", () => {
      for (const id of SECTION_COMPOSER_IDS) {
        const path = seedSectionPathFromComposer(id);
        expect(path).toBeTruthy();
        const bars = path!.steps.length / STEPS_PER_BAR;
        expect(bars).toBeGreaterThanOrEqual(MIN_PATH_BARS);
        expect(bars).toBeLessThanOrEqual(MAX_PATH_BARS);
      }
    });

    it("is mvpReady and tagged as composer-seed", () => {
      const path = seedSectionPathFromComposer("debussy");
      expect(path!.mvpReady).toBe(true);
      expect(path!.techniques).toContain("composer-seed");
      expect(path!.techniques).toContain("catalog-driven");
    });
  });

  describe("seedAllSectionDemoPaths", () => {
    it("returns 10 paths (one per section composer)", () => {
      const paths = seedAllSectionDemoPaths();
      expect(paths.length).toBe(10);
    });

    it("every path has a unique id", () => {
      const paths = seedAllSectionDemoPaths();
      const ids = new Set(paths.map((p) => p.id));
      expect(ids.size).toBe(paths.length);
    });
  });

  describe("SECTION_COMPOSER_IDS", () => {
    it("exposes 10 section composers", () => {
      expect(SECTION_COMPOSER_IDS.length).toBe(10);
    });
  });
});
