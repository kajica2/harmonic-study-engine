/**
 * src/lib/gtTargets.test.ts — pure-function tests for the
 * guide-tone coverage map (FUTURE_PLANNING near-term #3).
 */
import { describe, it, expect } from "vitest";
import {
  gtTargetsForPath,
  getGtTarget,
  gtCoverageCount,
  type GuideToneTarget,
} from "./gtTargets";
import type { HarmonicPath, HarmonicStep } from "./paths";

/** Build a path of N bars where bar i has the given chord notes. */
function pathFromBars(bars: number[][]): HarmonicPath {
  const steps: HarmonicStep[] = [];
  for (const barNotes of bars) {
    for (let beat = 0; beat < 4; beat++) {
      steps.push({
        name: `bar-${steps.length / 4}`,
        notes: barNotes,
        descriptions: "",
      });
    }
  }
  return {
    id: "test",
    title: "Test Path",
    description: "",
    steps,
  };
}

/** Standard chord voicings (root position, octave 4 unless noted). */
const Dm7 = [50, 53, 57, 60]; // D F A C — 3rd=F (interval 3), 7th=C (interval 10)
const G7 = [55, 59, 62, 65]; // G B D F — 3rd=B (4), 7th=F (10)
const Cmaj7 = [48, 52, 55, 59]; // C E G B — 3rd=E (4), 7th=B (11)
const CmajorTriad = [48, 52, 55]; // C E G — 3rd=E (4), no 7th
const C5 = [48, 55]; // C G — power chord, no 3rd, no 7th
const Csus4 = [48, 65, 67]; // C / F / G — C4, F4, G4. F is interval 5 from C
                          // (sus 4th, not a 3rd), G is interval 7 (5th).
                          // No 3rd, no 7th — no guide tone.
const Cmaj9 = [48, 52, 55, 59, 62]; // C E G B D — has 3rd, 7th, and 9th
const Ebmaj7 = [51, 55, 58, 62]; // Eb G Bb D — 3rd=G (4), 7th=D (11)

describe("gtTargetsForPath", () => {
  it("returns one entry per bar (4 steps = 1 bar)", () => {
    const path = pathFromBars([[48, 52, 55], [48, 52, 55]]); // 2 bars
    expect(gtTargetsForPath(path)).toHaveLength(2);
  });

  it("indexes bars 0-based from the start of the path", () => {
    const path = pathFromBars([[48, 52, 55], [50, 53, 57]]);
    const targets = gtTargetsForPath(path);
    expect(targets[0]?.bar).toBe(0);
    expect(targets[1]?.bar).toBe(1);
  });

  it("classifies a Dm7 bar: 3rd + 7th present (both guide tones)", () => {
    const path = pathFromBars([Dm7]);
    const t = gtTargetsForPath(path)[0]!;
    expect(t.hasGuideTone).toBe(true);
    expect(t.targets).toEqual(["3rd", "7th"]);
  });

  it("classifies a Cmaj7 bar: 3rd + 7th present", () => {
    const path = pathFromBars([Cmaj7]);
    const t = gtTargetsForPath(path)[0]!;
    expect(t.hasGuideTone).toBe(true);
    expect(t.targets).toEqual(["3rd", "7th"]);
  });

  it("classifies a G7 bar: 3rd + 7th present (the tritone is the 3rd+7th pair)", () => {
    const path = pathFromBars([G7]);
    const t = gtTargetsForPath(path)[0]!;
    expect(t.hasGuideTone).toBe(true);
    expect(t.targets).toEqual(["3rd", "7th"]);
  });

  it("classifies a major triad: only 3rd, no 7th", () => {
    const path = pathFromBars([CmajorTriad]);
    const t = gtTargetsForPath(path)[0]!;
    expect(t.hasGuideTone).toBe(true);
    expect(t.targets).toEqual(["3rd"]);
  });

  it("classifies a power chord: no guide tones", () => {
    const path = pathFromBars([C5]);
    const t = gtTargetsForPath(path)[0]!;
    expect(t.hasGuideTone).toBe(false);
    expect(t.targets).toEqual([]);
  });

  it("classifies a sus chord: no 3rd means no guide tone", () => {
    // Csus4 = C F G. F is interval 5 from C (a sus 4th, not a 3rd),
    // so no guide tone — the sus chord is the canonical "no guide tone"
    // voicing, which is exactly why FUTURE_PLANNING wants to surface this.
    const path = pathFromBars([Csus4]);
    const t = gtTargetsForPath(path)[0]!;
    expect(t.hasGuideTone).toBe(false);
    expect(t.targets).toEqual([]);
  });

  it("classifies a Cmaj9: 3rd + 7th + 9th (3rd & 7th still count)", () => {
    const path = pathFromBars([Cmaj9]);
    const t = gtTargetsForPath(path)[0]!;
    expect(t.hasGuideTone).toBe(true);
    expect(t.targets).toEqual(["3rd", "7th"]);
  });

  it("recognizes the minor 3rd (interval 3) as a 3rd guide tone", () => {
    // Dm7's 3rd is F = interval 3 (minor 3rd), not 4 (major 3rd).
    // Both intervals should be classified as "3rd".
    const path = pathFromBars([Dm7]);
    const t = gtTargetsForPath(path)[0]!;
    expect(t.targets).toContain("3rd");
  });

  it("recognizes the dominant 7th (interval 10) as a 7th guide tone", () => {
    // G7's 7th is F = interval 10 (minor 7th), not 11 (major 7th).
    const path = pathFromBars([G7]);
    const t = gtTargetsForPath(path)[0]!;
    expect(t.targets).toContain("7th");
  });

  it("returns a mixed map across a real cadence", () => {
    // Dm7 → G7 → Cmaj7 → Dm7 — all three chord types have guide tones.
    const path = pathFromBars([Dm7, G7, Cmaj7, Dm7]);
    const targets = gtTargetsForPath(path);
    expect(targets).toHaveLength(4);
    for (const t of targets) {
      expect(t.hasGuideTone).toBe(true);
      expect(t.targets).toEqual(["3rd", "7th"]);
    }
  });

  it("returns a mixed map with one sus bar flagged correctly", () => {
    // Cmaj7 → Csus4 → Cmaj7 — the middle bar has no guide tones.
    const path = pathFromBars([Cmaj7, Csus4, Cmaj7]);
    const targets = gtTargetsForPath(path);
    expect(targets[0]?.hasGuideTone).toBe(true);
    expect(targets[1]?.hasGuideTone).toBe(false);
    expect(targets[1]?.targets).toEqual([]);
    expect(targets[2]?.hasGuideTone).toBe(true);
  });

  it("handles an empty chord (defensive — padPath edge case)", () => {
    const path = pathFromBars([[]]);
    const t = gtTargetsForPath(path)[0]!;
    expect(t.hasGuideTone).toBe(false);
    expect(t.targets).toEqual([]);
  });

  it("uses the first step of each bar (matches formatChordReadout convention)", () => {
    // Bar 0 = Dm7 (guide tones), Bar 1 = Cmaj7 then changes to Ebmaj7
    // at the 3rd beat. The bar's target reflects Dm7 only — the
    // mid-bar chord change isn't a separate target slot. This is
    // intentional: one target per bar, aligned to the bar readout.
    const steps: HarmonicStep[] = [
      { name: "Dm7-a", notes: Dm7, descriptions: "" },
      { name: "Dm7-b", notes: Dm7, descriptions: "" },
      { name: "Dm7-c", notes: Dm7, descriptions: "" },
      { name: "Dm7-d", notes: Dm7, descriptions: "" },
      { name: "Cmaj7-a", notes: Cmaj7, descriptions: "" },
      { name: "Cmaj7-b", notes: Cmaj7, descriptions: "" },
      { name: "Ebmaj7-c", notes: Ebmaj7, descriptions: "" },
      { name: "Cmaj7-d", notes: Cmaj7, descriptions: "" },
    ];
    const path: HarmonicPath = {
      id: "test",
      title: "Test",
      description: "",
      steps,
    };
    const targets = gtTargetsForPath(path);
    expect(targets[0]?.targets).toEqual(["3rd", "7th"]); // Dm7
    expect(targets[1]?.targets).toEqual(["3rd", "7th"]); // Cmaj7 (first step)
  });
});

describe("getGtTarget", () => {
  it("returns the target for an in-range bar", () => {
    const path = pathFromBars([Dm7, G7]);
    const targets = gtTargetsForPath(path);
    expect(getGtTarget(targets, 0)).toBe(targets[0]);
    expect(getGtTarget(targets, 1)).toBe(targets[1]);
  });

  it("returns null for an out-of-range bar", () => {
    const path = pathFromBars([Dm7]);
    const targets = gtTargetsForPath(path);
    expect(getGtTarget(targets, -1)).toBeNull();
    expect(getGtTarget(targets, 99)).toBeNull();
  });
});

describe("gtCoverageCount", () => {
  it("counts covered and total bars", () => {
    // 4 bars, 2 with guide tones.
    const path = pathFromBars([Dm7, Csus4, G7, C5]);
    const targets = gtTargetsForPath(path);
    expect(gtCoverageCount(targets)).toEqual({ covered: 2, total: 4 });
  });

  it("returns 0/N when no bars have guide tones", () => {
    const path = pathFromBars([Csus4, C5]);
    const targets = gtTargetsForPath(path);
    expect(gtCoverageCount(targets)).toEqual({ covered: 0, total: 2 });
  });

  it("returns N/N when every bar has guide tones", () => {
    const path = pathFromBars([Dm7, G7, Cmaj7, Ebmaj7]);
    const targets = gtTargetsForPath(path);
    expect(gtCoverageCount(targets)).toEqual({ covered: 4, total: 4 });
  });

  it("returns 0/0 for an empty path (no steps)", () => {
    const path: HarmonicPath = { id: "test", title: "Empty", description: "", steps: [] };
    const targets = gtTargetsForPath(path);
    expect(gtCoverageCount(targets)).toEqual({ covered: 0, total: 0 });
  });
});

// Suppress unused-import warning for the GuideToneTarget type re-export
// (some tests above use it implicitly via the return value's shape).
type _Used = GuideToneTarget;
