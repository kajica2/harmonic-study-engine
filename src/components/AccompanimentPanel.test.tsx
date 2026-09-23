/**
 * src/components/AccompanimentPanel.test.tsx - PRD-001 Phase 4 Slice 3
 * (test plan 11, REQ-COMP-30..36 UI). Auto-registers in the jsdom
 * project via the vitest JSDOM_FILES glob (src/components dot-star dot test.tsx).
 *
 * Covers: controls render + profile density default, the >= 1 role
 * gate, Randomize changing the seed, Generate dispatching the
 * assembled request, the staleness chip on fingerprint mismatch,
 * annotation chips -> ConceptDrawer (key-remount), meta line content,
 * and the preview button state machine (data-preview). The panel is
 * fully controlled (reads NOTHING from the store), so no store
 * seeding and no audio module is needed - preview is a callback.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccompanimentPanel } from "./AccompanimentPanel";
import { generateAccompaniment, gridFingerprint } from "../../engine/compose/accompany";
import type {
  AccompRole,
  AccompanimentRequest,
  AccompanimentResult,
  ChordCell,
  ChordGrid,
} from "../../engine/compose/types";

const PPQ = 480;
const BAR = 1920;

function cell(rootPc: number, qualitySymbol: string): ChordCell {
  return {
    rootPc,
    qualitySymbol,
    name: `${rootPc}:${qualitySymbol}`,
    bassPc: null,
    confidence: 1,
    alternatives: [],
    isRest: false,
  };
}

function grid(bars = 4): ChordGrid {
  const prog: readonly [number, string][] = [
    [0, "maj7"],
    [2, "m7"],
    [7, "dom7"],
    [0, "maj7"],
  ];
  return {
    slotsPerBar: 1,
    bars: Array.from({ length: bars }, (_, b) => ({
      bar: b,
      startTick: b * BAR,
      endTick: (b + 1) * BAR,
      slots: [cell(prog[b % 4][0], prog[b % 4][1])],
    })),
  };
}

function request(over: Partial<AccompanimentRequest> = {}): AccompanimentRequest {
  return {
    version: 1,
    styleId: "jazz",
    roles: ["bass", "chords"],
    density: 3,
    seed: 42,
    ...over,
  };
}

function generate(
  req: AccompanimentRequest = request(),
  g: ChordGrid = grid(),
): AccompanimentResult {
  const out = generateAccompaniment(req, g, PPQ, { tonicPc: 0, mode: "major", correlation: 0.9 });
  if (!out.ok) throw new Error(`fixture generate failed: ${out.error.code}`);
  return out.value;
}

function renderPanel(
  over: Partial<{
    result: AccompanimentResult | null;
    request: AccompanimentRequest;
    grid: ChordGrid;
    previewState: "idle" | "rendering" | "playing";
    onPatch: (r: AccompanimentRequest) => void;
    onGenerate: () => void;
    onPreview: () => void;
  }> = {},
) {
  const props = {
    grid: over.grid ?? grid(),
    ppq: PPQ,
    keyCandidate: { tonicPc: 0, mode: "major" as const, correlation: 0.9 },
    request: over.request ?? request(),
    result: over.result === undefined ? null : over.result,
    busy: false,
    previewState: over.previewState ?? ("idle" as const),
    previewCapped: false,
    onPatchRequest: over.onPatch ?? (() => {}),
    onGenerate: over.onGenerate ?? (() => {}),
    onPreview: over.onPreview ?? (() => {}),
  };
  return render(<AccompanimentPanel {...props} />);
}

beforeEach(() => {
  localStorage.clear();
});

describe("controls render (REQ-COMP-30/35/36)", () => {
  it("style select ships the three profiles; roles checkboxes; density slider; seed + randomize + generate", () => {
    renderPanel();
    expect(screen.getByTestId("accompaniment-panel")).toBeTruthy();
    const style = screen.getByTestId("accomp-style") as HTMLSelectElement;
    expect(Array.from(style.options).map((o) => o.value).sort()).toEqual([
      "classical",
      "jazz",
      "pop",
    ]);
    expect(style.value).toBe("jazz");
    for (const role of ["bass", "chords", "pad"]) {
      expect(screen.getByTestId(`accomp-role-${role}`)).toBeTruthy();
    }
    expect(screen.getByTestId("accomp-density")).toBeTruthy();
    expect(screen.getByTestId("accomp-seed")).toBeTruthy();
    expect(screen.getByTestId("accomp-randomize")).toBeTruthy();
    expect(screen.getByTestId("accomp-generate")).toBeTruthy();
  });

  it("style change re-centers density on the NEW profile's densityDefault (REQ-COMP-35 P1)", () => {
    const onPatch = vi.fn();
    renderPanel({ onPatch });
    fireEvent.change(screen.getByTestId("accomp-style"), { target: { value: "pop" } });
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ styleId: "pop", density: 2 }), // pop densityDefault
    );
  });

  it("density slider carries aria-valuetext (a11y)", () => {
    renderPanel();
    expect(screen.getByTestId("accomp-density").getAttribute("aria-valuetext")).toContain(
      "density 3",
    );
  });

  it("register offsets: low/standard/high per role -> -12/0/+12", () => {
    const onPatch = vi.fn();
    renderPanel({ onPatch });
    fireEvent.change(screen.getByTestId("accomp-offset-bass"), { target: { value: "-12" } });
    expect(onPatch).toHaveBeenCalledWith(
      expect.objectContaining({ registerOffsets: { bass: -12 } }),
    );
  });

  it(">= 1 role gate: unchecking all roles disables Generate", () => {
    const onPatch = vi.fn();
    const { unmount } = renderPanel({
      request: request({ roles: ["bass"] }),
      onPatch,
    });
    expect((screen.getByTestId("accomp-generate") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId("accomp-role-bass").querySelector("input")!);
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ roles: [] }));
    unmount();
    renderPanel({ request: request({ roles: [] as AccompRole[] }) });
    expect((screen.getByTestId("accomp-generate") as HTMLButtonElement).disabled).toBe(true);
  });

  it("Randomize changes the seed via onPatchRequest (REQ-COMP-36)", () => {
    const onPatch = vi.fn();
    renderPanel({ onPatch });
    fireEvent.click(screen.getByTestId("accomp-randomize"));
    expect(onPatch).toHaveBeenCalledTimes(1);
    const next = onPatch.mock.calls[0][0] as AccompanimentRequest;
    expect(next.seed).not.toBe(42);
    expect(Number.isInteger(next.seed)).toBe(true);
    expect(next.seed).toBeGreaterThanOrEqual(0);
    expect(next.seed).toBeLessThanOrEqual(4294967295);
  });

  it("Generate calls the surface handler (pure call lives in the surface, D71)", () => {
    const onGenerate = vi.fn();
    renderPanel({ onGenerate });
    fireEvent.click(screen.getByTestId("accomp-generate"));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});

describe("result surfaces (D71/D72)", () => {
  it("meta line: style - voicing - patterns - counts - seed", () => {
    const result = generate();
    renderPanel({ result });
    const meta = screen.getByTestId("accomp-meta").textContent ?? "";
    expect(meta).toContain("jazz");
    expect(meta).toContain("drop2");
    expect(meta).toContain("walking");
    expect(meta).toContain("freddieGreen");
    expect(meta).toContain("seed 42");
    expect(meta).toContain("notes");
  });

  it("staleness chip: fingerprint mismatch appears, match hides it", () => {
    const g = grid();
    const result = generate(request(), g);
    const { unmount } = renderPanel({ result, grid: g });
    expect(screen.queryByTestId("accomp-stale")).toBeNull();
    unmount();
    renderPanel({ result, grid: grid(8) }); // different chart
    expect(screen.getByTestId("accomp-stale").textContent).toContain(
      "chart changed since generation - regenerate",
    );
    expect(gridFingerprint(grid(8))).not.toBe(result.meta.gridFingerprint);
  });

  it("preview button: data-preview state machine + accompaniment-only label", () => {
    const result = generate();
    const first = renderPanel({ result, previewState: "idle" });
    const btn = screen.getByTestId("accomp-preview");
    expect(btn.getAttribute("data-preview")).toBe("idle");
    expect(btn.textContent).toContain("Preview (accompaniment)");
    expect((btn as HTMLButtonElement).disabled).toBe(false);
    first.unmount();
    const second = renderPanel({ result, previewState: "rendering" });
    expect(screen.getByTestId("accomp-preview").getAttribute("data-preview")).toBe("rendering");
    expect((screen.getByTestId("accomp-preview") as HTMLButtonElement).disabled).toBe(true);
    second.unmount();
    renderPanel({ result, previewState: "playing" });
    expect(screen.getByTestId("accomp-preview").getAttribute("data-preview")).toBe("playing");
    expect(screen.getByTestId("accomp-preview").textContent).toContain("Stop");
  });

  it("preview disabled without a result; click routes to onPreview", () => {
    const first = renderPanel({ result: null });
    expect((screen.getByTestId("accomp-preview") as HTMLButtonElement).disabled).toBe(true);
    first.unmount();
    const onPreview = vi.fn();
    renderPanel({ result: generate(), onPreview });
    fireEvent.click(screen.getByTestId("accomp-preview"));
    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it("tooltip honesty: tempo override NOT applied (TD-043) + accompaniment only", () => {
    renderPanel({ result: generate() });
    const title = screen.getByTestId("accomp-preview").getAttribute("title") ?? "";
    expect(title).toContain("tempo override is NOT applied");
    expect(title).toContain("Accompaniment only");
  });
});

describe("annotations -> ConceptDrawer (D74, key-remount pattern)", () => {
  it("chips render; a concept chip opens the drawer; a static chip never does", () => {
    const result = generate(request({ roles: ["bass", "chords"], density: 2 }));
    renderPanel({ result });
    const chips = screen.getAllByTestId(/^accomp-ann-(chip|static)-/);
    expect(chips.length).toBeGreaterThan(0);
    const conceptChip = result.annotations.find((a) => a.conceptId !== null);
    expect(conceptChip).toBeDefined();
    fireEvent.click(screen.getByTestId(`accomp-ann-chip-${conceptChip!.id}`));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("walking-bass concept resolves from a density-2 jazz bass line", () => {
    const result = generate(request({ roles: ["bass"], density: 2 }));
    const line = result.annotations.find((a) => a.id === "ann-acc-pattern-bass-0");
    expect(line?.conceptId).toBe("walking-bass");
    renderPanel({ result });
    fireEvent.click(screen.getByTestId("accomp-ann-chip-ann-acc-pattern-bass-0"));
    expect(screen.getByRole("dialog").textContent).toContain("Walking Bass");
  });
});
