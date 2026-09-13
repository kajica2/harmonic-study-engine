import { describe, it, expect } from "vitest";
import {
  planForm,
  reorderSections,
  tagSections,
  MIN_PATH_BARS,
  MAX_PATH_BARS,
} from "./formPlanner";

describe("planForm", () => {
  it("rejects plans that violate the 24-64 bar invariant", () => {
    const result = planForm({ bars: 8, template: "aaba" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("invariant");
  });

  it("allows sub-24-bar plans only with relaxInvariant: true", () => {
    const r1 = planForm({ bars: 8, template: "aaba" });
    expect(r1.ok).toBe(false);
    const r2 = planForm({ bars: 8, template: "aaba", relaxInvariant: true });
    expect(r2.ok).toBe(true);
  });

  it("rejects bars above MAX_PATH_BARS regardless of relaxInvariant", () => {
    const r = planForm({ bars: 100, template: "aaba", relaxInvariant: true });
    expect(r.ok).toBe(false);
  });

  it("plans AABA for 32 bars — section total matches", () => {
    const result = planForm({ bars: 32, template: "aaba" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.template).toBe("aaba");
      expect(result.plan.sections.length).toBe(4);
      expect(result.plan.totalBars).toBe(32);
    }
  });

  it("snaps section lengths when bar count doesn't divide evenly into template", () => {
    // theme-vars has 5 sections of 8 = 40 bars default. 26 bars / 40
    // = 0.65 → sections of 5,5,5,5,6 → total 26 with one section
    // rounded up by 1, which triggers the clamp notice.
    const result = planForm({ bars: 26, template: "theme-vars" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.totalBars).toBe(26);
      expect(result.plan.clamped).toBe(true);
      expect(result.plan.notice).toBeDefined();
    }
  });

  it("exposes MIN_PATH_BARS and MAX_PATH_BARS", () => {
    expect(MIN_PATH_BARS).toBe(24);
    expect(MAX_PATH_BARS).toBe(64);
  });
});

describe("reorderSections", () => {
  const sections = [
    { id: "A", length: 8 },
    { id: "B", length: 8 },
    { id: "C", length: 8 },
  ];

  it("reorders by id list", () => {
    const out = reorderSections({ sections, order: ["C", "A", "B"] });
    expect(out.map((s) => s.id)).toEqual(["C", "A", "B"]);
  });

  it("round-trips: original order is identity", () => {
    const out = reorderSections({ sections, order: ["A", "B", "C"] });
    expect(out).toEqual(sections);
  });

  it("double-reorder returns to original", () => {
    const once = reorderSections({ sections, order: ["B", "C", "A"] });
    const back = reorderSections({ sections: once, order: ["A", "B", "C"] });
    expect(back).toEqual(sections);
  });

  it("throws on length mismatch", () => {
    expect(() => reorderSections({ sections, order: ["A", "B"] })).toThrow(/length/);
  });

  it("throws on unknown id", () => {
    expect(() => reorderSections({ sections, order: ["A", "B", "X"] })).toThrow(/unknown/);
  });

  it("throws on duplicate ids", () => {
    expect(() => reorderSections({ sections, order: ["A", "A", "B"] })).toThrow(/duplicate/);
  });
});

describe("tagSections", () => {
  it("produces a label per beat-step", () => {
    const steps = Array.from({ length: 32 }, () => ({ name: "X", notes: [60] as number[] }));
    const sections = [
      { id: "A", length: 4 },
      { id: "B", length: 4 },
    ];
    const result = tagSections({ steps, sections });
    expect(result.sectionLabels.length).toBe(32);
    expect(result.sectionLabels[0]).toBe("A");
    expect(result.sectionLabels[16]).toBe("B");
  });

  it("marks the final beat of each section as '(end)'", () => {
    const steps = Array.from({ length: 8 }, () => ({ name: "X", notes: [60] as number[] }));
    const sections = [{ id: "A", length: 2 }];
    const result = tagSections({ steps, sections });
    // bar 0 has 4 beats; the last beat of bar 1 (index 7) is "(end)".
    expect(result.sectionLabels[7]).toBe("A (end)");
  });
});
