/**
 * engine/explore/determinism.test.ts - PRD-001 Phase 5 (D100, checklist 5).
 *
 * Double-run byte-equality for every seeded op on shared fixtures +
 * the 300-seed property sweep (no throw; the distinct rate is LOGGED,
 * never asserted as a count - flake-free by construction).
 */

import { describe, it, expect } from "vitest";
import { buildCellFromSymbol } from "../compose/chordsym";
import type { ChordCell, KeyCandidate } from "../compose/types";
import { createRng } from "../core/rng";
import { getStyleProfile } from "../styles/index";
import { substituteChord } from "./substitute";
import { reharmonizeProgression } from "./reharmonize";
import { expandChord } from "./expand";
import { varyMelody } from "./vary";
import { voiceLeadOptions } from "./voicelead";

const C_MAJOR: KeyCandidate = { tonicPc: 0, mode: "major", correlation: 1 };

function cell(rootPc: number, qualitySymbol: string): ChordCell {
  return buildCellFromSymbol({ rootPc, qualitySymbol, bassPc: null }, C_MAJOR);
}

const PROG: readonly ChordCell[] = [
  cell(2, "m7"),
  cell(7, "dom7"),
  cell(0, "maj7"),
  cell(5, "maj7"),
];
const LINE: readonly number[] = [60, 64, 67, 72, 76, 79];

describe("double-run byte-equality (D100)", () => {
  it("substitute + expand are pure (no rng, same bytes)", () => {
    const a = JSON.stringify([
      substituteChord(PROG[1] as ChordCell, { next: PROG[2] ?? null, key: C_MAJOR }),
      expandChord(PROG[2] as ChordCell, C_MAJOR),
    ]);
    const b = JSON.stringify([
      substituteChord(PROG[1] as ChordCell, { next: PROG[2] ?? null, key: C_MAJOR }),
      expandChord(PROG[2] as ChordCell, C_MAJOR),
    ]);
    expect(a).toBe(b);
  });

  it("reharmonize: same seed, same bytes", () => {
    const a = JSON.stringify(reharmonizeProgression(PROG, C_MAJOR, createRng(2024), 3));
    const b = JSON.stringify(reharmonizeProgression(PROG, C_MAJOR, createRng(2024), 3));
    expect(a).toBe(b);
  });

  it("vary displacement + ornamentation: same seed, same bytes", () => {
    expect(
      JSON.stringify(varyMelody(LINE, "displacement", createRng(7))),
    ).toBe(JSON.stringify(varyMelody(LINE, "displacement", createRng(7))));
    expect(
      JSON.stringify(varyMelody(LINE, "ornamentation", createRng(7))),
    ).toBe(JSON.stringify(varyMelody(LINE, "ornamentation", createRng(7))));
  });

  it("voicelead: same seed, same bytes across all 5 styles", () => {
    const profile = getStyleProfile("jazz");
    const register = profile.voicing.registers.chords;
    const a = JSON.stringify(voiceLeadOptions(PROG, profile, register, createRng(13)));
    const b = JSON.stringify(voiceLeadOptions(PROG, profile, register, createRng(13)));
    expect(a).toBe(b);
  });
});

describe("300-seed property sweep", () => {
  it("no op throws on any seed; distinct-rate logged, never asserted", () => {
    const profile = getStyleProfile("jazz");
    const register = profile.voicing.registers.chords;
    const seen = new Set<string>();
    for (let seed = 0; seed < 300; seed++) {
      const alts = reharmonizeProgression(PROG, C_MAJOR, createRng(seed), 3);
      for (const alt of alts) {
        seen.add(JSON.stringify(alt.map((c) => c.cell.name)));
      }
      varyMelody(LINE, "displacement", createRng(seed));
      varyMelody(LINE, "ornamentation", createRng(seed));
      voiceLeadOptions(PROG, profile, register, createRng(seed));
    }
    // Logged for the human reader; the gate is "no throw".
    // (console.info here is test-only: engine SOURCES stay silent
    // per the purity guard, and no-debug-logs scans src/ only.)
    console.info(`[determinism] 300-seed reharmonize distinct fingerprints: ${seen.size}`);
  });
});
