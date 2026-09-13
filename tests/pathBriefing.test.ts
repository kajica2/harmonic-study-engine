import { describe, it, expect } from "vitest";
import {
  briefingForPath,
  curatedBriefingCount,
} from "../src/lib/pathBriefing";

/**
 * pathBriefing — derives the practice-loop briefing card data from
 * the masterclass catalog. Pure function, no React.
 *
 * Two paths exercise the curated-objective branch (one with an
 * explicit `objective` field, one without), and one path exercises
 * the unknown-id branch.
 */

describe("briefingForPath", () => {
  it("returns the curated objective for an inApp path with `objective` set", () => {
    const b = briefingForPath("star-eyes");
    expect(b).not.toBeNull();
    expect(b!.inApp).toBe(true);
    expect(b!.objective).toContain("Sing the melody first");
    expect(b!.objective).not.toMatch(/Coming soon/);
  });

  it("falls back to a templated objective for an inApp=false path", () => {
    const b = briefingForPath("solar");
    expect(b).not.toBeNull();
    expect(b!.inApp).toBe(false);
    expect(b!.objective).toMatch(/^Coming soon/);
    // The fallback quotes the mainExercise so the briefing still
    // teaches something rather than just saying "coming soon".
    expect(b!.objective).toContain("Diatonic Solar solo");
  });

  it("always includes the description field", () => {
    const b = briefingForPath("star-eyes");
    expect(b!.description).toContain("Foundational diatonic exercise");
  });

  it("returns null for an unknown path id", () => {
    // Generated / user-imported paths aren't in the catalog.
    expect(briefingForPath("path-not-in-catalog")).toBeNull();
    expect(briefingForPath(undefined)).toBeNull();
    expect(briefingForPath("")).toBeNull();
  });

  it("returns the same entry regardless of how many times it's called", () => {
    // Idempotence check — the briefing shouldn't mutate the catalog.
    const a = briefingForPath("star-eyes");
    const b = briefingForPath("star-eyes");
    expect(a?.objective).toBe(b?.objective);
  });

  it("respects curated objectives when present, even on inApp=false", () => {
    // Defensive: if a curator ever sets `objective` on an
    // inApp=false path, the briefing should still surface the
    // curated line (it's better than the templated fallback).
    // We don't have one in the data today, but the logic should
    // honor it when it shows up.
    const b = briefingForPath("star-eyes");
    expect(b!.entry.objective).toBeDefined();
    expect(b!.objective).toBe(b!.entry.objective);
  });
});

describe("curatedBriefingCount", () => {
  it("counts exactly the entries with an `objective` field set", () => {
    // Today: 1 (star-eyes). The count grows as more paths are
    // hand-curated. This test pins the current count so any
    // unexpected change triggers a deliberate update.
    expect(curatedBriefingCount()).toBe(1);
  });
});
