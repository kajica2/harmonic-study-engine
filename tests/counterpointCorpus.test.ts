import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { checkSpeciesOne } from "../src/lib/counterpointRules";

interface CorpusCase {
  id: string;
  category: "parallel_fifth" | "parallel_octave" | "contrary_ok" | "oblique_ok";
  melody: number[];
  counterline: number[];
  expectViolation: boolean;
}

const corpus: CorpusCase[] = JSON.parse(
  readFileSync(
    join(__dirname, "../src/lib/__fixtures__/counterpointCases.json"),
    "utf-8",
  ),
);

describe("counterpoint fixture corpus", () => {
  it("loads 100 cases", () => {
    expect(corpus.length).toBe(100);
  });

  it("balanced: 25 each of 4 categories", () => {
    const counts = corpus.reduce<Record<string, number>>((acc, c) => {
      acc[c.category] = (acc[c.category] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.parallel_fifth).toBe(25);
    expect(counts.parallel_octave).toBe(25);
    expect(counts.contrary_ok).toBe(25);
    expect(counts.oblique_ok).toBe(25);
  });

  it("recall ≥ 95% — every expectViolation=true case is flagged, every expectViolation=false case is not", () => {
    let truePositives = 0;
    let falsePositives = 0;
    let trueNegatives = 0;
    let falseNegatives = 0;

    for (const c of corpus) {
      const v = checkSpeciesOne({
        melody: c.melody,
        counterline: c.counterline,
        barIndex: 0,
      });
      const flagged = v.length > 0;
      if (c.expectViolation && flagged) truePositives++;
      if (!c.expectViolation && flagged) falsePositives++;
      if (!c.expectViolation && !flagged) trueNegatives++;
      if (c.expectViolation && !flagged) falseNegatives++;
    }

    const total = truePositives + trueNegatives + falsePositives + falseNegatives;
    const correct = truePositives + trueNegatives;
    const recall = correct / total;

    // Diagnostic
    console.log(
      `TP=${truePositives} FP=${falsePositives} TN=${trueNegatives} FN=${falseNegatives} recall=${(recall * 100).toFixed(1)}%`,
    );

    expect(recall).toBeGreaterThanOrEqual(0.95);
  });
});
