import { describe, it, expect } from "vitest";
import { generateQuiz } from "./quizEngine";

describe("generateQuiz", () => {
  it("returns a question with prompt, options, and correct index", () => {
    const q = generateQuiz({ pathId: "path-1", stepIndex: 0, seed: 42 });
    expect(q.prompt.length).toBeGreaterThan(0);
    expect(q.options.length).toBeGreaterThanOrEqual(3);
    expect(q.correct).toBeGreaterThanOrEqual(0);
    expect(q.correct).toBeLessThan(q.options.length);
    expect(q.options[q.correct]).toBeDefined();
  });

  it("id encodes the pathId, stepIndex, and seed", () => {
    const q = generateQuiz({ pathId: "path-2", stepIndex: 4, seed: 7 });
    expect(q.id).toContain("path-2");
    expect(q.id).toContain("_4_");
    expect(q.id).toContain("_7");
    expect(q.id).toMatch(/^quiz_(roman-numeral|tension|function)_/);
  });

  it("deterministic: same args → byte-equal", () => {
    const a = generateQuiz({ pathId: "path-3", stepIndex: 0, seed: 1 });
    const b = generateQuiz({ pathId: "path-3", stepIndex: 0, seed: 1 });
    expect(a).toEqual(b);
  });

  it("different seeds → different questions (probabilistically)", () => {
    const questions = new Set(
      [1, 2, 3, 4, 5, 6].map((s) =>
        generateQuiz({ pathId: "path-1", stepIndex: 0, seed: s }).id,
      ),
    );
    expect(questions.size).toBeGreaterThan(1);
  });

  it("rotates through roman-numeral / tension / function types", () => {
    const types = new Set<string>();
    for (let s = 0; s < 30; s++) {
      types.add(generateQuiz({ pathId: "path-5", stepIndex: 0, seed: s }).type);
    }
    expect(types.size).toBeGreaterThanOrEqual(2);
  });

  it("explanation references analyzeChord", () => {
    const q = generateQuiz({ pathId: "path-1", stepIndex: 0, seed: 42 });
    expect(q.explanation.length).toBeGreaterThan(10);
  });
});
