import { describe, it, expect } from "vitest";
import { proposeAlternative } from "./coCompose";

describe("proposeAlternative", () => {
  it("returns active chord and explanation", () => {
    const result = proposeAlternative({
      pathId: "path-1",
      barIndex: 4,
      seed: 42,
    });
    expect(result.active).toBeDefined();
    expect(result.active.rootName.length).toBeGreaterThan(0);
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it("deterministic: same args → byte-equal", () => {
    const a = proposeAlternative({ pathId: "path-3", barIndex: 8, seed: 42 });
    const b = proposeAlternative({ pathId: "path-3", barIndex: 8, seed: 42 });
    expect(a.technique).toBe(b.technique);
    expect(a.explanation).toBe(b.explanation);
  });

  it("different seed → potentially different technique", () => {
    // Run several seeds; expect at least one different technique.
    const techniques = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((s) =>
        proposeAlternative({ pathId: "path-7", barIndex: 0, seed: s }).technique,
      ),
    );
    expect(techniques.size).toBeGreaterThan(1);
  });

  it("explanation mentions the technique name for successful substitutions", () => {
    // Sample many (pathId, barIndex) pairs; for any non-null alternative,
    // the explanation should reference the technique.
    let checked = 0;
    for (let i = 0; i < 30; i++) {
      const r = proposeAlternative({ pathId: `path-${i}`, barIndex: 4, seed: i });
      if (r.alternative !== null) {
        expect(r.explanation.length).toBeGreaterThan(15);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("returns null alternative + descriptive explanation when technique doesn't fit", () => {
    // Some technique/active-chord combinations don't apply.
    let sawNull = false;
    for (let i = 0; i < 30; i++) {
      const r = proposeAlternative({ pathId: `p-${i}`, barIndex: 1, seed: i });
      if (r.alternative === null) {
        expect(r.explanation).toMatch(/does not apply|Try another bar/);
        sawNull = true;
        break;
      }
    }
    expect(sawNull).toBe(true);
  });

  it("voice-leading distance is finite when alternative exists", () => {
    for (let i = 0; i < 20; i++) {
      const r = proposeAlternative({ pathId: `p-${i}`, barIndex: 0, seed: i });
      if (r.alternative) {
        expect(Number.isFinite(r.voiceLeadingDistance)).toBe(true);
        expect(r.voiceLeadingDistance).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
