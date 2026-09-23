/**
 * engine/compose/key.test.ts - PRD-001 Phase 4 Slice 1 (test plan 4).
 *
 * Hand-built pitch-class corpora drive the KS detector: a C-major-shaped
 * profile -> C major top-1 (r > 0.9); an A-minor-shaped profile -> A
 * minor; a flat 12-tone profile -> chromaticFallback (REQ-COMP-52); the
 * declared SMF key stays separate from the detected candidate; and the
 * hand-rolled pearson self-checks.
 */

import { describe, it, expect } from "vitest";
import { detectKey, pcProfile, pearson, KK_MAJOR, KK_MINOR } from "./key";
import { analyzeProject } from "./index";
import type { AnalysisWindow, NormalizedNote, NormalizedProject } from "./types";

function note(midi: number, tick: number, durationTicks: number): NormalizedNote {
  return { midi, tick, durationTicks, velocity: 0.8 };
}

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Build a project whose duration-weighted pc profile approximates
 *  `weights` (two notes per class so the >=16-note data floor holds). */
function projectFromWeights(weights: readonly number[], keySig?: { tonicPc: number; mode: "major" | "minor" }): NormalizedProject {
  const notes: NormalizedNote[] = [];
  let tick = 0;
  for (let p = 0; p < 12; p++) {
    const w = weights[p];
    if (w <= 0) continue;
    const half = Math.max(1, Math.round(w / 2));
    notes.push(note(p, tick, half));
    tick += half;
    notes.push(note(p, tick, half));
    tick += half;
  }
  return {
    version: 1,
    format: 1,
    ppq: 480,
    name: "t",
    fileName: "t.mid",
    tempos: [{ tick: 0, bpm: 120 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: keySig ? [{ tick: 0, tonicPc: keySig.tonicPc, mode: keySig.mode }] : [],
    tracks: [
      {
        index: 0,
        name: "t",
        channel: 0,
        program: 0,
        isPercussion: false,
        notes,
        endTick: tick,
        usesPitchBend: false,
      },
    ],
    endTick: tick,
    durationSec: 1,
    warnings: [],
  };
}

const WINDOW: AnalysisWindow = { fromTick: 0, toTick: Number.MAX_SAFE_INTEGER };

/** Minimal single-track project over explicit notes (ascending ticks). */
function projectFromNotes(notes: NormalizedNote[]): NormalizedProject {
  const sorted = notes.slice().sort((a, b) => a.tick - b.tick);
  let endTick = 0;
  for (const n of sorted) endTick = Math.max(endTick, n.tick + n.durationTicks);
  return {
    version: 1,
    format: 1,
    ppq: 480,
    name: "t",
    fileName: "t.mid",
    tempos: [{ tick: 0, bpm: 120 }],
    timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
    keySignatures: [],
    tracks: [
      {
        index: 0,
        name: "t",
        channel: 0,
        program: 0,
        isPercussion: false,
        notes: sorted,
        endTick,
        usesPitchBend: false,
      },
    ],
    endTick,
    durationSec: 1,
    warnings: [],
  };
}

/** `perPc` notes (quarter each) for every listed pitch class. */
function projectFromPcs(pcs: readonly number[], perPc: number): NormalizedProject {
  const notes: NormalizedNote[] = [];
  let tick = 0;
  for (const p of pcs) {
    for (let i = 0; i < perPc; i++) {
      notes.push(note(p + 60, tick, 240));
      tick += 240;
    }
  }
  return projectFromNotes(notes);
}

describe("detectKey (Krumhansl-Schmuckler)", () => {
  it("C-major-shaped corpus -> C major top-1, r > 0.9", () => {
    const k = detectKey(projectFromWeights(KK_MAJOR), WINDOW);
    expect(k.chromaticFallback).toBe(false);
    expect(k.candidates[0]).toMatchObject({ tonicPc: 0, mode: "major" });
    expect(k.candidates[0].correlation).toBeGreaterThan(0.9);
    expect(k.candidates.length).toBe(3);
    // ranked descending
    expect(k.candidates[0].correlation).toBeGreaterThanOrEqual(k.candidates[1].correlation);
    expect(k.candidates[1].correlation).toBeGreaterThanOrEqual(k.candidates[2].correlation);
  });

  it("A-minor-shaped corpus -> A minor top-1", () => {
    const aMinor = new Array<number>(12);
    for (let p = 0; p < 12; p++) aMinor[p] = KK_MINOR[mod12(p - 9)];
    const k = detectKey(projectFromWeights(aMinor), WINDOW);
    expect(k.candidates[0]).toMatchObject({ tonicPc: 9, mode: "minor" });
    expect(k.candidates[0].correlation).toBeGreaterThan(0.9);
  });

  it("flat 12-tone corpus -> chromaticFallback (REQ-COMP-52, correlation arm)", () => {
    const flat = new Array<number>(12).fill(100);
    const k = detectKey(projectFromWeights(flat), WINDOW);
    expect(k.chromaticFallback).toBe(true);
    // fires via top r < 0.50 (a flat profile correlates 0 with every KK
    // rotation) - NOT via the pc-count arm (12 distinct pcs is plenty)
    expect(k.candidates[0].correlation).toBeLessThan(0.5);
    // candidates are still returned (UI forces manual, not a dead end)
    expect(k.candidates.length).toBe(3);
  });

  it("too few distinct pcs -> fallback (pc arm, isolated from the others)", () => {
    // 4 distinct pcs x 5 notes = 20 notes (>= the 16-note floor) and a
    // strong r against C major: ONLY the <5-pc arm can fire here. A
    // 4-pc set cannot establish mode, so it must fall back even when
    // correlation evidence looks fine (degenerate 1-2-pc material
    // spuriously correlates r ~ 0.68-0.83).
    const p = projectFromPcs([0, 4, 7, 11], 5); // C E G B, 20 notes
    const k = detectKey(p, WINDOW);
    expect(k.chromaticFallback).toBe(true);
    expect(k.candidates[0].correlation).toBeGreaterThanOrEqual(0.5); // r arm would NOT catch it
  });

  it("strictly diatonic 7-pc material -> NO fallback + key annotation present", () => {
    // The v1 minDistinctPcs=8 arm over-fired: EVERY 7-pc scale tune
    // (plain C I-IV-V-I, r ~ 0.93-0.96) got chromaticFallback and lost
    // its annotation on the engine's BEST answers. Diatonic simplicity
    // is not atonality.
    const notes: NormalizedNote[] = [];
    const prog = [
      [60, 64, 67], // C
      [65, 69, 72], // F
      [67, 71, 74], // G
      [60, 64, 67], // C
    ];
    for (let b = 0; b < 8; b++) {
      for (const m of prog[b % 4]) notes.push(note(m, b * 1920, 1920));
    }
    const k = detectKey(projectFromNotes(notes), WINDOW);
    expect(k.candidates[0]).toMatchObject({ tonicPc: 0, mode: "major" });
    expect(k.chromaticFallback).toBe(false);
    // the annotation rides on the fallback flag (index.ts buildAnnotations)
    const a = analyzeProject(projectFromNotes(notes));
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.value.key.chromaticFallback).toBe(false);
      expect(a.value.annotations.some((x) => x.label === "Key")).toBe(true);
    }
  });

  it("blues dominants (wrong qualities, >=7 pcs) -> NO fallback", () => {
    // C7 / F7 / G7 over shuffle bars: chromatic BY CLASSICAL standards
    // (b7, natural 6 vs the major profile) but unambiguously tonal -
    // the pc arm must not fire and the correlation stays >= 0.50.
    const notes: NormalizedNote[] = [];
    const prog = [
      [48, 52, 55, 58], // C7
      [53, 57, 60, 63], // F7
      [55, 59, 62, 65], // G7
      [48, 52, 55, 58], // C7
    ];
    for (let b = 0; b < 6; b++) {
      for (const m of prog[b % 4]) notes.push(note(m, b * 1920, 1920));
    }
    const k = detectKey(projectFromNotes(notes), WINDOW);
    expect(k.chromaticFallback).toBe(false);
    expect(k.candidates[0].correlation).toBeGreaterThanOrEqual(0.5);
  });

  it("note floor is WINDOWED, not project-wide (LOW-1 unification)", () => {
    // 20 diatonic notes total, only 10 inside the window: the floor
    // must key off the windowed count (same span as the profile), so
    // the short window falls back while the full window does not.
    const notes: NormalizedNote[] = [];
    const pcs = [0, 2, 4, 5, 7, 9, 11];
    for (let i = 0; i < 20; i++) notes.push(note(60 + pcs[i % 7], i * 480, 480));
    const p = projectFromNotes(notes);
    const short = detectKey(p, { fromTick: 0, toTick: 10 * 480 }); // 10 notes
    expect(short.chromaticFallback).toBe(true);
    const full = detectKey(p, WINDOW); // 20 notes
    expect(full.chromaticFallback).toBe(false);
  });

  it("declared key sig is surfaced separately from the detection", () => {
    // notes say C major, but the file DECLARES F major (tonicPc 5).
    const k = detectKey(projectFromWeights(KK_MAJOR, { tonicPc: 5, mode: "major" }), WINDOW);
    expect(k.declared).toEqual({ tick: 0, tonicPc: 5, mode: "major" });
    expect(k.candidates[0].tonicPc).toBe(0); // detection unaffected
  });
});

describe("pcProfile", () => {
  it("is duration-weighted and rest-normalized (mean ~ 0)", () => {
    const notes = [note(0, 0, 100), note(0, 100, 100), note(4, 200, 100)];
    const prof = pcProfile(notes, WINDOW);
    expect(prof.length).toBe(12);
    const mean = prof.reduce((s, x) => s + x, 0) / 12;
    expect(mean).toBeCloseTo(0, 6);
    expect(prof[0]).toBeGreaterThan(prof[1]); // C weighted, D not
  });
});

describe("pearson (hand-rolled)", () => {
  it("r(x, x) === 1", () => {
    expect(pearson([1, 2, 3, 4, 5], [1, 2, 3, 4, 5])).toBeCloseTo(1, 10);
  });
  it("r(x, -x) === -1", () => {
    expect(pearson([1, 2, 3, 4, 5], [-1, -2, -3, -4, -5])).toBeCloseTo(-1, 10);
  });
  it("constant input -> 0 (no spurious 1)", () => {
    expect(pearson([2, 2, 2], [1, 2, 3])).toBe(0);
  });
});
