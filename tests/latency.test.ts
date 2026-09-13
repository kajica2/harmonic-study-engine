import { describe, it, expect } from "vitest";
import { proposeAlternative } from "../src/lib/coCompose";
import { generateQuiz } from "../src/lib/quizEngine";
import { suggestMelody } from "../src/lib/melodyMarkov";
import { planForm } from "../src/lib/formPlanner";
import { enforceStyle } from "../src/lib/styleEnforcer";
import { loadStylePack } from "../src/lib/stylePack";
import { checkSpeciesOne } from "../src/lib/counterpointRules";

/**
 * Latency gating criterion: p95 < 200ms for a 16-bar generation run.
 * The MVP composition algorithms are all pure functions on small
 * inputs, so this should be trivially fast. If a future change makes
 * one slow (e.g. switching to a large-corpus lookup), this test will
 * catch it before shipping.
 */

function percentile(samples: number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(samples.length * p)];
}

describe("composition MVP latency", () => {
  it("p95 < 200ms for 16-bar coCompose across 50 runs", () => {
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      for (let b = 0; b < 16; b++) {
        proposeAlternative({ pathId: `latency-${i}`, barIndex: b, seed: i * 17 + b });
      }
      samples.push(performance.now() - t0);
    }
    const p95 = percentile(samples, 0.95);
    expect(p95).toBeLessThan(200);
    console.log(`coCompose 16-bar p50=${percentile(samples, 0.5).toFixed(1)}ms p95=${p95.toFixed(1)}ms`);
  });

  it("p95 < 200ms for 16-bar quiz generation", () => {
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      for (let b = 0; b < 16; b++) {
        generateQuiz({ pathId: `latency-quiz-${i}`, stepIndex: b, seed: i * 31 + b });
      }
      samples.push(performance.now() - t0);
    }
    const p95 = percentile(samples, 0.95);
    expect(p95).toBeLessThan(200);
    console.log(`quiz 16-bar p50=${percentile(samples, 0.5).toFixed(1)}ms p95=${p95.toFixed(1)}ms`);
  });

  it("p95 < 200ms for 16-bar melody suggestion", () => {
    const samples: number[] = [];
    const chord = [60, 64, 67, 70, 74]; // Cmaj9
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      for (let b = 0; b < 16; b++) {
        suggestMelody({ notes: chord, stepsPerBar: 4, seed: i * 23 + b });
      }
      samples.push(performance.now() - t0);
    }
    const p95 = percentile(samples, 0.95);
    expect(p95).toBeLessThan(200);
    console.log(`melody 16-bar p50=${percentile(samples, 0.5).toFixed(1)}ms p95=${p95.toFixed(1)}ms`);
  });

  it("form planner + style enforcer also under 200ms", () => {
    const samples: number[] = [];
    const cp = loadStylePack("common-practice");
    const melody = [60, 62, 64, 65, 67, 69, 71, 72];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      planForm({ bars: 32, template: "aaba" });
      enforceStyle({
        steps: melody.map((m) => ({
          melody: [m],
          counterline: [m + 7],
        })),
        style: cp,
      });
      checkSpeciesOne({ melody, counterline: melody.map((m) => m + 7), barIndex: 0 });
      samples.push(performance.now() - t0);
    }
    const p95 = percentile(samples, 0.95);
    expect(p95).toBeLessThan(200);
    console.log(`formPlanner+enforcer p50=${percentile(samples, 0.5).toFixed(1)}ms p95=${p95.toFixed(1)}ms`);
  });
});
