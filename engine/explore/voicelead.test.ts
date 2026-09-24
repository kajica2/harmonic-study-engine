/**
 * engine/explore/voicelead.test.ts - PRD-001 Phase 5 (checklist 3, D95).
 */

import { describe, it, expect } from "vitest";
import { buildCellFromSymbol } from "../compose/chordsym";
import type { ChordCell, KeyCandidate } from "../compose/types";
import { voiceSequence } from "../compose/voicing";
import { createRng } from "../core/rng";
import { getStyleProfile } from "../styles/index";
import {
  voiceLeadOptions,
  drop2Gate,
  voiceLeadingGate,
  VOICELEAD_ORDER,
} from "./voicelead";

const C_MAJOR: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 1 };

function cell(rootPc: number, qualitySymbol: string): ChordCell {
  return buildCellFromSymbol({ rootPc, qualitySymbol, bassPc: null }, C_MAJOR);
}

const GRID: readonly ChordCell[] = [
  cell(2, "m7"),
  cell(7, "dom7"),
  cell(0, "maj7"),
  cell(0, "maj7"),
];

describe("voiceLeadOptions (D95 re-skin)", () => {
  it("returns all 5 styles in draw order for a 4-bar grid", () => {
    const profile = getStyleProfile("jazz");
    const { options } = voiceLeadOptions(
      GRID,
      profile,
      profile.voicing.registers.chords,
      createRng(5),
    );
    expect(Object.keys(options)).toEqual([...VOICELEAD_ORDER]);
    for (const style of VOICELEAD_ORDER) {
      expect(options[style]).toHaveLength(4);
    }
  });

  it("close matches a direct voiceSequence call (re-skin identity)", () => {
    const profile = getStyleProfile("jazz");
    const register = profile.voicing.registers.chords;
    const { options } = voiceLeadOptions(GRID, profile, register, createRng(9));
    const direct = voiceSequence({
      cells: [GRID],
      profile: {
        ...profile,
        voicing: { ...profile.voicing, style: "close" },
      },
      rng: createRng(9),
      allowRootless: true,
      register,
    });
    expect(options.close).toEqual(direct.voicings[0]);
  });

  it("firstDrop2Bar passthrough equals voiceSequence's realized flag", () => {
    const profile = getStyleProfile("jazz");
    const register = profile.voicing.registers.chords;
    const { firstDrop2Bar } = voiceLeadOptions(
      GRID,
      profile,
      register,
      createRng(9),
    );
    const direct = voiceSequence({
      cells: [GRID],
      profile: {
        ...profile,
        voicing: { ...profile.voicing, style: "drop2" },
      },
      rng: createRng(9),
      allowRootless: true,
      register,
    });
    expect(firstDrop2Bar.drop2).toBe(direct.firstDrop2Bar);
  });

  it("rests voice as nulls preserved per style", () => {
    const profile = getStyleProfile("jazz");
    const register = profile.voicing.registers.chords;
    const withRest: readonly ChordCell[] = [
      GRID[0] as ChordCell,
      {
        ...(GRID[1] as ChordCell),
        isRest: true,
        name: "",
        qualitySymbol: "",
      },
      GRID[2] as ChordCell,
    ];
    const { options } = voiceLeadOptions(
      withRest,
      profile,
      register,
      createRng(3),
    );
    for (const style of VOICELEAD_ORDER) {
      expect(options[style]?.[1]).toBeNull();
      expect(options[style]?.[0]).not.toBeNull();
      expect(options[style]?.[2]).not.toBeNull();
    }
  });

  it("gates read realized data (not style names)", () => {
    // A drop2-style array that is NOT spread fails the gate; a close
    // array that IS smooth passes voice-leading.
    expect(drop2Gate([60, 64, 67, 71])).toBe(false);
    expect(voiceLeadingGate([[60, 64, 67, 71], [60, 64, 67, 72]])).toBe(true);
  });
});
