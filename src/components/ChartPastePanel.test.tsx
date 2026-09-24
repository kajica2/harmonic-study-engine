/**
 * src/components/ChartPastePanel.test.tsx - PRD-001 Phase 4 Slice 4
 * (test plan 13). jsdom (auto-registered). Covers the live-parse
 * footer, the warnings list, the EDITABLE preview (REQ-IO-14): the
 * D61 reject ring on "C13" -> accept on "Cm7", the "%" repeat visible
 * in the grid, and the commit payload (edited grid + chart shape).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChartPastePanel, detectCommitDrift } from "./ChartPastePanel";
import { parseChordChart } from "../../engine/compose/chordchart";
import { buildCellFromSymbol, parseChordSymbol } from "../../engine/compose/chordsym";
import { restCell, type ChordCell, type ChordGrid } from "../../engine/compose/types";
import type { ChordChart } from "../../engine/compose/chordchart";

function renderPanel(initialText = "") {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  render(<ChartPastePanel initialText={initialText} onCommit={onCommit} onCancel={onCancel} />);
  return { onCommit, onCancel };
}

const CHART_TEXT = "{key: Bb}\n{tempo: 132}\nBbmaj7 Gm7 Ebmaj7 Ab7";

function typeText(text: string): void {
  fireEvent.change(screen.getByTestId("chart-textarea"), { target: { value: text } });
}

describe("live parse (REQ-IO-10..13)", () => {
  it("empty textarea: honest placeholder + disabled commit", () => {
    renderPanel();
    expect(screen.getByTestId("chart-parse-summary").textContent).toContain("Paste a chart");
    expect((screen.getByTestId("chart-use") as HTMLButtonElement).disabled).toBe(true);
  });

  it("footer reports bars + key + tempo + warnings count", () => {
    renderPanel();
    typeText(CHART_TEXT);
    const footer = screen.getByTestId("chart-parse-summary").textContent ?? "";
    expect(footer).toContain("4 bars");
    expect(footer).toContain("key Bb");
    expect(footer).toContain("tempo 132");
    expect(footer).toContain("warnings: 0");
  });

  it("junk token -> warning list renders one line, non-fatal (REQ-IO-15)", () => {
    renderPanel();
    typeText("C junk F");
    expect(screen.getByTestId("chart-warnings").textContent).toContain("'junk' is not a chord symbol");
    expect(screen.getByTestId("chart-parse-summary").textContent).toContain("warnings: 1");
    // The chart still commits (junk landed a rest).
    expect((screen.getByTestId("chart-use") as HTMLButtonElement).disabled).toBe(false);
  });

  it("'%' repeat is VISIBLE as a filled cell in the preview grid (REQ-IO-12/14)", () => {
    renderPanel();
    typeText("C Am %");
    const input = screen.getByTestId("chart-cell-2-0") as HTMLInputElement;
    expect(input.value).toBe("Am"); // repeated verbatim
  });
});

describe("editable preview (REQ-IO-14) - edits BEFORE generating", () => {
  it("cell edit -> reject ring on 'C13' -> accept on 'Cm7' (D61 contract)", () => {
    renderPanel();
    typeText("C F G");
    const cell = screen.getByTestId("chart-cell-0-0");
    fireEvent.change(cell, { target: { value: "C13" } });
    expect(screen.getByTestId("chart-cell-0-0").getAttribute("data-reject")).toBe("true");
    expect((screen.getByTestId("chart-use") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("chart-cell-0-0"), { target: { value: "Cm7" } });
    expect(screen.getByTestId("chart-cell-0-0").getAttribute("data-reject")).toBe("false");
    expect((screen.getByTestId("chart-use") as HTMLButtonElement).disabled).toBe(false);
  });

  it("commit payload: edited grid cells carry the NEW symbol, timing + directives survive", () => {
    const { onCommit } = renderPanel();
    typeText(CHART_TEXT);
    fireEvent.change(screen.getByTestId("chart-cell-1-0"), { target: { value: "Gm9" } });
    fireEvent.click(screen.getByTestId("chart-use"));
    expect(onCommit).toHaveBeenCalledTimes(1);
    const [text, chart] = (
      onCommit as unknown as { mock: { calls: [string, ChordChart][] } }
    ).mock.calls[0];
    // D84: the committed text is REGENERATED from the final grid -
    // it always re-parses to what the preview showed.
    expect(text).toContain("Gm9");
    expect(text).toContain("{key: Bb major}");
    expect(text).toContain("{tempo: 132}");
    expect(chart.bars).toBe(4);
    expect(chart.directives.key?.tonicPc).toBe(10);
    expect(chart.directives.tempoBpm).toBe(132);
    const edited = chart.grid.bars[1].slots[0];
    expect(edited.rootPc).toBe(7); // G
    expect(edited.qualitySymbol).toBe("min9"); // "Gm9" -> the m9 spelling (D61 grammar)
    expect(chart.grid.bars[0].slots[0].rootPc).toBe(10); // untouched Bb
    expect(chart.grid.bars[1].startTick).toBe(1920); // timing kept
  });

  it("blanking a cell commits a REST (legal, not a reject)", () => {
    const { onCommit } = renderPanel();
    typeText("C F G");
    fireEvent.change(screen.getByTestId("chart-cell-1-0"), { target: { value: "" } });
    expect(screen.getByTestId("chart-cell-1-0").getAttribute("data-reject")).toBe("false");
    fireEvent.click(screen.getByTestId("chart-use"));
    const [, chart] = (onCommit as unknown as { mock: { calls: [string, ChordChart][] } }).mock.calls[0];
    expect(chart.grid.bars[1].slots[0].isRest).toBe(true);
  });

  it("re-typing the textarea RESETS pending edits (edits belong to one parse)", () => {
    renderPanel();
    typeText("C F G");
    fireEvent.change(screen.getByTestId("chart-cell-0-0"), { target: { value: "C13" } });
    expect((screen.getByTestId("chart-use") as HTMLButtonElement).disabled).toBe(true);
    typeText("C F G A");
    expect((screen.getByTestId("chart-use") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("chart-cell-0-0") as HTMLInputElement).value).toBe("C");
  });

  it("initialText seeds the panel (the [Edit chart] round trip)", () => {
    renderPanel(CHART_TEXT);
    expect((screen.getByTestId("chart-textarea") as HTMLTextAreaElement).value).toBe(CHART_TEXT);
    expect(screen.getAllByTestId(/^chart-bar-/)).toHaveLength(4);
  });

  it("Cancel routes", () => {
    const { onCancel } = renderPanel();
    fireEvent.click(screen.getByTestId("chart-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// MED-002 (S4 fix round): commit-regeneration drift. The commit text is
// REGENERATED from the grid, but the "/" grammar is ambiguous on
// re-parse - three 2-cell shapes drift, and the panel must HOLD the
// commit behind an approve click (the preview grid stays the
// truth-teller). Direct detector pins first, then the UI guard.
// ---------------------------------------------------------------------------

const C_KEY = { tonicPc: 0, mode: "major", correlation: 1 } as const;

function driftCell(sym: string): ChordCell {
  const parsed = parseChordSymbol(sym);
  if (parsed === null) throw new Error(`bad drift fixture symbol: ${sym}`);
  return buildCellFromSymbol(parsed, C_KEY);
}

/** "C D" grid with bar 0 replaced by the given slots (a 2-cell bar). */
function gridWithBar0(slots: ChordCell[]): ChordGrid {
  const base = parseChordChart("C D");
  if (!base.ok) throw new Error("drift fixture parse failed");
  const bars = base.value.grid.bars.map((region, i) =>
    i === 0 ? { ...region, slots } : region,
  );
  return { slotsPerBar: 2, bars };
}

function okGrid(text: string): ChordGrid {
  const parsed = parseChordChart(text);
  if (!parsed.ok) throw new Error(`drift fixture parse failed: ${text}`);
  return parsed.value.grid;
}

describe("MED-002 drift detector (pure)", () => {
  it("[C,G] regenerates 'C/G' which whole-parses to ONE cell (G is C's 5th) -> bar 0 drifts", () => {
    expect(detectCommitDrift(gridWithBar0([driftCell("C"), driftCell("G")]), "C/G D")).toEqual([0]);
  });

  it("[C,Em7/G] regenerates 'C/Em7/G' (three sides -> rest + warning) -> bar 0 drifts", () => {
    expect(
      detectCommitDrift(gridWithBar0([driftCell("C"), driftCell("Em7/G")]), "C/Em7/G D"),
    ).toEqual([0]);
  });

  it("[C,rest] regenerates 'C/-' (split: C lands + warning, one cell) -> bar 0 drifts", () => {
    expect(detectCommitDrift(gridWithBar0([driftCell("C"), restCell()]), "C/- D")).toEqual([0]);
  });

  it("clean shapes stay SILENT: 1-cell bars, a natural split, a 1-cell slash-bass", () => {
    expect(detectCommitDrift(okGrid("C F G"), "C F G")).toEqual([]);
    expect(detectCommitDrift(okGrid("C/Am F"), "C/Am F")).toEqual([]);
    expect(detectCommitDrift(okGrid("C/E F"), "C/E F")).toEqual([]);
  });
});

describe("MED-002 drift guard (commit held until approved)", () => {
  function callsOf(onCommit: unknown): [string, ChordChart][] {
    return (onCommit as unknown as { mock: { calls: [string, ChordChart][] } }).mock.calls;
  }

  it("edited 2-cell [C,G]: warning shows BEFORE commit, first click HOLDS, second commits 'C/G'", () => {
    const { onCommit } = renderPanel();
    typeText("C/Am F");
    fireEvent.change(screen.getByTestId("chart-cell-0-1"), { target: { value: "G" } });
    // The warning is LIVE before any click (bar 1, human-facing).
    const warning = screen.getByTestId("chart-drift-warning").textContent ?? "";
    expect(warning).toContain("will merge on reload");
    expect(warning).toContain("approve anyway?");
    expect(screen.getByTestId("chart-use").textContent).toContain("Review warning");
    fireEvent.click(screen.getByTestId("chart-use"));
    expect(onCommit).not.toHaveBeenCalled(); // HELD
    expect(screen.getByTestId("chart-use").textContent).toContain("anyway");
    fireEvent.click(screen.getByTestId("chart-use"));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(callsOf(onCommit)[0][0]).toContain("C/G");
  });

  it("a further edit UN-acks (the approve does not survive new drift)", () => {
    const { onCommit } = renderPanel();
    typeText("C/Am F");
    fireEvent.change(screen.getByTestId("chart-cell-0-1"), { target: { value: "G" } });
    fireEvent.click(screen.getByTestId("chart-use")); // ack
    expect(screen.getByTestId("chart-use").textContent).toContain("anyway");
    // "E" is still drift ([C,E] joins "C/E", one cell - E is C's 3rd)
    // but the payload text changed, so the old approve is void.
    fireEvent.change(screen.getByTestId("chart-cell-0-1"), { target: { value: "E" } });
    expect(screen.getByTestId("chart-use").textContent).toContain("Review warning");
    fireEvent.click(screen.getByTestId("chart-use"));
    expect(onCommit).not.toHaveBeenCalled(); // HELD again
  });

  it("natural split 'C/Am' commits in ONE click with NO warning (stays silent)", () => {
    const { onCommit } = renderPanel();
    typeText("C/Am F");
    expect(screen.queryByTestId("chart-drift-warning")).toBeNull();
    expect(screen.getByTestId("chart-use").textContent).toBe("Use chart");
    fireEvent.click(screen.getByTestId("chart-use"));
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
