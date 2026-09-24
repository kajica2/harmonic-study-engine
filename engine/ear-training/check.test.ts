/**
 * engine/ear-training/check.test.ts - PRD-001 Phase 6 honesty suite (D113).
 *
 * ENHARMONIC-EQUIVALENCE TABLE + NEGATIVES (PHASE-3-01) + TIMING +
 * PARTIAL (melodic-only). Each negative names the fixture + the
 * forbidden outcome.
 */

import { describe, it, expect } from "vitest";
import { createRng } from "../core/rng";
import { generateEarPrompt } from "./generate";
import { gradeEarAnswer, dictationTimingOk } from "./check";
import type { EarPrompt } from "./types";

function notePrompt(answerKey: string): EarPrompt {
  return {
    version: 1,
    id: "ear-test-note",
    type: "interval",
    difficulty: 1,
    seed: 1,
    rootPc: 0,
    midi: [60, 64],
    chordSymbols: null,
    question: "Which note?",
    conceptId: "voice-leading",
    answerKey,
  };
}

function melodicPrompt(midi: readonly number[]): EarPrompt {
  return {
    version: 1,
    id: "ear-test-melodic",
    type: "melodic-dictation",
    difficulty: 3,
    seed: 1,
    rootPc: 0,
    midi,
    chordSymbols: null,
    question: "Notate the 8 notes",
    conceptId: "voice-leading",
    answerKey: midi.join(","),
  };
}

describe("ENHARMONIC-EQUIVALENCE TABLE (each row: accepted variants, rejected neighbors)", () => {
  const rows: readonly { answer: string; accept: readonly string[]; reject: readonly string[] }[] = [
    { answer: "B", accept: ["B", "Cb", "A##"], reject: ["Bb", "C"] },
    { answer: "E", accept: ["E", "Fb", "D##"], reject: ["Eb", "F"] },
    { answer: "C", accept: ["C", "B#", "Dbb"], reject: ["C#", "Db"] },
    { answer: "F", accept: ["F", "E#", "Gbb"], reject: ["F#", "Gb"] },
    { answer: "A#", accept: ["A#", "Bb"], reject: ["A", "B"] },
    { answer: "C#", accept: ["C#", "Db"], reject: ["C", "D"] },
    { answer: "F#", accept: ["F#", "Gb"], reject: ["F", "G"] },
    { answer: "G#", accept: ["G#", "Ab"], reject: ["G", "A"] },
    { answer: "D#", accept: ["D#", "Eb"], reject: ["D", "E"] },
  ];
  for (const row of rows) {
    it(`answer ${row.answer}: accepts enharmonics, rejects neighbors`, () => {
      const prompt = notePrompt(row.answer);
      for (const variant of row.accept) {
        const g = gradeEarAnswer(prompt, variant);
        expect(g.correct, `accept ${variant} for ${row.answer}`).toBe(true);
      }
      for (const neighbor of row.reject) {
        const g = gradeEarAnswer(prompt, neighbor);
        expect(g.correct, `reject ${neighbor} for ${row.answer}`).toBe(false);
      }
    });
  }
});

describe("NEGATIVES (PHASE-3-01: name the fixture + forbidden outcome)", () => {
  it("string-different/same-pc ACCEPTS (Cb for B must not false-reject)", () => {
    const g = gradeEarAnswer(notePrompt("B"), "Cb");
    expect(g.correct).toBe(true);
  });

  it("string-similar/different-pc REJECTS (B for Bb fails despite one-char overlap)", () => {
    const g = gradeEarAnswer(notePrompt("Bb"), "B");
    expect(g.correct).toBe(false);
  });

  it("quality aliases accept (m7b5 == halfdim must not false-reject)", () => {
    const prompt: EarPrompt = {
      version: 1,
      id: "ear-q",
      type: "chord-quality",
      difficulty: 3,
      seed: 1,
      rootPc: 0,
      midi: [60, 63, 66, 70],
      chordSymbols: null,
      question: "Which chord quality?",
      conceptId: "drop-2",
      answerKey: "halfdim",
    };
    expect(gradeEarAnswer(prompt, "m7b5").correct).toBe(true);
    expect(gradeEarAnswer(prompt, "halfdim").correct).toBe(true);
  });

  it("wrong quality rejects even with right root (Cmaj7 for Cm7 fails)", () => {
    const prompt: EarPrompt = {
      version: 1,
      id: "ear-q2",
      type: "chord-quality",
      difficulty: 2,
      seed: 1,
      rootPc: 0,
      midi: [60, 63, 67, 70],
      chordSymbols: null,
      question: "Which chord quality?",
      conceptId: "drop-2",
      answerKey: "m7",
    };
    expect(gradeEarAnswer(prompt, "maj7").correct).toBe(false);
  });

  it("checker echoes the prompt conceptId (REQ-PED-25 wiring)", () => {
    const prompt = generateEarPrompt({ type: "scale", difficulty: 1, seed: 9, rng: createRng(9) });
    const g = gradeEarAnswer(prompt, prompt.answerKey);
    expect(g.conceptId).toBe(prompt.conceptId);
  });
});

describe("TIMING (dictation onset within max(120ms, 15% slot))", () => {
  it("accepts inside tolerance (latency subtracted first)", () => {
    // Slot 250ms -> tolerance max(120, 37.5) = 120ms.
    expect(dictationTimingOk(100, 250)).toBe(true);
    expect(dictationTimingOk(120, 250)).toBe(true);
    // Latency 50ms: error 150ms -> effective 100ms -> accept.
    expect(dictationTimingOk(150, 250, 50)).toBe(true);
  });

  it("rejects outside tolerance", () => {
    expect(dictationTimingOk(121, 250)).toBe(false);
    expect(dictationTimingOk(500, 250)).toBe(false);
    // Large slot: 15% dominates (slot 2000ms -> 300ms tolerance).
    expect(dictationTimingOk(250, 2000)).toBe(true);
    expect(dictationTimingOk(301, 2000)).toBe(false);
  });

  it("gradeEarAnswer gates dictation correctness on timing when provided", () => {
    const prompt = melodicPrompt([60, 62, 64, 65]);
    const good = gradeEarAnswer(prompt, "60,62,64,65", { onsetErrorMs: 50, slotMs: 250 });
    expect(good.correct).toBe(true);
    const bad = gradeEarAnswer(prompt, "60,62,64,65", { onsetErrorMs: 500, slotMs: 250 });
    expect(bad.correct).toBe(false);
    expect(bad.detail).toContain("timing");
  });
});

describe("PARTIAL (melodic ONLY)", () => {
  it("melodic 6/8 pcs + right contour -> partial ~0.85, correct true", () => {
    const prompt = melodicPrompt([60, 62, 64, 65, 67, 69, 71, 72]);
    // 6/8 correct (last two wrong) but contour preserved (ascending).
    const g = gradeEarAnswer(prompt, "60,62,64,65,67,69,70,71");
    expect(g.partial).not.toBeNull();
    expect(g.partial as number).toBeGreaterThanOrEqual(0.84);
    expect(g.partial as number).toBeLessThanOrEqual(0.86);
    expect(g.correct).toBe(true);
  });

  it("melodic 3/8 pcs -> partial < 0.5, correct false", () => {
    const prompt = melodicPrompt([60, 62, 64, 65, 67, 69, 71, 72]);
    const g = gradeEarAnswer(prompt, "60,62,64,60,60,60,60,61");
    expect(g.partial as number).toBeLessThan(0.5);
    expect(g.correct).toBe(false);
  });

  it("non-melodic types always partial null", () => {
    const scale = generateEarPrompt({ type: "scale", difficulty: 1, seed: 11, rng: createRng(11) });
    expect(gradeEarAnswer(scale, scale.answerKey).partial).toBeNull();
    const harm = generateEarPrompt({ type: "harmonic-dictation", difficulty: 1, seed: 12, rng: createRng(12) });
    const hg = gradeEarAnswer(harm, harm.answerKey);
    expect(hg.partial).toBeNull();
    expect(hg.correct).toBe(true);
  });

  it("dictation accepts note-name spellings positionally (C D E == 60,62,64)", () => {
    const prompt = melodicPrompt([60, 62, 64]);
    expect(gradeEarAnswer(prompt, "C D E").correct).toBe(true);
    expect(gradeEarAnswer(prompt, "60,62,64").correct).toBe(true);
    expect(gradeEarAnswer(prompt, "C D F").correct).toBe(false);
  });
});
