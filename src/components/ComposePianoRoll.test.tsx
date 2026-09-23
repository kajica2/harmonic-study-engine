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
