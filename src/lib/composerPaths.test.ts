import { describe, it, expect } from "vitest";
import {
  COMPOSER_PATHS,
  ALL_PATHS,
  findPathById,
} from "./paths";
import { MIN_PATH_BARS, MAX_PATH_BARS, STEPS_PER_BAR } from "./paths";

describe("composer-seeded paths (19th century)", () => {
  it("includes 7 19th-century composers", () => {
    expect(COMPOSER_PATHS.length).toBe(7);
    const composers = new Set(
      COMPOSER_PATHS.map((p) => p.composer).filter(Boolean),
    );
    // The catalog's 19th-century composers
    expect(composers).toContain("Beethoven");
    expect(composers).toContain("Schubert");
    expect(composers).toContain("Berlioz");
    expect(composers).toContain("Chopin");
    expect(composers).toContain("Liszt");
    expect(composers).toContain("Wagner");
    expect(composers).toContain("Verdi");
  });

  it("every composer path satisfies the 24-64 bar invariant", () => {
    for (const p of COMPOSER_PATHS) {
      const bars = p.steps.length / STEPS_PER_BAR;
      expect(bars).toBeGreaterThanOrEqual(MIN_PATH_BARS);
      expect(bars).toBeLessThanOrEqual(MAX_PATH_BARS);
    }
  });

  it("every composer path is mvpReady and has the composer-seed marker", () => {
    for (const p of COMPOSER_PATHS) {
      expect(p.mvpReady).toBe(true);
      expect(p.techniques).toContain("composer-seed");
    }
  });

  it("every composer path has a key signature extracted from the work context", () => {
    for (const p of COMPOSER_PATHS) {
      expect(p.key).toBeTruthy();
      // Key should look like "Cm", "F", "Bb", "Eb", "Ab", etc.
      expect(p.key).toMatch(/^[A-G][#b]?m?$/);
    }
  });

  it("appears in ALL_PATHS", () => {
    expect(ALL_PATHS.length).toBeGreaterThan(COMPOSER_PATHS.length);
    for (const p of COMPOSER_PATHS) {
      expect(ALL_PATHS).toContain(p);
    }
  });

  it("is findable via findPathById", () => {
    const beethoven = COMPOSER_PATHS.find((p) => p.composer === "Beethoven");
    expect(beethoven).toBeTruthy();
    const found = findPathById(beethoven!.id);
    expect(found).toBe(beethoven);
  });
});
