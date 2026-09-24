/**
 * engine/ear-training/generate.test.ts - PRD-001 Phase 6 (checklist 2).
 *
 * Node env (engine tests are node-project and drift-gate-invisible).
 * 7 types x 5 difficulties (35 cells); conceptIds resolve; rootPc
 * 0..11; midi 0..127; chordSymbols round-trip through chordsym;
 * question ASCII-only; spelling-key rule pinned.
 */

import { describe, it, expect } from "vitest";
import { createRng } from "../core/rng";
import { parseChordSymbol } from "../compose/chordsym";
import { getConcept, CONCEPT_IDS } from "../pedagogy/concepts";
import { generateEarPrompt, spellingKeyFor } from "./generate";
import type { EarDifficulty, EarType } from "./types";
import { isEarType } from "./types";

const TYPES: readonly EarType[] = [
  "interval",
  "chord-quality",
  "chord-inversion",
  "progression",
  "scale",
  "melodic-dictation",
  "harmonic-dictation",
];

const DIFFS: readonly EarDifficulty[] = [1, 2, 3, 4, 5];

function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) return false;
  }
  return true;
}

describe("generateEarPrompt matrix (7 types x 5 difficulties)", () => {
  it("all 35 cells generate with valid shapes", () => {
    for (const type of TYPES) {
      for (const difficulty of DIFFS) {
        const seed = 1 + TYPES.indexOf(type) * 10 + difficulty;
        const prompt = generateEarPrompt({
          type,
          difficulty,
          seed,
          rng: createRng(seed),
        });
        expect(prompt.version).toBe(1);
        expect(prompt.type).toBe(type);
        expect(prompt.difficulty).toBe(difficulty);
        expect(prompt.rootPc).toBeGreaterThanOrEqual(0);
        expect(prompt.rootPc).toBeLessThanOrEqual(11);
        for (const m of prompt.midi) {
          expect(Number.isInteger(m)).toBe(true);
          expect(m).toBeGreaterThanOrEqual(0);
          expect(m).toBeLessThanOrEqual(127);
        }
        expect(isAscii(prompt.question)).toBe(true);
        expect(isAscii(prompt.answerKey)).toBe(true);
        expect(prompt.id.startsWith(`ear-${type}-`)).toBe(true);
        // Midi length contracts.
        if (type === "interval") expect(prompt.midi).toHaveLength(2);
        if (type === "scale") {
          expect(prompt.midi.length).toBeGreaterThanOrEqual(7);
          expect(prompt.midi.length).toBeLessThanOrEqual(8);
        }
        if (type === "melodic-dictation" || type === "harmonic-dictation") {
          expect([4, 6, 8]).toContain(prompt.midi.length);
        }
      }
    }
  });

  it("every prompt carries a non-null registry-resolving conceptId", () => {
    for (const type of TYPES) {
      for (const difficulty of DIFFS) {
        const seed = 100 + TYPES.indexOf(type) * 10 + difficulty;
        const prompt = generateEarPrompt({
          type,
          difficulty,
          seed,
          rng: createRng(seed),
        });
        expect(prompt.conceptId).not.toBeNull();
        expect(CONCEPT_IDS).toContain(prompt.conceptId);
        expect(getConcept(prompt.conceptId)).not.toBeNull();
      }
    }
  });

  it("chordSymbols are spelled via D11 (round-trip through chordsym parse)", () => {
    for (const difficulty of DIFFS) {
      const prompt = generateEarPrompt({
        type: "progression",
        difficulty,
        seed: 500 + difficulty,
        rng: createRng(500 + difficulty),
      });
      expect(prompt.chordSymbols).not.toBeNull();
      for (const sym of prompt.chordSymbols ?? []) {
        expect(parseChordSymbol(sym)).not.toBeNull();
      }
      const harm = generateEarPrompt({
        type: "harmonic-dictation",
        difficulty,
        seed: 600 + difficulty,
        rng: createRng(600 + difficulty),
      });
      expect(harm.chordSymbols).not.toBeNull();
      for (const sym of harm.chordSymbols ?? []) {
        expect(parseChordSymbol(sym)).not.toBeNull();
      }
    }
    // Non-progression/harmonic types carry null chordSymbols.
    for (const type of ["interval", "chord-quality", "chord-inversion", "scale", "melodic-dictation"] as const) {
      const prompt = generateEarPrompt({ type, difficulty: 3, seed: 7, rng: createRng(7) });
      expect(prompt.chordSymbols).toBeNull();
    }
  });

  it("spelling key rule: C major default, A minor for minor-flavored prompts", () => {
    // Minor-family scales resolve to A minor.
    expect(spellingKeyFor("scale", "minor")).toEqual({ tonicPc: 9, mode: "minor" });
    expect(spellingKeyFor("scale", "dorian")).toEqual({ tonicPc: 9, mode: "minor" });
    // Major scales stay C major.
    expect(spellingKeyFor("scale", "major")).toEqual({ tonicPc: 0, mode: "major" });
    expect(spellingKeyFor("scale", "mixolydian")).toEqual({ tonicPc: 0, mode: "major" });
    // Minor-carrying progressions use A minor; plain major stays C.
    expect(spellingKeyFor("progression", "Dm7 G7 Cmaj7").mode).toBe("minor");
    expect(spellingKeyFor("progression", "C G").mode).toBe("major");
    // Intervals always C major.
    expect(spellingKeyFor("interval", "P5")).toEqual({ tonicPc: 0, mode: "major" });
  });

  it("isEarType narrows the 7 kinds and rejects junk", () => {
    for (const t of TYPES) expect(isEarType(t)).toBe(true);
    expect(isEarType("quiz")).toBe(false);
    expect(isEarType("")).toBe(false);
  });

  it("empty-rng sequence never throws (any seed generates)", () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const type of TYPES) {
        expect(() =>
          generateEarPrompt({ type, difficulty: 1, seed, rng: createRng(seed) }),
        ).not.toThrow();
      }
    }
  });
});
