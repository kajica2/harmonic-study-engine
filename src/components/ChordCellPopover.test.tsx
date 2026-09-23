/**
 * src/components/ChordCellPopover.test.tsx - PRD-001 Phase 4 Slice 2
 * (test plan 7): open/apply/delete/split, autocomplete keyboard
 * (arrows/Enter/Escape), outside-close, rejected symbols show an
 * inline error. (Focus RETURN is pinned from the parent side in
 * AnalysisCard.test.tsx; the split OUTPUT shape is asserted via the
 * onSplit seam - the engine call lives in the card.)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChordCellPopover } from "./ChordCellPopover";
import { restCell, type ChordCell, type KeyCandidate } from "../../engine/compose/types";

const C_MAJOR: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 1 };

function altCell(rootPc: number, quality: string, name: string): ChordCell {
  return {
    rootPc,
    qualitySymbol: quality,
    name,
    bassPc: null,
    confidence: 0.5,
    alternatives: [],
    isRest: false,
  };
}

function setup(overrides: Partial<Parameters<typeof ChordCellPopover>[0]> = {}) {
  const cell: ChordCell = {
    ...altCell(2, "m7", "Dm7"),
    alternatives: [altCell(7, "dom7", "G7"), altCell(9, "min", "Am7")],
  };
  const props = {
    cell,
    keyCandidate: C_MAJOR,
    recentSymbols: ["Am7"],
    onApply: vi.fn(),
    onDelete: vi.fn(),
    onSplit: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<ChordCellPopover {...props} />);
  return props;
}

describe("ChordCellPopover", () => {
  it("opens with the symbol input focused", () => {
    setup();
    expect(document.activeElement).toBe(screen.getByTestId("chord-symbol-input"));
  });

  it("typing a valid symbol + Enter applies the parsed cell (spelled in key family)", () => {
    const p = setup();
    const input = screen.getByTestId("chord-symbol-input");
    fireEvent.change(input, { target: { value: "Cmaj7" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(p.onApply).toHaveBeenCalledTimes(1);
    expect(p.onApply.mock.calls[0][0]).toMatchObject({
      rootPc: 0,
      qualitySymbol: "maj7",
      name: "Cmaj7",
      confidence: 1,
      isRest: false,
    });
  });

  it("a symbol the grid cannot hold shows an inline error and NEVER applies", () => {
    const p = setup();
    const input = screen.getByTestId("chord-symbol-input");
    fireEvent.change(input, { target: { value: "C13" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("chord-symbol-error").textContent).toContain("C13");
    expect(p.onApply).not.toHaveBeenCalled();
    expect(p.onClose).not.toHaveBeenCalled(); // stays open for correction
  });

  it("autocomplete: alternatives FIRST, then recents; prefix filter narrows the list", () => {
    setup();
    const options = screen.getAllByRole("option");
    expect(options[0].textContent).toBe("G7"); // cell.alternatives[0]
    expect(options[1].textContent).toBe("Am7"); // alternative + recent (deduped)
    fireEvent.change(screen.getByTestId("chord-symbol-input"), { target: { value: "C" } });
    for (const o of screen.getAllByRole("option")) {
      expect((o.textContent ?? "").toLowerCase().startsWith("c")).toBe(true);
    }
  });

  it("arrow keys move the active option; Enter applies it", () => {
    const p = setup();
    const input = screen.getByTestId("chord-symbol-input");
    fireEvent.change(input, { target: { value: "Eb" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const options = screen.getAllByRole("option");
    const selected = options.findIndex((o) => o.getAttribute("aria-selected") === "true");
    expect(selected).toBe(1);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(p.onApply).toHaveBeenCalledTimes(1);
    expect(p.onApply.mock.calls[0][0].name).toBe(options[1].textContent);
  });

  it("Enter applies the TYPED query even when a different suggestion is active (e2e regression)", () => {
    // MED-002 (reviewer): the PREVIOUS version of this test did NOT
    // discriminate - suggestions[0] === "Am7" === the typed text, so
    // the OLD always-apply-suggestions[0] behavior passed it. Here the
    // cell's ONLY alternative is "Am7b5": it shares the typed prefix
    // (so it heads the list) but parses to a DIFFERENT quality
    // (halfdim). Typed wins must apply m7; the old behavior applied
    // m7b5. RED-verified against the reverted Enter logic.
    const p = setup({
      cell: { ...altCell(2, "m7", "Dm7"), alternatives: [altCell(9, "halfdim", "Am7b5")] },
      recentSymbols: [],
    });
    const input = screen.getByTestId("chord-symbol-input");
    fireEvent.change(input, { target: { value: "Am7" } });
    // The list genuinely leads with the discriminator, not the query:
    expect(screen.getAllByRole("option")[0].textContent).toBe("Am7b5");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(p.onApply).toHaveBeenCalledTimes(1);
    const applied = p.onApply.mock.calls[0][0] as ChordCell;
    expect(applied.qualitySymbol).toBe("m7"); // NOT "m7b5"
    expect(applied).toMatchObject({ rootPc: 9, name: "Am7" });
  });

  it("Escape closes via the popover's own handler", () => {
    const p = setup();
    fireEvent.keyDown(screen.getByTestId("chord-symbol-input"), { key: "Escape" });
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("pointerdown outside closes; inside does not", () => {
    const p = setup();
    fireEvent.pointerDown(screen.getByTestId("chord-symbol-input"));
    expect(p.onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("common options: the cell's alternatives render as buttons and apply verbatim", () => {
    const p = setup();
    fireEvent.click(screen.getByTestId("chord-alternative-G7"));
    expect(p.onApply).toHaveBeenCalledTimes(1);
    expect(p.onApply.mock.calls[0][0].name).toBe("G7");
  });

  it("Delete -> onDelete (null override upstream); Split -> onSplit (one patch upstream)", () => {
    const p = setup();
    fireEvent.click(screen.getByTestId("chord-delete"));
    expect(p.onDelete).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("chord-split"));
    expect(p.onSplit).toHaveBeenCalledTimes(1);
  });

  it("rest cell: no alternatives section, input still works", () => {
    const props = {
      cell: restCell(),
      keyCandidate: C_MAJOR,
      recentSymbols: [],
      onApply: vi.fn(),
      onDelete: vi.fn(),
      onSplit: vi.fn(),
      onClose: vi.fn(),
    };
    render(<ChordCellPopover {...props} />);
    expect(screen.queryByLabelText("Common options")).toBeNull();
    const input = screen.getByTestId("chord-symbol-input");
    fireEvent.change(input, { target: { value: "F" } });
    fireEvent.click(screen.getByTestId("chord-apply"));
    expect(props.onApply.mock.calls[0][0]).toMatchObject({ rootPc: 5, qualitySymbol: "maj", name: "F" });
  });
});
