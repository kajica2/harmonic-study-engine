/**
 * src/components/AnalysisCard.test.tsx - PRD-001 Phase 4 Slice 2
 * (test plan 6): merged truth rendering, tier styling per
 * confidenceTier, the D58 key-blend UI states (conflict banner with
 * radio default = declared, declared-only badge, manual override),
 * patch SHAPES (meter clears cells in ONE patch; split writes two
 * cells in ONE patch), annotation chips -> ConceptDrawer (key-prop
 * host pattern), popover open/close + focus return.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { AnalysisCard } from "./AnalysisCard";
import { analyzeFixture } from "./composeFixtures";
import { blendKeyEvidence } from "../../engine/compose/key";
import {
  EMPTY_OVERRIDES,
  mergeAnalysis,
  restCell,
  type AnalysisOverrides,
  type ChordCell,
  type ComposeAnalysis,
  type KeyCandidate,
} from "../../engine/compose/types";
import type { AnalysisCardProps } from "./AnalysisCard";

function fixtureAnalysis(): { project: ReturnType<typeof analyzeFixture>["project"]; analysis: ComposeAnalysis } {
  return analyzeFixture({});
}

function cell(rootPc: number, quality: string, name: string, confidence: number, alternatives: readonly ChordCell[] = []): ChordCell {
  return { rootPc, qualitySymbol: quality, name, bassPc: null, confidence, alternatives, isRest: false };
}

function setup(over: {
  overrides?: Partial<AnalysisOverrides>;
  mutateAnalysis?: (a: ComposeAnalysis) => ComposeAnalysis;
  analyzeFull?: boolean;
} = {}): AnalysisCardProps & { onPatch: ReturnType<typeof vi.fn> } {
  const { project, analysis } = fixtureAnalysis();
  const base = over.mutateAnalysis ? over.mutateAnalysis(analysis) : analysis;
  const overrides: AnalysisOverrides = { ...EMPTY_OVERRIDES, ...over.overrides };
  const merged = mergeAnalysis(base, overrides);
  const blend = blendKeyEvidence(base);
  const onPatch = vi.fn();
  const props: AnalysisCardProps = {
    project,
    merged,
    blend,
    inferredCandidate: base.key.candidates[0] ?? null,
    overrides,
    onPatch,
    analyzeFull: over.analyzeFull ?? false,
    onAnalyzeFull: vi.fn(),
    onStartOver: vi.fn(),
    recentSymbols: [],
    onSymbolApplied: vi.fn(),
  };
  render(<AnalysisCard {...props} />);
  return { ...props, onPatch };
}

afterEach(() => {
  cleanup();
});

describe("AnalysisCard header (REQ-COMP-20/21)", () => {
  it("renders fileName + duration + the detected key from the fixture", () => {
    setup();
    expect(screen.getByTestId("analysis-file-name").textContent).toBe("fixture.mid");
    expect(screen.getByTestId("key-value").textContent).toContain("C major");
  });

  it("tempo override commits on Enter, is record-only, and carries the S4 tooltip", () => {
    const p = setup();
    const tempo = screen.getByTestId("tempo-input");
    expect(tempo.getAttribute("title")).toContain("affects playback and export");
    fireEvent.change(tempo, { target: { value: "132" } });
    fireEvent.keyDown(tempo, { key: "Enter" });
    expect(p.onPatch).toHaveBeenCalledTimes(1);
    expect(p.onPatch.mock.calls[0][0].tempoBpm).toBe(132);
  });

  it("tempo rejects junk (no patch, field reverts)", () => {
    const p = setup();
    const tempo = screen.getByTestId("tempo-input");
    fireEvent.change(tempo, { target: { value: "abc" } });
    fireEvent.keyDown(tempo, { key: "Enter" });
    expect(p.onPatch).not.toHaveBeenCalled();
    expect((tempo as HTMLInputElement).value).not.toBe("abc");
  });

  it("meter override clears chord cells IN THE SAME patch (D63 one-undo rule)", () => {
    const p = setup({ overrides: { chordCells: { "0:0": cell(0, "maj", "C", 1) } } });
    const meter = screen.getByTestId("meter-input");
    fireEvent.change(meter, { target: { value: "6/8" } });
    fireEvent.keyDown(meter, { key: "Enter" });
    expect(p.onPatch).toHaveBeenCalledTimes(1);
    const next = p.onPatch.mock.calls[0][0] as AnalysisOverrides;
    expect(next.timeSignature).toEqual([6, 8]);
    expect(next.chordCells).toEqual({}); // cleared in the same commit
  });

  it("melody select change patches melodyTrackIndex (re-extraction happens upstream)", () => {
    const p = setup();
    fireEvent.change(screen.getByTestId("melody-select"), { target: { value: "0" } });
    expect(p.onPatch.mock.calls[0][0].melodyTrackIndex).toBe(0);
  });

  it("a key override flips the card (merged truth) and offers Reset", () => {
    const p = setup({ overrides: { key: { tonicPc: 5, mode: "minor", correlation: 1 } } });
    expect(screen.getByTestId("key-value").textContent).toContain("F minor");
    expect(screen.getByTestId("key-value").getAttribute("data-tier")).toBe("manual");
    fireEvent.click(screen.getByTestId("key-reset"));
    expect(p.onPatch.mock.calls[0][0].key).toBeNull();
  });

  it("manual key input: valid token patches, invalid reverts", () => {
    const p = setup();
    fireEvent.click(screen.getByTestId("key-change"));
    const input = screen.getByTestId("key-input");
    fireEvent.change(input, { target: { value: "F minor" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(p.onPatch.mock.calls[0][0].key).toEqual({ tonicPc: 5, mode: "minor", correlation: 1 });
    fireEvent.click(screen.getByTestId("key-change"));
    const input2 = screen.getByTestId("key-input");
    fireEvent.change(input2, { target: { value: "Wat?!" } });
    fireEvent.keyDown(input2, { key: "Enter" });
    expect(p.onPatch).toHaveBeenCalledTimes(1); // no second patch
  });

  it("MED-003: focus+blur WITHOUT editing commits NOTHING (no phantom patch)", () => {
    const p = setup();
    fireEvent.blur(screen.getByTestId("tempo-input"));
    fireEvent.blur(screen.getByTestId("meter-input"));
    // "Change" the key, then blur without editing: pre-fix this
    // re-committed the parsed label -> manual override (provenance
    // lie) + an undo entry. Post-fix: zero patches, editor closes,
    // the tier stays the honest DETECTED one.
    fireEvent.click(screen.getByTestId("key-change"));
    fireEvent.blur(screen.getByTestId("key-input"));
    expect(p.onPatch).not.toHaveBeenCalled();
    expect(screen.queryByTestId("key-input")).toBeNull(); // closed, not stuck open
    expect(screen.getByTestId("key-value").getAttribute("data-tier")).toBe("auto");
  });
});

describe("AnalysisCard key-blend states (D58 H1/H2)", () => {
  const conflict = (a: ComposeAnalysis): ComposeAnalysis => ({
    ...a,
    key: { ...a.key, declared: { tick: 0, tonicPc: 5, mode: "major" } },
  });

  it("H2: conflict ALWAYS banners - reason line + 2-way radio default DECLARED + Other escape", () => {
    setup({ mutateAnalysis: conflict });
    const banner = screen.getByTestId("key-conflict-banner");
    expect(banner.textContent).toContain("declares F major");
    expect(banner.textContent).toContain("the notes suggest C major");
    const declared = screen.getByTestId("conflict-radio-declared") as HTMLInputElement;
    const inferred = screen.getByTestId("conflict-radio-inferred") as HTMLInputElement;
    expect(declared.checked).toBe(true); // default = declared
    expect(inferred.checked).toBe(false);
    expect(screen.getByTestId("conflict-other").textContent).toContain("Other");
  });

  it("H2: picking Inferred patches the raw top candidate; the card shows it", () => {
    const p = setup({ mutateAnalysis: conflict });
    fireEvent.click(screen.getByTestId("conflict-radio-inferred"));
    expect(p.onPatch.mock.calls[0][0].key).toMatchObject({ tonicPc: 0, mode: "major" });
  });

  it("conflict tier never auto (blend fixed 0.60 -> highlight)", () => {
    setup({ mutateAnalysis: conflict });
    expect(screen.getByTestId("key-value").getAttribute("data-tier")).toBe("highlight");
  });

  it("declared-only: badge 'from the file's key signature', never auto", () => {
    const declaredOnly = (a: ComposeAnalysis): ComposeAnalysis => ({
      ...a,
      key: { ...a.key, declared: { tick: 0, tonicPc: 0, mode: "major" }, chromaticFallback: true },
    });
    setup({ mutateAnalysis: declaredOnly });
    expect(screen.getByTestId("key-declared-badge").textContent).toContain("from the file's key signature");
    expect(screen.getByTestId("key-value").getAttribute("data-tier")).toBe("highlight");
  });

  it("fallback (none): key tier manual", () => {
    const atonal = analyzeFixture({ atonal: true });
    const blend = blendKeyEvidence(atonal.analysis);
    expect(blend.agreement).toBe("none");
    render(
      <AnalysisCard
        project={atonal.project}
        merged={mergeAnalysis(atonal.analysis, EMPTY_OVERRIDES)}
        blend={blend}
        inferredCandidate={atonal.analysis.key.candidates[0]}
        overrides={EMPTY_OVERRIDES}
        onPatch={() => {}}
        analyzeFull={false}
        onAnalyzeFull={() => {}}
        onStartOver={() => {}}
        recentSymbols={[]}
        onSymbolApplied={() => {}}
      />,
    );
    expect(screen.getByTestId("key-value").getAttribute("data-tier")).toBe("manual");
    expect(screen.getByTestId("banner-atonal").textContent).toContain("No clear key detected");
  });
});

describe("AnalysisCard chord chart tiers + editing (REQ-COMP-22/23)", () => {
  it("tier styling follows confidenceTier per cell", () => {
    const mixed = (a: ComposeAnalysis): ComposeAnalysis => ({
      ...a,
      grid: {
        slotsPerBar: 1,
        bars: [
          { bar: 0, startTick: 0, endTick: 1920, slots: [cell(0, "maj", "C", 0.95)] },
          { bar: 1, startTick: 1920, endTick: 3840, slots: [cell(5, "maj", "F", 0.7)] },
          { bar: 2, startTick: 3840, endTick: 5760, slots: [cell(7, "dom7", "G7", 0.4, [cell(9, "min", "Am", 0.3)])] },
          { bar: 3, startTick: 5760, endTick: 7680, slots: [restCell()] },
        ],
      },
    });
    setup({ mutateAnalysis: mixed });
    expect(screen.getByTestId("chord-cell-0-0").getAttribute("data-tier")).toBe("auto");
    expect(screen.getByTestId("chord-cell-1-0").getAttribute("data-tier")).toBe("highlight");
    expect(screen.getByTestId("chord-cell-2-0").getAttribute("data-tier")).toBe("radio");
    expect(screen.getByTestId("chord-cell-3-0").getAttribute("data-tier")).toBe("manual");
    // radio tier shows its top alternative as an inline chip
    expect(screen.getByTestId("chord-alt-2-0").textContent).toBe("Am");
  });

  it("cell click opens the popover; Escape closes it and focus RETURNS to the cell", () => {
    setup();
    const trigger = screen.getByTestId("chord-cell-0-0");
    fireEvent.click(trigger);
    expect(screen.getByTestId("chord-cell-popover")).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId("chord-symbol-input"), { key: "Escape" });
    expect(screen.queryByTestId("chord-cell-popover")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("popover apply writes ONE cell override (patch shape 'bar:slot')", () => {
    const p = setup();
    fireEvent.click(screen.getByTestId("chord-cell-0-0"));
    const input = screen.getByTestId("chord-symbol-input");
    fireEvent.change(input, { target: { value: "Em7b5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    const next = p.onPatch.mock.calls[0][0] as AnalysisOverrides;
    expect(next.chordCells["0:0"]).toMatchObject({ rootPc: 4, qualitySymbol: "halfdim" });
  });

  it("delete writes a null override (rest)", () => {
    const p = setup();
    fireEvent.click(screen.getByTestId("chord-cell-1-0"));
    fireEvent.click(screen.getByTestId("chord-delete"));
    expect(p.onPatch.mock.calls[0][0].chordCells["1:0"]).toBeNull();
  });

  it("split writes BOTH 'b:0' and 'b:1' in ONE patch (D60 + one undo entry)", () => {
    const p = setup();
    fireEvent.click(screen.getByTestId("chord-cell-0-0"));
    fireEvent.click(screen.getByTestId("chord-split"));
    expect(p.onPatch).toHaveBeenCalledTimes(1);
    const next = p.onPatch.mock.calls[0][0] as AnalysisOverrides;
    expect(Object.keys(next.chordCells).sort()).toEqual(["0:0", "0:1"]);
    expect(next.chordCells["0:0"]).not.toBeNull();
    expect(next.chordCells["0:1"]).not.toBeNull();
  });

  it("percussion-only: all-rest grid renders manual cells + the manual prompt banner", () => {
    const perc = analyzeFixture({ percussionOnly: true });
    const blend = blendKeyEvidence(perc.analysis);
    render(
      <AnalysisCard
        project={perc.project}
        merged={mergeAnalysis(perc.analysis, EMPTY_OVERRIDES)}
        blend={blend}
        inferredCandidate={perc.analysis.key.candidates[0]}
        overrides={EMPTY_OVERRIDES}
        onPatch={() => {}}
        analyzeFull={false}
        onAnalyzeFull={() => {}}
        onStartOver={() => {}}
        recentSymbols={[]}
        onSymbolApplied={() => {}}
      />,
    );
    expect(screen.getByTestId("banner-percussion").textContent).toContain("only percussion");
    expect(screen.getByTestId("chord-cell-0-0").getAttribute("data-tier")).toBe("manual");
  });
});

describe("AnalysisCard banners + annotations (REQ-COMP-6/53, PED-4/5)", () => {
  it("truncated banner shows the window copy + Analyze-full button", () => {
    const long = analyzeFixture({ farNote: true });
    render(
      <AnalysisCard
        project={long.project}
        merged={long.analysis}
        blend={blendKeyEvidence(long.analysis)}
        inferredCandidate={long.analysis.key.candidates[0]}
        overrides={EMPTY_OVERRIDES}
        onPatch={() => {}}
        analyzeFull={false}
        onAnalyzeFull={() => {}}
        onStartOver={() => {}}
        recentSymbols={[]}
        onSymbolApplied={() => {}}
      />,
    );
    const banner = screen.getByTestId("banner-truncated");
    expect(banner.textContent).toContain("Showing the first 4:00 of");
    expect(within(banner).getByTestId("analyze-full-button").textContent).toContain("Analyze full file");
  });

  it("pitch-bend warning names the track count (REQ-COMP-6)", () => {
    const bend = analyzeFixture({ pitchBend: true });
    render(
      <AnalysisCard
        project={bend.project}
        merged={bend.analysis}
        blend={blendKeyEvidence(bend.analysis)}
        inferredCandidate={bend.analysis.key.candidates[0]}
        overrides={EMPTY_OVERRIDES}
        onPatch={() => {}}
        analyzeFull={false}
        onAnalyzeFull={() => {}}
        onStartOver={() => {}}
        recentSymbols={[]}
        onSymbolApplied={() => {}}
      />,
    );
    expect(screen.getByTestId("banner-pitchbend").textContent).toContain("1 track(s) use pitch bends");
  });

  it("ii-V-I chip opens the ConceptDrawer (key-prop host) and highlights its bars; close works", () => {
    setup();
    const chips = screen.getByTestId("annotation-chips");
    // The fixture yields TWO ii-V-I spans (bars 1-3 and 5-7).
    const iivi = within(chips).getAllByRole("button", { name: "ii-V-I" })[0];
    fireEvent.click(iivi);
    const drawer = screen.getByRole("dialog");
    expect(drawer.textContent).toContain("ii-V-I"); // concept title/body present
    // progression range highlighted in the chart (bars 1-3 -> rows 0..2)
    expect(screen.getByTestId("chord-row-1").className).toContain("ring-[color:var(--color-brand)]");
    fireEvent.click(screen.getByRole("button", { name: "Close concept" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("null-conceptId annotations render as static text (no dead click target)", () => {
    setup();
    expect(screen.getByTestId("annotation-static-ann-melody-0").tagName).toBe("SPAN");
  });

  it("privacy line + Start over present (REQ-IO-70 extension)", () => {
    setup();
    expect(screen.getByTestId("privacy-line").textContent).toContain("never leaves this tab");
    expect(screen.getByTestId("start-over").textContent).toBe("Start over");
  });
});

describe("AnalysisCard PED-6 no-match fallback (G2)", () => {
  it("bare chord cell dispatches hse:open-concept-search with prefill and opens NO drawer", () => {
    const noAnnotations = (a: ComposeAnalysis): ComposeAnalysis => ({ ...a, annotations: [] });
    setup({ mutateAnalysis: noAnnotations });
    const seen: CustomEvent<{ prefill: string }>[] = [];
    const onSearch = (e: Event): void => {
      seen.push(e as CustomEvent<{ prefill: string }>);
    };
    window.addEventListener("hse:open-concept-search", onSearch);
    try {
      const cell = screen.getByTestId("chord-cell-0-0");
      const expectedPrefill = cell.textContent ?? "";
      expect(expectedPrefill).not.toBe("");
      fireEvent.contextMenu(cell);
      expect(seen).toHaveLength(1);
      expect(seen[0].detail.prefill).toBe(expectedPrefill);
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      window.removeEventListener("hse:open-concept-search", onSearch);
    }
  });
});
