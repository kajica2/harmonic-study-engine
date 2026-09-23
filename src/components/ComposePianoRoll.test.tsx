/**
 * src/components/ComposePianoRoll.test.tsx - PRD-001 Phase 4 Slice 2
 * (test plan 8): rect count, tick->x mapping pins, truncation edge +
 * caption, TD-041 gap-absorption caption ONLY when synthesized,
 * rollSummary, empty fallback.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComposePianoRoll, PX_PER_QUARTER, rollSummary } from "./ComposePianoRoll";
import { analyzeFixture } from "./composeFixtures";
import type { MelodyResult, NormalizedNote, NormalizedProject, AnalysisWindow } from "../../engine/compose/types";

function note(midi: number, tick: number, durationTicks: number, velocity = 0.8): NormalizedNote {
  return { midi, tick, durationTicks, velocity };
}

const EMPTY_PROJECT = {
  version: 1,
  format: 1,
  ppq: 480,
  name: "e",
  fileName: "e.mid",
  tempos: [{ tick: 0, bpm: 120 }],
  timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
  keySignatures: [],
  tracks: [],
  endTick: 0,
  durationSec: 0,
  warnings: [],
} satisfies NormalizedProject;

function renderRoll(
  notes: readonly NormalizedNote[],
  opts: { synthesized?: boolean; truncated?: boolean; window?: AnalysisWindow; project?: NormalizedProject } = {},
) {
  const melody: MelodyResult = {
    sourceTrackIndex: opts.synthesized === true ? null : 0,
    synthesized: opts.synthesized === true,
    notes,
  };
  const window = opts.window ?? { fromTick: 0, toTick: 7680 };
  return render(
    <ComposePianoRoll
      project={opts.project ?? EMPTY_PROJECT}
      melody={melody}
      window={window}
      truncated={opts.truncated === true}
    />,
  );
}

describe("rollSummary", () => {
  it("empty -> 'no notes'", () => {
    expect(rollSummary([], 480)).toBe("melody: no notes");
  });
  it("count + range + span in quarters", () => {
    const s = rollSummary([note(60, 0, 480), note(67, 480, 960)], 480);
    expect(s).toContain("2 notes");
    expect(s).toContain("C4");
    expect(s).toContain("G4");
    expect(s).toContain("3 quarter notes");
  });
});

describe("ComposePianoRoll", () => {
  it("renders one rect per note", () => {
    renderRoll([note(60, 0, 480), note(64, 480, 480), note(67, 960, 480)]);
    expect(screen.getAllByTestId("note-rect")).toHaveLength(3);
  });

  it("tick->x mapping: at ppq 480 one quarter = PX_PER_QUARTER px (tick-linear, not seconds)", () => {
    renderRoll([note(60, 480, 480)]);
    const rect = screen.getByTestId("note-rect");
    expect(Number(rect.getAttribute("x"))).toBeCloseTo(480 / 480 * PX_PER_QUARTER + 0.5, 6);
    expect(Number(rect.getAttribute("width"))).toBeCloseTo(PX_PER_QUARTER - 1, 6);
  });

  it("velocity drives fill-opacity 0.35 + 0.65*v (decorative)", () => {
    renderRoll([note(60, 0, 480, 1)]);
    expect(Number(screen.getByTestId("note-rect").getAttribute("fill-opacity"))).toBeCloseTo(1, 6);
  });

  it("empty melody falls back to the 60..72 row band (padded)", () => {
    renderRoll([]);
    const svg = screen.getByTestId("compose-roll-svg");
    // (72+1) - (60-1) + 1 = 15 rows x 6px.
    expect(Number(svg.getAttribute("height"))).toBe(15 * 6);
  });

  it("truncated: window edge line + 'first 4:00 shown' caption; absent otherwise", () => {
    const { unmount } = renderRoll([note(60, 0, 480)], {
      truncated: true,
      window: { fromTick: 0, toTick: 230400 },
    });
    expect(screen.getByTestId("roll-window-edge")).toBeTruthy();
    expect(screen.getByTestId("roll-window-caption").textContent).toContain("first 4:00 shown");
    unmount();
    renderRoll([note(60, 0, 480)], { truncated: false });
    expect(screen.queryByTestId("roll-window-edge")).toBeNull();
    expect(screen.queryByTestId("roll-window-caption")).toBeNull();
  });

  it("TD-041: gap-absorption caption ONLY when the line is synthesized", () => {
    const { unmount } = renderRoll([note(60, 0, 480)], { synthesized: true });
    const caption = screen.getByTestId("roll-gap-caption");
    expect(caption.textContent).toContain("silences are absorbed into note tails");
    unmount();
    renderRoll([note(60, 0, 480)], { synthesized: false });
    expect(screen.queryByTestId("roll-gap-caption")).toBeNull();
  });

  it("aria: role=img labelled with the summary", () => {
    renderRoll([note(60, 0, 480), note(62, 480, 480)]);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("aria-label")).toContain("2 notes");
  });

  it("real fixture melody: rects match the extracted note count + barlines render", () => {
    const { analysis, project } = analyzeFixture({});
    render(
      <ComposePianoRoll
        project={project}
        melody={analysis.melody}
        window={analysis.window}
        truncated={analysis.truncated}
      />,
    );
    expect(screen.getAllByTestId("note-rect")).toHaveLength(analysis.melody.notes.length);
    expect(screen.getAllByTestId("roll-barline").length).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// PRD-001 Phase 4 Slice 3 (test plan 13): the optional accompaniment
// layers. undefined -> byte-identical S2 behavior (the pins above run
// UNEDITED); defined -> per-layer testids + rect counts + serialize.
// ---------------------------------------------------------------------------

describe("S3 layers prop", () => {
  function renderWithLayers(notes: readonly NormalizedNote[], layerNotes: readonly NormalizedNote[]) {
    const melody: MelodyResult = { sourceTrackIndex: 0, synthesized: false, notes };
    return render(
      <ComposePianoRoll
        project={EMPTY_PROJECT}
        melody={melody}
        window={{ fromTick: 0, toTick: 7680 }}
        truncated={false}
        layers={[
          { label: "bass", notes: layerNotes, color: "#E69F00" },
          { label: "chords", notes: layerNotes.slice(0, 2), color: "#56B4E9" },
        ]}
      />,
    );
  }

  it("layers undefined: NO roll-layer-* testids, NO roll-serialize (S2 pins above stay green)", () => {
    renderRoll([note(60, 0, 480)]);
    expect(document.querySelector('[data-testid^="roll-layer-"]')).toBeNull();
    expect(screen.queryByTestId("roll-serialize")).toBeNull();
  });

  it("layers defined: per-layer groups with exact rect counts", () => {
    renderWithLayers(
      [note(72, 0, 480)],
      [note(36, 0, 480), note(43, 480, 480), note(45, 960, 480)],
    );
    expect(screen.getByTestId("roll-layer-bass").querySelectorAll("rect")).toHaveLength(3);
    expect(screen.getByTestId("roll-layer-chords").querySelectorAll("rect")).toHaveLength(2);
    // melody rects are UNCHANGED in count (overlay, not replacement).
    expect(screen.getAllByTestId("note-rect")).toHaveLength(1);
  });

  it("layers widen the semitone band (bass at 36 renders inside the SVG)", () => {
    const { container } = renderWithLayers([note(72, 0, 480)], [note(36, 0, 480)]);
    const svg = screen.getByTestId("compose-roll-svg");
    const height = Number(svg.getAttribute("height"));
    // band must cover 36..72 padded: (73 - 35 + 1) * 6 = 234
    expect(height).toBeGreaterThanOrEqual((73 - 35 + 1) * 6);
    const rect = screen.getByTestId("roll-layer-bass").querySelector("rect");
    expect(rect).not.toBeNull();
    const y = Number(rect!.getAttribute("y"));
    expect(y).toBeGreaterThan(0);
    expect(y + 6).toBeLessThanOrEqual(height);
    void container;
  });

  it("serializeLayers: deterministic string, byte-stable across renders", () => {
    const layers = [
      { label: "bass", notes: [note(36, 0, 480, 0.95)], color: "#E69F00" },
      { label: "chords", notes: [note(60, 0, 240, 0.92)], color: "#56B4E9" },
    ];
    render(
      <ComposePianoRoll
        project={EMPTY_PROJECT}
        melody={{ sourceTrackIndex: 0, synthesized: false, notes: [] }}
        window={{ fromTick: 0, toTick: 7680 }}
        truncated={false}
        layers={layers}
      />,
    );
    const el = screen.getByTestId("roll-serialize");
    expect(el.textContent).toBe("bass:0:36:480:0.9500;chords:0:60:240:0.9200");
  });
});
