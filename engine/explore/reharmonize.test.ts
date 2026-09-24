/**
 * engine/explore/reharmonize.test.ts - PRD-001 Phase 5 (checklist 3).
 */

import { describe, it, expect } from "vitest";
import { buildCellFromSymbol } from "../compose/chordsym";
import type { ChordCell, KeyCandidate } from "../compose/types";
import { createRng } from "../core/rng";
import {
  reharmonizeProgression,
  progressionFingerprint,
} from "./reharmonize";

const C_MAJOR: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 1 };

function cell(rootPc: number, qualitySymbol: string): ChordCell {
  return buildCellFromSymbol({ rootPc, qualitySymbol, bassPc: null }, C_MAJOR);
}

const II_V_I: readonly ChordCell[] = [cell(2, "m7"), cell(7, "dom7"), cell(0, "maj7")];

describe("reharmonizeProgression", () => {
  it("N=3 alternatives on ii-V-I, each differing >= 1 bar, fingerprint-distinct", () => {
    const alts = reharmonizeProgression(II_V_I, C_MAJOR, createRng(42), 3);
    expect(alts).toHaveLength(3);
    const base = progressionFingerprint(II_V_I);
    const fps = new Set<string>([base]);
    for (const alt of alts) {
      expect(alt).toHaveLength(3);
      const fp = progressionFingerprint(alt.map((c) => c.cell));
      expect(fp).not.toBe(base);
      expect(fps.has(fp)).toBe(false);
      fps.add(fp);
    }
  });

  it("count clamps 1..6 (0 -> 1, 99 -> 6)", () => {
    expect(
      reharmonizeProgression(II_V_I, C_MAJOR, createRng(1), 0),
    ).toHaveLength(1);
    expect(
      reharmonizeProgression(II_V_I, C_MAJOR, createRng(1), 99),
    ).toHaveLength(6);
  });

  it("empty input yields empty alternatives (never throws)", () => {
    const alts = reharmonizeProgression([], C_MAJOR, createRng(1), 3);
    for (const alt of alts) expect(alt).toEqual([]);
  });

  it("all-rest bars carry originals (technique original, cells rest)", () => {
    const rests: readonly ChordCell[] = [cell(0, "maj7"), cell(0, "maj7")].map(
      (c) => ({ ...c, isRest: true, name: "", qualitySymbol: "" }),
    );
    const alts = reharmonizeProgression(rests, C_MAJOR, createRng(7), 2);
    for (const alt of alts) {
      for (const c of alt) {
        expect(c.technique).toBe("original");
        expect(c.cell.isRest).toBe(true);
      }
    }
  });

  it("draw-order pin: same seed runs byte-identical", () => {
    const a = reharmonizeProgression(II_V_I, C_MAJOR, createRng(99), 3);
    const b = reharmonizeProgression(II_V_I, C_MAJOR, createRng(99), 3);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
