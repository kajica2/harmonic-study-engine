/**
 * src/lib/practiceExpected.test.ts - PRD-001 Phase 7 S3 (D130/D134).
 *
 * THE CROSS-CHECK PIN (docs section 3.4, the anti-drift law): the
 * re-derived guideTonePcs must AGREE with the shipped src oracle
 * (gtTargetsForPath + classifyGuideTone + intervalToRole) over EVERY
 * RAW_PATHS + STUDIES_PATHS + CONCEPT_PATHS path. This is what makes
 * the purity-forced duplication in engine/detect.ts's law-copy safe:
 * drift fails HERE first.
 *
 * Node env (pure data math).
 */

import { describe, it, expect } from "vitest";
import { RAW_PATHS, STUDIES_PATHS } from "./paths";
import { CONCEPT_PATHS } from "./conceptPaths";
import { gtTargetsForPath } from "./gtTargets";
import { classifyGuideTone, intervalToRole } from "./guideTones";
import { buildExpectedGrid, guideTonePcs } from "./practiceExpected";

const ALL_PATHS = [...RAW_PATHS, ...STUDIES_PATHS, ...CONCEPT_PATHS];

function pcOf(n: number): number {
  return ((n % 12) + 12) % 12;
}

describe("guideTonePcs: the intervalToRole law mirror", () => {
  it("3/4 -> third, 10/11 -> seventh, bass-relative (the shipped law)", () => {
    // Dm7 [50,53,57,60]: bass D(2); F=+3 third (pc 5), A=+7 fifth,
    // C=+10 seventh (pc 0).
    expect(guideTonePcs([50, 53, 57, 60])).toEqual([0, 5]);
  });

  it("inversion-agnostic: bass-relative intervals after sorting", () => {
    expect(guideTonePcs([60, 53, 57, 50])).toEqual([0, 5]);
  });

  it("sus/power voicings expose NO guide tones (empty -> free bar)", () => {
    // Csus-ish triad C F G: intervals 0,5,7 -> root/fifth/fifth.
    expect(guideTonePcs([60, 65, 67])).toEqual([]);
    // Power chord C G: 0, 7.
    expect(guideTonePcs([48, 55])).toEqual([]);
  });

  it("empty / garbage -> []", () => {
    expect(guideTonePcs([])).toEqual([]);
    expect(guideTonePcs([Number.NaN, 1.5])).toEqual([]);
  });

  it("both thirds (major 3rd + sus 4) de-dupe to one set", () => {
    // C E F G: E=+4 third, F=+5 fifth -> only E's pc.
    expect(guideTonePcs([60, 64, 65, 67])).toEqual([4]);
  });
});

describe("CROSS-CHECK PIN (D130 law 4): guideTonePcs vs the shipped oracle", () => {
  it("covers a meaningful corpus", () => {
    expect(ALL_PATHS.length).toBeGreaterThanOrEqual(30);
    const totalSteps = ALL_PATHS.reduce((n, p) => n + p.steps.length, 0);
    expect(totalSteps).toBeGreaterThan(500);
  });

  it("non-empty IFF gtTargetsForPath(step).hasGuideTone - EVERY step of EVERY curated path", () => {
    for (const path of ALL_PATHS) {
      const targets = gtTargetsForPath(path);
      expect(targets.length).toBe(path.steps.length);
      for (let s = 0; s < path.steps.length; s++) {
        const pcs = guideTonePcs(path.steps[s].notes);
        expect(
          pcs.length > 0,
          `${path.id} step ${s}: emptiness disagrees with hasGuideTone`,
        ).toBe(targets[s].hasGuideTone);
      }
    }
  });

  it("every returned pc classifies (classifyGuideTone) to role third|seventh", () => {
    for (const path of ALL_PATHS) {
      for (const step of path.steps) {
        const pcs = guideTonePcs(step.notes);
        for (const pc of pcs) {
          const midi = step.notes.find((n) => pcOf(n) === pc);
          expect(midi, `${path.id}: pc ${pc} not present in the step`).toBeDefined();
          const match = classifyGuideTone(midi!, step.notes);
          expect(
            match.role === "third" || match.role === "seventh",
            `${path.id}: pc ${pc} classified as ${match.role}`,
          ).toBe(true);
          expect(match.isGuideTone).toBe(true);
        }
      }
    }
  });

  it("REVERSE: every chord note the oracle calls a guide tone has its pc in the set", () => {
    for (const path of ALL_PATHS) {
      for (const step of path.steps) {
        const pcs = new Set(guideTonePcs(step.notes));
        for (const note of step.notes) {
          const match = classifyGuideTone(note, step.notes);
          if (match.isGuideTone) {
            expect(
              pcs.has(pcOf(note)),
              `${path.id}: oracle gt ${note} (pc ${pcOf(note)}) missing from the copy`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("intervalToRole direct agreement (the law the copy mirrors)", () => {
    for (let interval = 0; interval < 12; interval++) {
      const role = intervalToRole(interval);
      const isGt = role === "third" || role === "seventh";
      // A C-x chord voiced bass C: pc x is a guide tone IFF the law
      // says third/seventh.
      const pcs = guideTonePcs([60, 60 + interval]);
      expect(pcs.length > 0).toBe(isGt && interval !== 0);
    }
  });
});

describe("buildExpectedGrid: kinds + span + rests", () => {
  const sounding = [
    [50, 53, 57, 60], // Dm7 -> target [0,5]
    [55, 53, 59, 62], // G7/F voicing -> no 3rd/7th over bass F -> free
    [], // rest step (empty notes)
    [48, 52, 59, 64], // Cmaj7 -> target
  ];

  it("whole-form grid: target/free/rest kinds", () => {
    const g = buildExpectedGrid(4, sounding, null, new Set());
    expect(g.map((e) => e.kind)).toEqual(["target", "free", "rest", "target"]);
    expect(g[0].pcs).toEqual([0, 5]);
    // Cmaj7 voiced [48,52,59,64] = C E B E: E=+4 third (pc 4),
    // B=+11 seventh (pc 11) -> sorted [4,11].
    expect(g[3].pcs).toEqual([4, 11]);
  });

  it("span slices: only in-span bars enter the grid", () => {
    const g = buildExpectedGrid(4, sounding, { fromBar: 2, toBar: 3 }, new Set());
    expect(g.map((e) => e.bar)).toEqual([2, 3]);
  });

  it("restBars marks pause-phase bars as rest (empty-note rests too)", () => {
    const g = buildExpectedGrid(4, sounding, null, new Set([0]));
    expect(g[0].kind).toBe("rest");
    expect(g[1].kind).toBe("free");
  });

  it("garbage formLen -> empty grid, never throws", () => {
    expect(buildExpectedGrid(Number.NaN, sounding, null, new Set())).toEqual([]);
    expect(buildExpectedGrid(-3, sounding, null, new Set())).toEqual([]);
  });

  it("missing sounding rows degrade to rest (hydrate philosophy)", () => {
    const g = buildExpectedGrid(6, sounding, null, new Set());
    expect(g.length).toBe(6);
    expect(g[4].kind).toBe("rest");
    expect(g[5].kind).toBe("rest");
  });
});
