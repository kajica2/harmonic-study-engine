import { describe, it, expect } from "vitest";
import {
  seedPathFromComposer,
  seedAllDemoPaths,
  isComposerSeededPath,
  BAR_COMPOSER_IDS,
  SECTION_COMPOSER_IDS,
} from "./composerPathSeed";
import { MIN_PATH_BARS, MAX_PATH_BARS, STEPS_PER_BAR } from "./paths";

describe("composerPathSeed", () => {
  describe("seedPathFromComposer", () => {
    it("generates a path for a bar-chart composer (Beethoven)", () => {
      const path = seedPathFromComposer("beethoven");
      expect(path).toBeTruthy();
      expect(path!.id).toMatch(/seed-beethoven/);
      expect(path!.composer).toBe("Beethoven");
      expect(path!.key).toBe("Cm");
      expect(path!.techniques).toContain("composer-seed");
      expect(path!.mvpReady).toBe(true);
    });

    it("returns null for a section-only composer", () => {
      expect(seedPathFromComposer("debussy")).toBeNull();
      expect(seedPathFromComposer("cage")).toBeNull();
      expect(seedPathFromComposer("stravinsky")).toBeNull();
    });

    it("satisfies the 24-64 bar invariant", () => {
      for (const id of BAR_COMPOSER_IDS) {
        const path = seedPathFromComposer(id);
        expect(path).toBeTruthy();
        const bars = path!.steps.length / STEPS_PER_BAR;
        expect(bars).toBeGreaterThanOrEqual(MIN_PATH_BARS);
        expect(bars).toBeLessThanOrEqual(MAX_PATH_BARS);
      }
    });

    it("respects the targetBars option", () => {
      const path = seedPathFromComposer("chopin", { targetBars: 32 });
      expect(path).toBeTruthy();
      const bars = path!.steps.length / STEPS_PER_BAR;
      expect(bars).toBeGreaterThanOrEqual(32);
    });

    it("uses chord names as step names (for UI display)", () => {
      const path = seedPathFromComposer("john-coltrane");
      expect(path).toBeTruthy();
      const firstStep = path!.steps[0];
      // Coltrane's Giant Steps starts with Bmaj7
      expect(firstStep.name).toBe("Bmaj7");
      expect(firstStep.descriptions).toBe("I");
    });

    it("converts chord roots to valid MIDI notes", () => {
      const path = seedPathFromComposer("verdi");
      expect(path).toBeTruthy();
      // All notes should be valid MIDI (0-127) and in the C4-C5 range
      for (const step of path!.steps) {
        for (const note of step.notes) {
          expect(note).toBeGreaterThanOrEqual(0);
          expect(note).toBeLessThanOrEqual(127);
          expect(note).toBeGreaterThanOrEqual(60); // C4
          expect(note).toBeLessThan(84); // C6
        }
      }
    });
  });

  describe("seedAllDemoPaths", () => {
    it("returns one path per bar-chart composer (16 total)", () => {
      const paths = seedAllDemoPaths();
      expect(paths.length).toBe(BAR_COMPOSER_IDS.length);
      // Each path has a unique id
      const ids = new Set(paths.map((p) => p.id));
      expect(ids.size).toBe(paths.length);
    });

    it("every path satisfies the bar invariant", () => {
      const paths = seedAllDemoPaths();
      for (const p of paths) {
        const bars = p.steps.length / STEPS_PER_BAR;
        expect(bars).toBeGreaterThanOrEqual(MIN_PATH_BARS);
        expect(bars).toBeLessThanOrEqual(MAX_PATH_BARS);
      }
    });
  });

  describe("isComposerSeededPath", () => {
    it("returns true for paths seeded from the catalog", () => {
      const path = seedPathFromComposer("armstrong")!;
      expect(isComposerSeededPath(path)).toBe(true);
    });

    it("returns false for a hand-authored path (no composer-seed technique)", () => {
      const handAuthored = {
        id: "manual-1",
        title: "Manual path",
        description: "Test",
        steps: [],
        techniques: ["ii_v_i"],
      };
      expect(isComposerSeededPath(handAuthored)).toBe(false);
    });
  });

  describe("section-only composers", () => {
    it("are exposed via SECTION_COMPOSER_IDS (10 composers)", () => {
      expect(SECTION_COMPOSER_IDS.length).toBe(10);
    });
  });
});
