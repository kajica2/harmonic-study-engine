/**
 * engine/practice/detect.test.ts - PRD-001 Phase 7 S3 (D129/D130).
 *
 * RED-FIRST: law 4 (the latency-compensation borderline flip) is the
 * REQ-PRAC-42 load-bearing pin and was written + run RED before
 * detect.ts existed. Laws 1-9 per docs/PHASE-7-S3-DETECTION.md 3.1.
 *
 * Node env (pure math, no DOM). The conservation sweep uses the
 * injected mulberry32 from engine/core/rng IN THE TEST ONLY -
 * detect.ts itself imports nothing (purity law 8).
 */

import { describe, it, expect } from "vitest";
import {
  assignBar,
  matchPhrase,
  type ExpectedBar,
  type MatchInput,
  type PerformedNote,
} from "./detect";
import { createRng } from "../core/rng";

const TOL = 120;
const B0 = 10_000; // bar 0 boundary (wall ms)
const B1 = 12_000; // bar 1 boundary (2000 ms bar = 120 BPM 4/4)
const B2 = 14_000; // bar 2 boundary
const B4 = 18_000; // bar 4 boundary

function target(bar: number, start: number, pcs: number[]): ExpectedBar {
  void start;
  return { bar, kind: "target", pcs };
}

function run(over: Partial<MatchInput>): ReturnType<typeof matchPhrase> {
  return matchPhrase({
    expected: over.expected ?? [],
    boundariesMs: over.boundariesMs ?? [],
    performed: over.performed ?? [],
    toleranceMs: over.toleranceMs ?? TOL,
    latencyCompensationMs: over.latencyCompensationMs ?? 0,
  });
}

describe("detect law 4: LATENCY COMPENSATION IS LOAD-BEARING (REQ-PRAC-42)", () => {
  // THE pin: a borderline tap (raw OUT of the window, compensated IN)
  // matches ONLY when compensation > 0. Removing the subtraction flips
  // matched -> missed. This is what makes the latency wizard + the
  // stored record real, not decoration.
  it("borderline tap flips missed -> matched ONLY when compensation is applied", () => {
    const expected = [target(0, B0, [2, 5])];
    const boundariesMs = [B0];
    // Dressed as a pc-5 note landing 130 ms after the boundary:
    // raw |offset| = 130 > 120 tolerance -> OUT of the window.
    const performed: PerformedNote[] = [{ note: 65, atMs: B0 + 130 }];

    const uncompensated = run({ expected, boundariesMs, performed, latencyCompensationMs: 0 });
    expect(uncompensated.matched).toBe(0);
    expect(uncompensated.matchedFraction).toBe(0);
    expect(uncompensated.missedNotes).toEqual([2, 5]);
    // The late right-note lands in the extra bucket (timing error).
    expect(uncompensated.extraNotes).toEqual([5]);
    expect(uncompensated.wrongNotes).toEqual([]);

    const compensated = run({ expected, boundariesMs, performed, latencyCompensationMs: 50 });
    // compensated onset = B0 + 130 - 50 = B0 + 80, inside +/-120.
    expect(compensated.matched).toBe(1);
    expect(compensated.matchedFraction).toBeCloseTo(0.5, 10);
    expect(compensated.missedNotes).toEqual([2]);
    expect(compensated.extraNotes).toEqual([]);
    // Signed offset measured AFTER compensation: +80 ms (late).
    expect(compensated.avgOffsetMs).toBeCloseTo(80, 10);
  });

  it("D134.5 derivation: a perfect tap leaves EXACTLY zero residual", () => {
    // A perfect tap arrives at E + output + midiPath + bias where E is
    // the emission (boundary) wall time. The wizard stores
    // input = median(rawOffsets) - output = midiPath + bias.
    // compensated = tap - input - output = E -> offset 0, always.
    const E = 50_000;
    const output = 23;
    const midiPath = 9;
    const bias = 11;
    const tap = E + output + midiPath + bias;
    const input = midiPath + bias; // what the wizard would store
    const m = run({
      expected: [target(0, E, [7])],
      boundariesMs: [E],
      performed: [{ note: 55, atMs: tap }],
      latencyCompensationMs: input + output,
    });
    expect(m.matched).toBe(1);
    expect(m.avgOffsetMs).toBeCloseTo(0, 10);
  });

  it("compensation applies BEFORE any comparison - a real subtraction both ways", () => {
    // A note raw IN bar 1's window (B1 + 110): a 250 ms compensation
    // pushes it to B1 - 140, OUT of the window (still inside the
    // phrase, nearer to B1 than B0) -> the right pc becomes a timing
    // EXTRA. Compensation is a genuine subtraction applied before
    // every comparison, not a one-way forgiveness fudge.
    const expected = [target(0, B0, [9]), target(1, B1, [4])];
    const boundariesMs = [B0, B1];
    const performed: PerformedNote[] = [{ note: 64, atMs: B1 + 110 }];
    expect(run({ expected, boundariesMs, performed }).matched).toBe(1);
    const flipped = run({ expected, boundariesMs, performed, latencyCompensationMs: 250 });
    expect(flipped.matched).toBe(0);
    expect(flipped.extraNotes).toEqual([4]);
    expect(flipped.missedNotes).toEqual([4, 9]);
  });
});

describe("detect law 1: PC EQUALITY + integer guard", () => {
  it("octave-agnostic: any octave of the pc matches", () => {
    const expected = [target(0, B0, [5])];
    for (const note of [41, 53, 65, 77, 89]) {
      const m = run({
        expected,
        boundariesMs: [B0],
        performed: [{ note, atMs: B0 + 10 }],
      });
      expect(m.matched, `note ${note}`).toBe(1);
    }
  });

  it("negative / NaN / non-integer notes are UNSCORED (no bucket, no crash)", () => {
    const expected = [target(0, B0, [5])];
    const m = run({
      expected,
      boundariesMs: [B0],
      performed: [
        { note: -5, atMs: B0 },
        { note: Number.NaN, atMs: B0 },
        { note: 60.5, atMs: B0 },
        { note: 60, atMs: Number.NaN },
        { note: 999, atMs: B0 },
      ],
    });
    expect(m.matched).toBe(0);
    expect(m.wrongNotes).toEqual([]);
    expect(m.extraNotes).toEqual([]);
    expect(m.missedNotes).toEqual([5]);
    // matched + wrong + extra + rest == notes-in-scored-bars == 0.
    expect(m.bars[0].restExtras).toBe(0);
  });
});

describe("detect law 2: WINDOW boundary +/- 1 ms flip + greedy nearest", () => {
  it("inclusive window: 120 in, 121 out (flips at the edge)", () => {
    const expected = [target(0, B0, [5])];
    const inEdge = run({ expected, boundariesMs: [B0], performed: [{ note: 65, atMs: B0 + 120 }] });
    expect(inEdge.matched).toBe(1);
    const outEdge = run({ expected, boundariesMs: [B0], performed: [{ note: 65, atMs: B0 + 121 }] });
    expect(outEdge.matched).toBe(0);
    const earlyIn = run({ expected, boundariesMs: [B0], performed: [{ note: 65, atMs: B0 - 120 }] });
    expect(earlyIn.matched).toBe(1);
    const earlyOut = run({ expected, boundariesMs: [B0], performed: [{ note: 65, atMs: B0 - 121 }] });
    expect(earlyOut.matched).toBe(0);
  });

  it("greedy NEAREST per pc; a note matches at most one pc", () => {
    // Two notes claim pc 5; the nearer one matches, the other is an
    // overflow extra. pc 7 has no claim -> missed.
    const expected = [target(0, B0, [5, 7])];
    const m = run({
      expected,
      boundariesMs: [B0],
      performed: [
        { note: 65, atMs: B0 + 100 }, // pc 5, far
        { note: 77, atMs: B0 + 20 }, // pc 5, near -> WINS
      ],
    });
    expect(m.matched).toBe(1);
    expect(m.bars[0].matchedPcs).toEqual([5]);
    expect(m.extraNotes).toEqual([5]);
    expect(m.missedNotes).toEqual([7]);
  });

  it("greedy tie on |offset| -> EARLIER note wins", () => {
    const expected = [target(0, B0, [5])];
    const m = run({
      expected,
      boundariesMs: [B0],
      performed: [
        { note: 65, atMs: B0 - 50 }, // earlier
        { note: 65, atMs: B0 + 50 }, // same |offset|, later
      ],
    });
    expect(m.matched).toBe(1);
    expect(m.avgOffsetMs).toBeCloseTo(-50, 10); // the earlier note's offset
    expect(m.extraNotes).toEqual([5]);
  });

  it("engine tolerance floor 60: a 10 ms config still matches at 60", () => {
    const expected = [target(0, B0, [5])];
    const m = run({
      expected,
      boundariesMs: [B0],
      performed: [{ note: 65, atMs: B0 + 60 }],
      toleranceMs: 10,
    });
    expect(m.matched).toBe(1);
  });
});

describe("detect law 3: BUCKET TOTALITY (kinds)", () => {
  it("wrong = right bar, pitch NOT expected (any window position)", () => {
    const expected = [target(0, B0, [5])];
    const m = run({
      expected,
      boundariesMs: [B0],
      performed: [
        { note: 66, atMs: B0 + 10 }, // in window, wrong pc
        { note: 67, atMs: B0 + 400 }, // out of window, wrong pc
      ],
    });
    expect(m.wrongNotes).toEqual([6, 7]);
    expect(m.matched).toBe(0);
    expect(m.missedNotes).toEqual([5]);
  });

  it("extra flavors share the bucket: overflow + late-right-note", () => {
    const expected = [target(0, B0, [5])];
    const m = run({
      expected,
      boundariesMs: [B0],
      performed: [
        { note: 65, atMs: B0 + 10 }, // matched
        { note: 65, atMs: B0 + 30 }, // overflow extra
        { note: 65, atMs: B0 + 300 }, // late right-note extra
      ],
    });
    expect(m.matched).toBe(1);
    expect(m.bars[0].extraPcs).toEqual([5]);
    expect(m.wrongNotes).toEqual([]);
    expect(m.missedNotes).toEqual([]);
  });

  it("rest bar: any note is a rest-extra; no missed/wrong math", () => {
    const expected: ExpectedBar[] = [{ bar: 0, kind: "rest", pcs: [] }];
    const m = run({
      expected,
      boundariesMs: [B0],
      performed: [
        { note: 60, atMs: B0 + 5 },
        { note: 61, atMs: B0 + 900 },
      ],
    });
    expect(m.bars[0].restExtras).toBe(2);
    expect(m.matched).toBe(0);
    expect(m.expectedTotal).toBe(0);
    expect(m.matchedFraction).toBe(0);
    // Rest extras DO hurt accuracy (denominator-free penalty law).
    expect(m.accuracyPct).toBe(0);
  });

  it("free bars are unscored: notes there match nothing, penalized nowhere", () => {
    const expected: ExpectedBar[] = [{ bar: 0, kind: "free", pcs: [] }];
    const m = run({
      expected,
      boundariesMs: [B0],
      performed: [
        { note: 60, atMs: B0 },
        { note: 61, atMs: B0 + 500 },
      ],
    });
    expect(m.matched).toBe(0);
    expect(m.wrongNotes).toEqual([]);
    expect(m.extraNotes).toEqual([]);
    expect(m.missedNotes).toEqual([]);
    expect(m.accuracyPct).toBe(0); // denom 0 -> 0, never NaN
  });

  it("notes OUTSIDE the phrase (before first - tol) are unscored", () => {
    const expected = [target(0, B0, [5])];
    const m = run({
      expected,
      boundariesMs: [B0],
      performed: [{ note: 65, atMs: B0 - 500 }],
    });
    expect(m.matched).toBe(0);
    expect(m.extraNotes).toEqual([]);
    expect(m.wrongNotes).toEqual([]);
  });
});

describe("detect law 5: EMPTY GUARDS", () => {
  it("zero-length everything -> total zero result, no throw, no NaN", () => {
    const m = run({ expected: [], boundariesMs: [], performed: [] });
    expect(m).toMatchObject({
      bars: [],
      matched: 0,
      expectedTotal: 0,
      matchedFraction: 0,
      accuracyPct: 0,
      avgOffsetMs: null,
      avgAbsOffsetMs: null,
    });
    expect(Number.isNaN(m.matchedFraction)).toBe(false);
  });

  it("empty performed -> all missed, avgOffset null", () => {
    const m = run({ expected: [target(0, B0, [1, 5])], boundariesMs: [B0], performed: [] });
    expect(m.matched).toBe(0);
    expect(m.missedNotes).toEqual([1, 5]);
    expect(m.avgOffsetMs).toBeNull();
  });
});

describe("detect law 6: AGGREGATES are pcs sorted/de-duped; per-bar keeps counts", () => {
  it("aggregated arrays are sorted de-duped pcs; accuracyPct includes restExtras", () => {
    const expected: ExpectedBar[] = [
      target(0, B0, [5]),
      { bar: 1, kind: "rest", pcs: [] },
      target(2, B4, [3, 10]),
    ];
    const m = run({
      expected,
      boundariesMs: [B0, B1, B2],
      performed: [
        { note: 65, atMs: B0 + 10 }, // matched pc 5 (bar 0)
        { note: 65, atMs: B0 + 20 }, // overflow extra pc 5
        { note: 60, atMs: B1 + 10 }, // rest-extra (bar 1)
        { note: 63, atMs: B2 + 10 }, // matched pc 3
        { note: 64, atMs: B2 + 10 }, // wrong pc 4
      ],
    });
    expect(m.extraNotes).toEqual([5]);
    expect(m.wrongNotes).toEqual([4]);
    expect(m.missedNotes).toEqual([10]);
    // matched 2, missed 1, wrong 1, extra 1, rest 1 -> 2/6.
    expect(m.accuracyPct).toBeCloseTo((2 / 6) * 100, 10);
    expect(m.bars[0].extraPcs.length).toBe(1); // de-duped per bar too
  });
});

describe("detect law 7: NO-OVERLAP + assignBar", () => {
  it("assignBar: inside/outside window, null before the phrase, nearest wins", () => {
    const bs = [B0, B1];
    expect(assignBar(B0 + 50, bs, TOL)).toEqual({ bar: 0, inWindow: true });
    expect(assignBar(B0 + 150, bs, TOL)).toEqual({ bar: 0, inWindow: false });
    expect(assignBar(B1 - 150, bs, TOL)).toEqual({ bar: 1, inWindow: false });
    expect(assignBar(B0 - 121, bs, TOL)).toBeNull();
    expect(assignBar(B1 + 121, bs, TOL)).toEqual({ bar: 1, inWindow: false }); // within one gap past last
    expect(assignBar(B1 + 121 + 2001, bs, TOL)).toBeNull(); // past the tail cutoff
    expect(assignBar(Number.NaN, bs, TOL)).toBeNull();
    expect(assignBar(B0, [], TOL)).toBeNull();
  });

  it("pathological overlapping windows: nearest boundary wins, TIE -> EARLIER", () => {
    // Boundaries 100 ms apart, tol 300 -> windows overlap.
    const bs = [1000, 1100];
    expect(assignBar(1080, bs, 300)).toEqual({ bar: 1, inWindow: true }); // nearer to 1100
    expect(assignBar(1020, bs, 300)).toEqual({ bar: 0, inWindow: true }); // nearer to 1000
    // Exact midpoint tie (dist 50 vs 50): EARLIER boundary wins.
    expect(assignBar(1050, bs, 300)).toEqual({ bar: 0, inWindow: true });
  });

  it("at max tolerance 300 the shortest legal bar (1000 ms) never double-assigns", () => {
    const bs = [0, 1000, 2000];
    for (let t = -400; t <= 2400; t += 7) {
      const a = assignBar(t, bs, 300);
      if (a !== null && a.inWindow) {
        // Exactly one window contains any in-window note.
        const containing = bs.filter((b) => Math.abs(t - b) <= 300);
        expect(containing.length).toBe(1);
      }
    }
  });
});

describe("detect law 8: PURE + DETERMINISTIC", () => {
  it("same inputs -> deep-equal outputs (idempotence)", () => {
    const input: MatchInput = {
      expected: [target(0, B0, [1, 3, 5]), { bar: 1, kind: "rest", pcs: [] }, target(2, B2, [7])],
      boundariesMs: [B0, B1, B2],
      performed: [
        { note: 61, atMs: B0 + 5 },
        { note: 63, atMs: B0 + 90 },
        { note: 60, atMs: B1 + 40 },
        { note: 67, atMs: B2 + 10 },
        { note: 67, atMs: B2 + 11 },
      ],
      toleranceMs: TOL,
      latencyCompensationMs: 33,
    };
    expect(matchPhrase(input)).toEqual(matchPhrase(input));
  });
});

describe("detect law 9: BOUNDARY MISMATCH -> shared prefix, never crash", () => {
  it("more expected than boundaries: extra bars unscored", () => {
    const m = run({
      expected: [target(0, B0, [5]), target(1, B1, [7])],
      boundariesMs: [B0],
      performed: [{ note: 67, atMs: B1 }],
    });
    expect(m.bars.length).toBe(1);
    expect(m.expectedTotal).toBe(1);
    expect(m.bars[0].missedPcs).toEqual([5]);
  });

  it("more boundaries than expected: extra boundaries unscored", () => {
    const m = run({
      expected: [target(0, B0, [5])],
      boundariesMs: [B0, B1],
      performed: [{ note: 65, atMs: B1 + 10 }],
    });
    expect(m.bars.length).toBe(1);
    // The note past the prefix is attributed to the nearest PREFIX
    // boundary (bar 0) as an out-of-window extra - total, not crash.
    expect(m.extraNotes).toEqual([5]);
  });

  it("NaN boundary does not throw", () => {
    const m = run({
      expected: [target(0, Number.NaN, [5])],
      boundariesMs: [Number.NaN],
      performed: [{ note: 65, atMs: B0 }],
    });
    expect(m.matched).toBe(0);
  });
});

describe("detect: signed offset honesty (avgOffset vs avgAbs)", () => {
  it("signed means can cancel - avgAbsOffsetMs reports the true spread", () => {
    const expected = [target(0, B0, [1, 5])];
    const m = run({
      expected,
      boundariesMs: [B0],
      performed: [
        { note: 61, atMs: B0 - 100 }, // pc 1, early
        { note: 65, atMs: B0 + 100 }, // pc 5, late
      ],
    });
    expect(m.matched).toBe(2);
    expect(m.avgOffsetMs).toBeCloseTo(0, 10);
    expect(m.avgAbsOffsetMs).toBeCloseTo(100, 10);
  });
});

describe("detect: PHASE-3-01 NEGATIVE FIXTURE", () => {
  it("two performances differing ONLY in one pc -> wrongNotes differ, all else equal", () => {
    const expected = [target(0, B0, [2, 5])];
    const boundariesMs = [B0];
    const base = { expected, boundariesMs, toleranceMs: TOL, latencyCompensationMs: 0 };
    const good = run({ ...base, performed: [{ note: 62, atMs: B0 + 10 }, { note: 65, atMs: B0 + 20 }] });
    const bad = run({ ...base, performed: [{ note: 62, atMs: B0 + 10 }, { note: 66, atMs: B0 + 20 }] });
    expect(good.matched).toBe(2);
    expect(good.wrongNotes).toEqual([]);
    expect(good.missedNotes).toEqual([]);
    expect(bad.matched).toBe(1);
    expect(bad.wrongNotes).toEqual([6]);
    expect(bad.missedNotes).toEqual([5]);
    // Everything that DIDN'T change stays equal (discriminative diff).
    expect(bad.expectedTotal).toBe(good.expectedTotal);
    expect(bad.extraNotes).toEqual(good.extraNotes);
    expect(bad.bars[1]).toBeUndefined();
    expect(good.bars[0].matchedPcs).toEqual([2, 5]);
    expect(bad.bars[0].matchedPcs).toEqual([2]);
  });
});

describe("detect: conservation property sweep (injected mulberry32)", () => {
  // ORACLE-COPY discipline (duty.ts law 2 precedent): the test
  // re-implements the assignment law INDEPENDENTLY and asserts the
  // engine's buckets conserve note count against it.
  function oracleAssignedCount(
    expected: readonly ExpectedBar[],
    boundariesMs: readonly number[],
    performed: readonly PerformedNote[],
    toleranceMs: number,
    comp: number,
  ): { scored: number; targetPcs: number } {
    const n = Math.min(expected.length, boundariesMs.length);
    const bs = boundariesMs.slice(0, n);
    let scored = 0;
    let targetPcs = 0;
    for (const e of expected.slice(0, n)) {
      if (e.kind === "target") targetPcs += new Set(e.pcs).size;
    }
    for (const p of performed) {
      if (!Number.isInteger(p.note) || p.note < 0 || p.note > 127 || !Number.isFinite(p.atMs)) continue;
      const t = p.atMs - comp;
      if (n === 0 || !Number.isFinite(t)) continue;
      if (t < bs[0] - toleranceMs) continue;
      if (n >= 2 && bs[n - 1] > bs[0]) {
        const meanGap = (bs[n - 1] - bs[0]) / (n - 1);
        if (t > bs[n - 1] + toleranceMs + meanGap) continue;
      }
      let best = 0;
      let bestDist = Math.abs(t - bs[0]);
      for (let i = 1; i < n; i++) {
        const d = Math.abs(t - bs[i]);
        if (d < bestDist) {
          best = i;
          bestDist = d;
        }
      }
      const kind = expected[best].kind;
      if (kind !== "free") scored += 1;
    }
    return { scored, targetPcs };
  }

  it("2000 random grids x note streams: buckets conserved, no NaN, fraction in [0,1]", () => {
    const rng = createRng(0x5eed1);
    for (let trial = 0; trial < 2000; trial++) {
      const nBars = 1 + rng.int(8);
      const expected: ExpectedBar[] = [];
      const boundariesMs: number[] = [];
      let t = 1000;
      for (let b = 0; b < nBars; b++) {
        const roll = rng.next();
        const kind = roll < 0.6 ? "target" : roll < 0.8 ? "free" : "rest";
        const pcs: number[] = [];
        if (kind === "target") {
          const k = 1 + rng.int(3);
          for (let i = 0; i < k; i++) pcs.push(rng.int(12));
        }
        expected.push({ bar: b, kind, pcs: [...new Set(pcs)] });
        boundariesMs.push(t);
        t += 1000 + rng.int(1500);
      }
      const performed: PerformedNote[] = [];
      const nNotes = rng.int(24);
      for (let i = 0; i < nNotes; i++) {
        performed.push({ note: rng.int(128), atMs: 500 + rng.int(t + 3500) });
      }
      const toleranceMs = 60 + rng.int(241);
      const latencyCompensationMs = rng.int(200);
      const m = matchPhrase({ expected, boundariesMs, performed, toleranceMs, latencyCompensationMs });

      // LAW 3 conservation vs the independent oracle:
      const oracle = oracleAssignedCount(expected, boundariesMs, performed, Math.max(60, toleranceMs), latencyCompensationMs);
      expect(m.assignedNotes).toBe(oracle.scored);
      expect(m.matched + m.wrongCount + m.extraCount + m.restCount).toBe(m.assignedNotes);
      // matched + missed == expectedTotal (distinct-pc conservation):
      let missedSum = 0;
      let matchedSum = 0;
      for (const bm of m.bars) {
        missedSum += bm.missedPcs.length;
        matchedSum += bm.matched;
      }
      expect(matchedSum).toBe(m.matched);
      expect(m.matched + missedSum).toBe(m.expectedTotal);
      expect(m.expectedTotal).toBe(oracle.targetPcs);
      // Bounded + NaN-free.
      expect(m.matchedFraction).toBeGreaterThanOrEqual(0);
      expect(m.matchedFraction).toBeLessThanOrEqual(1);
      expect(Number.isNaN(m.matchedFraction)).toBe(false);
      expect(Number.isNaN(m.accuracyPct)).toBe(false);
      expect(m.accuracyPct).toBeGreaterThanOrEqual(0);
      expect(m.accuracyPct).toBeLessThanOrEqual(100);
    }
  });
});

