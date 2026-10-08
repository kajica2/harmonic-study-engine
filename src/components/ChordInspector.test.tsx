/**
 * ChordInspector.test.tsx — the "Original (as written)" panel must
 * analyze the SELECTED step, not the one before it.
 *
 * Runs under jsdom via the src/components test.tsx glob in
 * vitest.config.ts (vitest 5 ignores per-file environment comments in
 * multi-project mode).
 *
 * TD-067: App.tsx passed `originalNotes={path.steps[activeStepIndex - 1]...}`
 * while the panel renders the SYMBOL from `path.steps[activeStepIndex]`.
 * On any path where consecutive bars differ, the panel showed the right
 * chord name over the previous bar's pitches, so every derived row
 * (Roman / Family / Function / Bass / Inversion) was computed from the
 * wrong notes. This pins symbol-vs-analysis agreement at the component
 * boundary, which is where the bug lived.
 */

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { ChordInspector } from "./ChordInspector";
import { analyzeChord } from "../lib/theory";
import type { HarmonicPath } from "../lib/paths";

/**
 * Two bars differing in BOTH symbol and family, so a symbol/analysis
 * mismatch is unmistakable: G7 (dominant) then F#dim7 (diminished).
 * These are bars 1-2 of concept-diminished-trail.
 */
const PATH: HarmonicPath = {
  id: "test-path",
  title: "Test path",
  description: "fixture",
  steps: [
    { name: "G7", notes: [55, 59, 62, 65], descriptions: "V7" },
    { name: "F#dim7", notes: [54, 57, 60, 63], descriptions: "dim7" },
  ],
};

function setup(stepIndex: number, originalNotes: number[]) {
  return render(
    <ChordInspector
      open={true}
      onClose={() => {}}
      path={PATH}
      stepIndex={stepIndex}
      originalNotes={originalNotes}
      currentNotes={PATH.steps[stepIndex].notes}
      prevNotes={PATH.steps[Math.max(0, stepIndex - 1)].notes}
      nextNotes={PATH.steps[Math.min(PATH.steps.length - 1, stepIndex + 1)].notes}
      onApply={() => {}}
      onAudition={() => {}}
      onStop={() => {}}
    />,
  );
}

/**
 * Read one labelled row out of a named panel. The panel is the nearest
 * ancestor holding the panel title; each row is a Cell div whose first
 * child is the label and whose second is the value.
 */
function readPanel(panelTitle: string): Record<string, string> {
  const title = screen.getByText(panelTitle, { exact: true });
  const panel = title.parentElement as HTMLElement;
  const out: Record<string, string> = {};
  for (const cell of Array.from(panel.querySelectorAll("div.bg-black\\/30.rounded-lg"))) {
    const [label, value] = Array.from(cell.children);
    if (label && value) out[label.textContent ?? ""] = value.textContent ?? "";
  }
  return out;
}

afterEach(() => cleanup());

describe("ChordInspector — Original panel tracks the selected step", () => {
  it("reports the SELECTED step's own chord, not the previous step's", () => {
    setup(1, PATH.steps[1].notes); // stepIndex 1 = F#dim7
    const panel = readPanel("Original (as written)");

    expect(panel.Symbol).toBe("F#dim7");
    expect(panel.Family).toBe("diminished");
    expect(panel.Bass).toBe(analyzeChord(PATH.steps[1].notes).bass);
    // The previous bar is G7; its family must not leak into this panel.
    expect(panel.Family).not.toBe("dominant");
  });

  it("is a faithful function of originalNotes (guards the call site)", () => {
    // Feeding the historical off-by-one value (previous step's notes)
    // must visibly misreport — that is exactly why the App.tsx call site
    // is the single place the fix belongs. Symbol still comes from
    // stepIndex, so this pairs F#dim7's name with G7's analysis.
    setup(1, PATH.steps[0].notes);
    const panel = readPanel("Original (as written)");

    expect(panel.Symbol).toBe("F#dim7");
    expect(panel.Family).toBe("dominant");
    expect(panel.Family).not.toBe("diminished");
  });

  it("every Original row matches analyzeChord of that step's notes", () => {
    for (const stepIndex of [0, 1]) {
      const step = PATH.steps[stepIndex];
      const expected = analyzeChord(step.notes);
      setup(stepIndex, step.notes);
      const panel = readPanel("Original (as written)");

      expect(panel.Symbol).toBe(step.name);
      expect(panel.Family).toBe(expected.family);
      expect(panel.Function).toBe(expected.function);
      expect(panel.Bass).toBe(expected.bass);
      expect(panel.Inversion).toBe(String(expected.inversion));
      cleanup();
    }
  });

  it("keeps the Working panel on the current notes when the two differ", () => {
    // currentNotes = the dim7, originalNotes = the dim7 too (post-fix),
    // so both panels must agree on family for an unedited chord.
    setup(1, PATH.steps[1].notes);
    const original = readPanel("Original (as written)");
    const working = readPanel("Working voicing");
    expect(working.Family).toBe("diminished");
    expect(working.Family).toBe(original.Family);
  });
});