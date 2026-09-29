/**
 * src/lib/composerChartAudio.test.ts — behavior pins for chartChordSequence.
 *
 * Pure logic; vitest's node project picks this up automatically.
 */

import { describe, it, expect } from "vitest";
import { chartChordSequence } from "./composerChartAudio";
import { getComposerChart } from "./composerCatalog";

describe("chartChordSequence (C1a: play-through audition)", () => {
  it("beethoven (bar) returns a non-empty chord list; every chord >= 3 notes", () => {
    const chart = getComposerChart("beethoven");
    if (!chart || chart.kind !== "bar") throw new Error("fixture missing");
    const seq = chartChordSequence(chart);
    expect(seq.length).toBeGreaterThan(0);
    for (const notes of seq) {
      expect(notes.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("schoenberg (row) returns exactly 4 chords of 3 notes (3-per-bar walk of 12 pcs)", () => {
    const chart = getComposerChart("schoenberg");
    if (!chart || chart.kind !== "row") throw new Error("fixture missing");
    const seq = chartChordSequence(chart);
    expect(seq.length).toBe(4);
    for (const notes of seq) {
      expect(notes.length).toBe(3);
    }
  });

  it("stravinsky (bitonal) returns 4 chords of 3 notes per pair (alternating t1/t2)", () => {
    const chart = getComposerChart("stravinsky");
    if (!chart || chart.kind !== "bitonal") throw new Error("fixture missing");
    const seq = chartChordSequence(chart);
    expect(seq.length).toBe(4);
    for (const notes of seq) {
      expect(notes.length).toBe(3);
    }
    // Petrushka: pair = {root1: 0, root2: 6}. t1=[60,64,67], t2=[66,70,73].
    // Alternation: t1, t2, t1, t2.
    expect(seq[0]).toEqual([60, 64, 67]);
    expect(seq[1]).toEqual([66, 70, 73]);
    expect(seq[2]).toEqual([60, 64, 67]);
    expect(seq[3]).toEqual([66, 70, 73]);
  });

  it("bartok (axis) returns one triad per tonicAxis entry", () => {
    const chart = getComposerChart("bartok");
    if (!chart || chart.kind !== "axis") throw new Error("fixture missing");
    const seq = chartChordSequence(chart);
    expect(seq.length).toBe(chart.tonicAxis.length);
    // First entry: tonicAxis[0] = 9 → A major [60+9, 64+9, 67+9].
    expect(seq[0]).toEqual([69, 73, 76]);
  });

  it("cage (duration) returns [] — honest empty, UI disables Play/MIDI", () => {
    const chart = getComposerChart("cage");
    if (!chart || chart.kind !== "duration") throw new Error("fixture missing");
    expect(chartChordSequence(chart)).toEqual([]);
  });

  it("returns [] for layer and section charts too", () => {
    const eno = getComposerChart("brian-eno");
    if (!eno || eno.kind !== "layer") throw new Error("fixture missing");
    expect(chartChordSequence(eno)).toEqual([]);
    const stockhausen = getComposerChart("stockhausen");
    if (!stockhausen || stockhausen.kind !== "section")
      throw new Error("fixture missing");
    expect(chartChordSequence(stockhausen)).toEqual([]);
  });
});