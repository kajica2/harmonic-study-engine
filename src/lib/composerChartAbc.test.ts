/**
 * src/lib/composerChartAbc.test.ts — behavior pins for buildComposerChartAbc.
 *
 * Pure logic; vitest's node project picks this up automatically.
 */

import { describe, it, expect } from "vitest";
import { buildComposerChartAbc } from "./composerChartAbc";
import { getComposerChart } from "./composerCatalog";

describe("buildComposerChartAbc (C1b: composer chart → ABC source)", () => {
  it("every chart kind's output starts with X:1", () => {
    for (const id of ["beethoven", "stravinsky", "schoenberg", "bartok", "cage", "brian-eno", "stockhausen"] as const) {
      const chart = getComposerChart(id);
      if (!chart) continue;
      const abc = buildComposerChartAbc(chart);
      expect(abc.startsWith("X:1")).toBe(true);
    }
  });

  it("schoenberg (row) contains K:C and a T: line with 'Twelve-tone row'", () => {
    const chart = getComposerChart("schoenberg");
    if (!chart || chart.kind !== "row") throw new Error("fixture missing");
    const abc = buildComposerChartAbc(chart);
    expect(abc).toContain("K:C");
    expect(abc).toContain("T:");
    expect(abc).toContain("Twelve-tone row");
  });

  it("beethoven (bar) contains a '^' chord symbol above each bar", () => {
    const chart = getComposerChart("beethoven");
    if (!chart || chart.kind !== "bar") throw new Error("fixture missing");
    const abc = buildComposerChartAbc(chart);
    expect(abc).toContain("^");
    expect(abc).toMatch(/\^[A-G]/);
  });

  it("stravinsky (bitonal) contains stacked chord brackets", () => {
    const chart = getComposerChart("stravinsky");
    if (!chart || chart.kind !== "bitonal") throw new Error("fixture missing");
    const abc = buildComposerChartAbc(chart);
    expect(abc).toContain("[");
    expect(abc).toContain("]");
  });

  it("cage (duration) builds without throwing and contains %%text lines", () => {
    const chart = getComposerChart("cage");
    if (!chart || chart.kind !== "duration") throw new Error("fixture missing");
    const abc = buildComposerChartAbc(chart);
    expect(abc).toContain("%%text");
    // Description + raw lines (3 raw lines) are surfaced.
    const textLines = abc.split("\n").filter((l) => l.startsWith("%%text"));
    expect(textLines.length).toBeGreaterThanOrEqual(4);
  });

  it("axis (bartok) renders one stacked bar per tonic axis entry", () => {
    const chart = getComposerChart("bartok");
    if (!chart || chart.kind !== "axis") throw new Error("fixture missing");
    const abc = buildComposerChartAbc(chart);
    // Each bar boundary is `|`. With tonicAxis.length bars, expect
    // 2 * tonicAxis.length `|` tokens (start + end per bar).
    const bars = (abc.match(/\|/g) || []).length;
    expect(bars).toBe(2 * chart.tonicAxis.length);
  });
});