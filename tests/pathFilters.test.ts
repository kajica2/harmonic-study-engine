import { describe, it, expect } from "vitest";
import {
  applyFilter,
  clearFilters,
  EMPTY_FILTER,
  isFiltering,
  selectedByCategory,
  toggleTag,
  TAG_CATEGORIES,
  TAG_LABEL,
} from "../src/lib/pathFilters";
import type { MasterclassEntry } from "../src/data/masterclass";

/**
 * pathFilters — pure filter logic for the masterclass picker.
 *
 * Tests pin:
 *   - empty state behavior (no filter = all entries)
 *   - toggle add / remove / dedup
 *   - AND across categories, OR within a category
 *   - untagged entries are excluded while a filter is active
 *   - tag vocabulary labels + categories are stable (a refactor
 *     that renames a tag would silently break data; pinning the
 *     label map makes the rename explicit)
 *   - selectedByCategory grouping
 *   - clearFilters resets to EMPTY_FILTER
 */

function entry(id: string, tags?: string[]): MasterclassEntry {
  return {
    id,
    title: id,
    classes: [],
    mainExercise: "",
    description: "",
    tags: tags as any,
    inApp: false,
  };
}

describe("isFiltering", () => {
  it("returns false when no tags are selected", () => {
    expect(isFiltering(EMPTY_FILTER)).toBe(false);
  });
  it("returns true when any tag is selected", () => {
    expect(isFiltering({ selected: ["foundation"] })).toBe(true);
  });
});

describe("toggleTag", () => {
  it("adds a tag when not present", () => {
    const s = toggleTag(EMPTY_FILTER, "foundation");
    expect(s.selected).toEqual(["foundation"]);
  });
  it("removes a tag when already present", () => {
    const s = toggleTag({ selected: ["foundation"] }, "foundation");
    expect(s.selected).toEqual([]);
  });
  it("does not mutate the input state", () => {
    const original: typeof EMPTY_FILTER = { selected: [] };
    const _ = toggleTag(original, "foundation");
    expect(original.selected).toEqual([]);
  });
  it("toggles multiple tags independently", () => {
    let s = toggleTag(EMPTY_FILTER, "foundation");
    s = toggleTag(s, "intermediate");
    s = toggleTag(s, "voice-leading");
    expect(s.selected).toEqual(["foundation", "intermediate", "voice-leading"]);
    s = toggleTag(s, "intermediate");
    expect(s.selected).toEqual(["foundation", "voice-leading"]);
  });
});

describe("clearFilters", () => {
  it("returns the EMPTY_FILTER state", () => {
    const cleared = clearFilters();
    expect(cleared).toEqual(EMPTY_FILTER);
    expect(isFiltering(cleared)).toBe(false);
  });
});

describe("applyFilter", () => {
  const catalog: MasterclassEntry[] = [
    entry("a", ["foundation", "voice-leading"]),
    entry("b", ["intermediate", "voice-leading", "ii-v-i"]),
    entry("c", ["advanced", "improv", "coltrane-cycle"]),
    entry("d", ["modal-interchange", "intermediate"]),
    entry("e"), // untagged
  ];

  it("returns all entries when no filter is active", () => {
    expect(applyFilter(catalog, EMPTY_FILTER)).toHaveLength(5);
  });

  it("filters by a single tag (any difficulty, voice-leading)", () => {
    const filtered = applyFilter(catalog, {
      selected: ["voice-leading"],
    });
    // a + b; c/d have voice-leading? c has improv + coltrane-cycle, d has modal-interchange
    expect(filtered.map((e) => e.id).sort()).toEqual(["a", "b"]);
  });

  it("AND across categories (foundation + voice-leading)", () => {
    const filtered = applyFilter(catalog, {
      selected: ["foundation", "voice-leading"],
    });
    expect(filtered.map((e) => e.id)).toEqual(["a"]);
  });

  it("OR within a category (intermediate OR advanced)", () => {
    const filtered = applyFilter(catalog, {
      selected: ["intermediate", "advanced"],
    });
    // b + c + d (a is foundation, e is untagged)
    expect(filtered.map((e) => e.id).sort()).toEqual(["b", "c", "d"]);
  });

  it("excludes untagged entries while a filter is active", () => {
    const filtered = applyFilter(catalog, { selected: ["foundation"] });
    // Only "a" has foundation; e is untagged and excluded.
    expect(filtered.map((e) => e.id)).toEqual(["a"]);
  });

  it("returns empty array when no entries match", () => {
    const filtered = applyFilter(catalog, {
      selected: ["rhythm-changes"],
    });
    expect(filtered).toEqual([]);
  });

  it("treats a 3-way AND as a single-category AND too (advanced + improv + coltrane-cycle → only c)", () => {
    const filtered = applyFilter(catalog, {
      selected: ["advanced", "improv", "coltrane-cycle"],
    });
    // All three are within different categories — c is the only one
    // that matches every category.
    expect(filtered.map((e) => e.id)).toEqual(["c"]);
  });
});

describe("selectedByCategory", () => {
  it("groups selected tags by their category label", () => {
    const grouped = selectedByCategory({
      selected: [
        "foundation",
        "intermediate",
        "voice-leading",
        "coltrane-cycle",
      ],
    });
    expect(grouped["Difficulty"]).toEqual(["foundation", "intermediate"]);
    expect(grouped["Goal"]).toEqual(["voice-leading"]);
    expect(grouped["Topic"]).toEqual(["coltrane-cycle"]);
  });

  it("omits empty categories", () => {
    const grouped = selectedByCategory({
      selected: ["foundation"],
    });
    expect(grouped["Difficulty"]).toEqual(["foundation"]);
    expect(grouped["Goal"]).toBeUndefined();
    expect(grouped["Topic"]).toBeUndefined();
  });
});

describe("TAG_CATEGORIES vocabulary", () => {
  it("contains the three expected categories", () => {
    expect(TAG_CATEGORIES.map((c) => c.label)).toEqual([
      "Difficulty",
      "Topic",
      "Goal",
    ]);
  });
  it("Difficulty has 3 tags", () => {
    expect(TAG_CATEGORIES[0].tags).toHaveLength(3);
  });
  it("Topic has 5 tags", () => {
    expect(TAG_CATEGORIES[1].tags).toHaveLength(5);
  });
  it("Goal has 5 tags", () => {
    expect(TAG_CATEGORIES[2].tags).toHaveLength(5);
  });
});

describe("TAG_LABEL", () => {
  it("has a label for every tag", () => {
    const allTags = TAG_CATEGORIES.flatMap((c) => c.tags);
    for (const t of allTags) {
      expect(TAG_LABEL[t]).toBeTruthy();
      expect(typeof TAG_LABEL[t]).toBe("string");
    }
  });
});
