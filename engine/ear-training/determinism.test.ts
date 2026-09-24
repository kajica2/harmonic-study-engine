/**
 * engine/ear-training/determinism.test.ts - PRD-001 Phase 6 (D100 precedent).
 *
 * Double-run byte-equality for all 7 types on shared fixtures;
 * 300-seed sweep (no throw, id-stable, never asserted as a count).
 */

import { describe, it, expect } from "vitest";
import { createRng } from "../core/rng";
import { canonicalize } from "../core/ids";
import { generateEarPrompt } from "./generate";
import type { EarDifficulty, EarType } from "./types";

const TYPES: readonly EarType[] = [
  "interval",
  "chord-quality",
  "chord-inversion",
  "progression",
  "scale",
  "melodic-dictation",
  "harmonic-dictation",
];

describe("determinism: double-run byte-equality", () => {
  it("same (type, difficulty, seed) generates byte-identical prompts", () => {
    for (const type of TYPES) {
      for (const difficulty of [1, 3, 5] as const) {
        const seed = 42;
        const a = generateEarPrompt({ type, difficulty: difficulty as EarDifficulty, seed, rng: createRng(seed) });
        const b = generateEarPrompt({ type, difficulty: difficulty as EarDifficulty, seed, rng: createRng(seed) });
        expect(canonicalize(a)).toBe(canonicalize(b));
      }
    }
  });
});

describe("300-seed sweep (flake-free, D100 precedent)", () => {
  it("no throw across 300 seeds x 7 types; ids stable per seed", () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const type of TYPES) {
        const a = generateEarPrompt({ type, difficulty: 3, seed, rng: createRng(seed) });
        const b = generateEarPrompt({ type, difficulty: 3, seed, rng: createRng(seed) });
        expect(a.id).toBe(b.id);
        expect(a.midi.length).toBeGreaterThan(0);
      }
    }
  });
});
