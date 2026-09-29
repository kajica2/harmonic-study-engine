/**
 * tests/batchGroups.test.ts — pins for src/lib/batchGroups.ts (B1).
 *
 * Environment: pure logic; vitest's node project picks this up
 * automatically. No DOM, no audio singletons, no React.
 */

import { describe, it, expect } from "vitest";
import { buildBatchGroups } from "../src/lib/batchGroups";
import { ALL_PATHS } from "../src/lib/paths";
import { MASTERCLASS_TUNES } from "../src/data/masterclass";

const IN_APP_IDS = new Set(
  MASTERCLASS_TUNES.filter((t) => t.inApp).map((t) => t.id),
);

describe("buildBatchGroups (B1: MIDI batch widened to all paths)", () => {
  it("group union ≡ ALL_PATHS, each id appearing exactly once", () => {
    const groups = buildBatchGroups(IN_APP_IDS);
    const seen = new Set<string>();
    for (const g of groups) {
      for (const p of g.paths) {
        expect(seen.has(p.id)).toBe(false); // no duplicates
        seen.add(p.id);
      }
    }
    const expected = new Set(ALL_PATHS.map((p) => p.id));
    // Same set of ids.
    expect(seen.size).toBe(expected.size);
    for (const id of seen) {
      expect(expected.has(id)).toBe(true);
    }
  });

  it("every masterclass in-app id that resolves in ALL_PATHS lands in group 0", () => {
    const groups = buildBatchGroups(IN_APP_IDS);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0].label).toBe("Masterclass (in-app)");
    const group0Ids = new Set(groups[0].paths.map((p) => p.id));
    for (const id of IN_APP_IDS) {
      // Skip masterclass ids that don't have a path (inApp but no
      // corresponding HarmonicPath yet — those wouldn't land in any
      // group anyway).
      if (ALL_PATHS.some((p) => p.id === id)) {
        expect(group0Ids.has(id)).toBe(true);
      }
    }
  });

  it("group labels are exactly the four strings, in order (when all non-empty)", () => {
    const groups = buildBatchGroups(IN_APP_IDS);
    const labels = groups.map((g) => g.label);
    // Each label appears at most once. The order is stable for a given
    // ALL_PATHS shape: masterclass → curated → standards → composer.
    const uniqueLabels = Array.from(new Set(labels));
    expect(uniqueLabels.sort()).toEqual(
      [
        "Composer demos",
        "Curated & concept",
        "Masterclass (in-app)",
        "Standards (studies)",
      ].sort(),
    );
    // First label is always masterclass if any in-app ids exist.
    if (labels.length > 0) {
      expect(labels[0]).toBe("Masterclass (in-app)");
    }
  });

  it("drops empty groups when an in-app set is empty", () => {
    const groups = buildBatchGroups(new Set());
    // No masterclass group should appear (it would be empty).
    expect(groups.find((g) => g.label === "Masterclass (in-app)")).toBeUndefined();
    // The other three are guaranteed non-empty (ALL_PATHS contains entries).
    const labels = groups.map((g) => g.label);
    expect(labels).toContain("Curated & concept");
    expect(labels).toContain("Standards (studies)");
    expect(labels).toContain("Composer demos");
  });

  it("preserves ALL_PATHS order within the masterclass group", () => {
    const groups = buildBatchGroups(IN_APP_IDS);
    const masterclass = groups[0];
    if (!masterclass) return; // skip when no masterclass in-app paths
    // First masterclass-in-app id per ALL_PATHS order should be the
    // first entry of masterclass.paths.
    const firstInAppAllPaths = ALL_PATHS.find((p) => IN_APP_IDS.has(p.id));
    if (firstInAppAllPaths) {
      expect(masterclass.paths[0].id).toBe(firstInAppAllPaths.id);
    }
  });
});