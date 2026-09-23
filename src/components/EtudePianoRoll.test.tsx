/**
 * EtudePianoRoll.test.tsx - PRD-001 Phase 3 Slice 2 (T6).
 *
 * jsdom via the src-components TSX glob in vitest.config.ts.
 * Structural assertions only (D25): SVG a11y wiring, rect/column counts, the
 * activeBar class iff the prop is set, the melodySummary golden
 * snippet, and the Okabe-Ito palette constants.
 */

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import {
  EtudePianoRoll,
  melodySummary,
  ROLL_PALETTE,
} from "./EtudePianoRoll";
import { DEFAULT_ETUDE_CONSTRAINTS, generateEtudeFor } from "../lib/etudeEngine";
import type { Etude, EtudeChord } from "../../engine/etude/types";
import { asCanonicalId, asInstanceId } from "../../engine/core/ids";

afterEach(() => {
  cleanup();
});

function chord(bar: number, name: string, rootPc: number, notes: number[]): EtudeChord {
  return { bar, numeral: name, rootPc, qualitySymbol: "maj7", name, notes };
}

const MINI: Etude = {
  version: 1,
  canonicalId: asCanonicalId("etu-roll-mini"),
  instanceId: asInstanceId("i-roll-0000"),
  title: "Roll Mini",
  tempo: 120,
  styleId: "jazz",
  key: 0,
  mode: "major",
  bars: 2,
  difficulty: 3,
  seed: 1,
  chords: [chord(0, "Cmaj7", 0, [60, 64, 67, 71]), chord(1, "G7", 7, [55, 59, 62, 65])],
  melody: [
    { slot: 0, midi: 60, durationSlots: 2, velocity: 0.85, strongBeat: true, syncopated: false },
    { slot: 3, midi: 62, durationSlots: 1, velocity: 0.75, strongBeat: false, syncopated: true },
    { slot: 10, midi: 64, durationSlots: 6, velocity: 0.85, strongBeat: true, syncopated: false },
  ],
  annotations: [],
  constraints: DEFAULT_ETUDE_CONSTRAINTS,
};

const GENERATED: Etude = generateEtudeFor({
  ...DEFAULT_ETUDE_CONSTRAINTS,
  bars: 8,
  seed: 246,
})!;

describe("EtudePianoRoll structure", () => {
  it("svg has role=img + a <title> carrying the summary", () => {
    const { container } = render(
      <EtudePianoRoll etude={MINI} transposeShift={0} />,
    );
    const svg = container.querySelector('svg[role="img"]');
    expect(svg).not.toBeNull();
    const labelledby = svg?.getAttribute("aria-labelledby") ?? "";
    const title = container.querySelector(`title#${CSS.escape(labelledby)}`);
    expect(title?.textContent).toBe(melodySummary(MINI));
  });

  it("note rect count === melody.length; column count === bars * 8", () => {
    const { container } = render(
      <EtudePianoRoll etude={GENERATED} transposeShift={0} />,
    );
    expect(container.querySelectorAll('[data-kind="note"]').length).toBe(
      GENERATED.melody.length,
    );
    expect(container.querySelectorAll('[data-kind="column"]').length).toBe(
      GENERATED.bars * 8,
    );
    expect(container.querySelectorAll('[data-kind="barline"]').length).toBe(
      GENERATED.bars + 1,
    );
  });

  it("activeBar highlight present IFF the prop is set (and in range)", () => {
    const a = render(<EtudePianoRoll etude={MINI} transposeShift={0} />);
    expect(a.container.querySelectorAll(".etu-roll-active-bar").length).toBe(0);
    a.unmount();
    const b = render(
      <EtudePianoRoll etude={MINI} transposeShift={0} activeBar={1} />,
    );
    expect(b.container.querySelectorAll(".etu-roll-active-bar").length).toBe(1);
    b.unmount();
    const c = render(
      <EtudePianoRoll etude={MINI} transposeShift={0} activeBar={9} />,
    );
    expect(c.container.querySelectorAll(".etu-roll-active-bar").length).toBe(0);
  });

  it("syncopated notes get the dashed top edge (non-color cue)", () => {
    const { container } = render(
      <EtudePianoRoll etude={MINI} transposeShift={0} />,
    );
    const syncCount = MINI.melody.filter((n) => n.syncopated).length;
    expect(syncCount).toBe(1);
    expect(container.querySelectorAll('[data-kind="sync-edge"]').length).toBe(
      syncCount,
    );
  });

  it("transposeShift rebases the whole grid uniformly (auto-range)", () => {
    // Rows are computed from the SHIFTED melody + chord extremes, so a
    // uniform shift preserves relative geometry (no-crash + count
    // stability is the contract; the sounding pitches are what move).
    const a = render(<EtudePianoRoll etude={MINI} transposeShift={0} />);
    const hA = a.container.querySelector("svg")?.getAttribute("height");
    const yA = a.container
      .querySelectorAll('[data-kind="note"]')[0]
      .getAttribute("y");
    a.unmount();
    const b = render(<EtudePianoRoll etude={MINI} transposeShift={2} />);
    const hB = b.container.querySelector("svg")?.getAttribute("height");
    const yB = b.container
      .querySelectorAll('[data-kind="note"]')[0]
      .getAttribute("y");
    expect(hB).toBe(hA);
    expect(yB).toBe(yA);
    expect(b.container.querySelectorAll('[data-kind="note"]').length).toBe(
      MINI.melody.length,
    );
  });
});

describe("melodySummary", () => {
  it("golden snippet for the mini fixture", () => {
    expect(melodySummary(MINI)).toBe(
      "2-bar melody, 3 notes, range C4 to E4, 1 syncopated onsets, ends on E4",
    );
  });

  it("generated 8-bar etude summary carries bars + note count", () => {
    const s = melodySummary(GENERATED);
    expect(s.startsWith("8-bar melody, ")).toBe(true);
    expect(s).toContain("notes, range ");
    expect(s).toMatch(/ends on (the tonic|[A-G][b#]?-?\d)/);
  });
});

describe("Okabe-Ito palette (D25)", () => {
  it("melody/syncopated/lane hexes are the colorblind-safe set", () => {
    expect(ROLL_PALETTE.melody).toBe("#0072B2");
    expect(ROLL_PALETTE.syncopated).toBe("#D55E00");
    expect(ROLL_PALETTE.chordLane).toBe("#009E73");
  });
});
