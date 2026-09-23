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
import type {
  AnalysisWindow,
  ChordCell,
  ComposeAnalysis,
  KeyCandidate,
  NormalizedNote,
  NormalizedProject,
} from "./types";

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

// ---------------------------------------------------------------------------
// PRD-001 Phase 4 Slice 2 (D58): THE HONESTY BLEND - blendKeyEvidence.
//
// Property-pinned, not example-pinned: H1 (KS correlation ALONE never
// auto-accepts) and H2 (declared-vs-inferred conflict always banners at
// the fixed highlight blend, default = declared) must FAIL LOUDLY if
// someone loosens KEY_BLEND_WEIGHTS past the relations.
// ---------------------------------------------------------------------------

import { blendKeyEvidence, KEY_BLEND_WEIGHTS } from "./key";
import { confidenceTier, restCell } from "./types";
import type { Annotation } from "../pedagogy/types";

function bcell(rootPc: number, qualitySymbol: string): ChordCell {
  return {
    rootPc,
    qualitySymbol,
    name: "",
    bassPc: null,
    confidence: 1,
    alternatives: [],
    isRest: false,
  };
}

const IIVI_ANN: readonly Annotation[] = [
  {
    version: 1,
    id: "ann-iivi-0",
    target: { kind: "progression", fromBar: 0, toBar: 2 },
    label: "ii-V-I",
    text: "ii-V-I detected bars 1-3.",
    conceptId: "ii-v-i",
    confidence: 1,
  },
];

/** Hand-built analysis with an explicit grid + key result. */
function blendAnalysis(opts: {
  topCorr?: number;
  topTonic?: number;
  topMode?: "major" | "minor";
  declared?: { tonicPc: number; mode: "major" | "minor" } | null;
  fallback?: boolean;
  cells?: readonly ChordCell[];
  iiViI?: boolean;
}): ComposeAnalysis {
  const top: KeyCandidate = {
    tonicPc: opts.topTonic ?? 0,
    mode: opts.topMode ?? "major",
    correlation: opts.topCorr ?? 0.9,
  };
  return {
    version: 1,
    roles: [],
    key: {
      candidates: [
        top,
        { tonicPc: 7, mode: "major", correlation: Math.max(0, top.correlation - 0.2) },
        { tonicPc: 9, mode: "minor", correlation: Math.max(0, top.correlation - 0.3) },
      ],
      declared: opts.declared ? { tick: 0, ...opts.declared } : null,
      chromaticFallback: opts.fallback ?? false,
    },
    melody: { sourceTrackIndex: null, synthesized: true, notes: [] },
    grid: {
      slotsPerBar: 1,
      bars: (opts.cells ?? []).map((c, i) => ({
        bar: i,
        startTick: i * 1920,
        endTick: (i + 1) * 1920,
        slots: [c],
      })),
    },
    window: { fromTick: 0, toTick: 999_999 },
    truncated: false,
    percussionOnly: false,
    annotations: opts.iiViI === true ? IIVI_ANN : [],
  };
}

/** `n` cells with `in` of them rooted in the C-major scale (0,2,4,5,7,
 *  9,11), the rest foreign (1,3,6,8,10). Optional trailing unresolved
 *  V (G7 with no tonic after it). */
function cGrid(n: number, inCount: number, opts: { unresolvedV?: boolean } = {}): ChordCell[] {
  const inScale = [0, 2, 4, 5, 9, 11]; // C D E F A B (G=7 reserved for V)
  const cells: ChordCell[] = [];
  for (let i = 0; i < n; i++) {
    const pc = i < inCount ? inScale[i % inScale.length] : [1, 3, 6, 8, 10][i % 5];
    cells.push(bcell(pc, "min")); // quality irrelevant to mass
  }
  if (opts.unresolvedV === true) cells.push(bcell(7, "dom7")); // never followed by tonic
  return cells;
}

describe("blendKeyEvidence agreement matrix (D58)", () => {
  it("agree: declared === candidates[0] (no fallback)", () => {
    const b = blendKeyEvidence(
      blendAnalysis({ topCorr: 0.9, declared: { tonicPc: 0, mode: "major" } }),
    );
    expect(b.agreement).toBe("agree");
    expect(b.conflictKind).toBeNull();
    expect(b.selected).toEqual({ tonicPc: 0, mode: "major", correlation: 0.9 });
  });

  it("conflict/relative: declared C major, top A minor (+9)", () => {
    const b = blendKeyEvidence(
      blendAnalysis({ topTonic: 9, topMode: "minor", declared: { tonicPc: 0, mode: "major" } }),
    );
    expect(b.agreement).toBe("conflict");
    expect(b.conflictKind).toBe("relative");
  });

  it("conflict/relative: declared A minor, top C major (+3)", () => {
    const b = blendKeyEvidence(
      blendAnalysis({ topTonic: 0, topMode: "major", declared: { tonicPc: 9, mode: "minor" } }),
    );
    expect(b.conflictKind).toBe("relative");
  });

  it("conflict/parallel: same tonic, mode differs", () => {
    const b = blendKeyEvidence(
      blendAnalysis({ topMode: "minor", declared: { tonicPc: 0, mode: "major" } }),
    );
    expect(b.agreement).toBe("conflict");
    expect(b.conflictKind).toBe("parallel");
  });

  it("conflict/other: different tonic, same mode", () => {
    const b = blendKeyEvidence(
      blendAnalysis({ topTonic: 5, declared: { tonicPc: 0, mode: "major" } }),
    );
    expect(b.conflictKind).toBe("other");
  });

  it("conflict/other: mode flips with a non-relative delta", () => {
    const b = blendKeyEvidence(
      blendAnalysis({ topTonic: 2, topMode: "minor", declared: { tonicPc: 0, mode: "major" } }),
    );
    expect(b.conflictKind).toBe("other");
  });

  it("declared-only: declared + fallback (never inferred blend)", () => {
    const b = blendKeyEvidence(
      blendAnalysis({ declared: { tonicPc: 3, mode: "minor" }, fallback: true }),
    );
    expect(b.agreement).toBe("declared-only");
    expect(b.selected).toEqual({ tonicPc: 3, mode: "minor", correlation: 1 });
    expect(b.blended).toBe(KEY_BLEND_WEIGHTS.declaredOnly);
  });

  it("inferred-only: no declared, no fallback", () => {
    const b = blendKeyEvidence(blendAnalysis({ topCorr: 0.9 }));
    expect(b.agreement).toBe("inferred-only");
    expect(b.conflictKind).toBeNull();
  });

  it("none: no declared + fallback -> manual, candidates[0] as placeholder", () => {
    const b = blendKeyEvidence(blendAnalysis({ fallback: true }));
    expect(b.agreement).toBe("none");
    expect(b.blended).toBe(0);
    expect(confidenceTier(b.blended)).toBe("manual");
    expect(b.selected.tonicPc).toBe(0); // placeholder behind the manual input
  });

  it("negative correlation clamps to ks 0 (no negative blend)", () => {
    const b = blendKeyEvidence(blendAnalysis({ topCorr: -0.4 }));
    expect(b.blended).toBe(0);
  });
});

describe("blendKeyEvidence functional evidence (mass + cadence)", () => {
  it("cadence 1 via ii-V-I annotation; 0.5 via unresolved V; 0 otherwise", () => {
    const cells = cGrid(6, 6);
    const viaAnnotation = blendKeyEvidence(
      blendAnalysis({ topCorr: 0.9, cells, iiViI: true }),
    );
    const viaAdjacency = blendKeyEvidence(
      blendAnalysis({
        topCorr: 0.9,
        cells: [bcell(2, "m7"), bcell(7, "dom7"), bcell(0, "maj7"), ...cGrid(4, 4)],
      }),
    );
    const unresolved = blendKeyEvidence(
      blendAnalysis({ topCorr: 0.9, cells: [...cGrid(6, 6), bcell(7, "dom7")] }),
    );
    const none = blendKeyEvidence(blendAnalysis({ topCorr: 0.9, cells }));
    // functional = 0.7*mass + 0.3*cadence - compare with equal mass.
    expect(viaAnnotation.functional).toBeCloseTo(0.7 + 0.3, 10);
    expect(viaAdjacency.functional).toBeCloseTo(1, 10);
    expect(unresolved.functional).toBeGreaterThan(none.functional);
    expect(unresolved.functional - none.functional).toBeCloseTo(0.15, 10);
  });

  it("V->I adjacency is rest-transparent; alt quality counts; wrong resolution does not", () => {
    const throughRest = blendKeyEvidence(
      blendAnalysis({
        topCorr: 0.9,
        cells: [bcell(7, "alt"), restCell(), bcell(0, "maj"), ...cGrid(4, 4)],
      }),
    );
    expect(throughRest.functional).toBeGreaterThanOrEqual(1 - 1e-9);
    const noResolve = blendKeyEvidence(
      blendAnalysis({ topCorr: 0.9, cells: [bcell(7, "dom7"), bcell(5, "maj"), ...cGrid(4, 4)] }),
    );
    expect(noResolve.functional).toBeLessThan(throughRest.functional);
  });

  it("fewer than 4 non-rest cells -> mass 0 (too little to judge)", () => {
    const b = blendKeyEvidence(
      blendAnalysis({ topCorr: 0.9, cells: [bcell(0, "maj"), bcell(2, "min"), bcell(4, "min")] }),
    );
    expect(b.functional).toBe(0);
  });
});

describe("blendKeyEvidence boundary table (D58 worked examples)", () => {
  it("agree ks .70 / functional .60 -> .865 AUTO", () => {
    // 7 in/out cells with 3 in scale -> mass 3/7; ii-V-I -> cadence 1;
    // functional = 0.7*(3/7) + 0.3 = 0.6.
    const b = blendKeyEvidence(
      blendAnalysis({
        topCorr: 0.7,
        declared: { tonicPc: 0, mode: "major" },
        cells: cGrid(7, 3),
        iiViI: true,
      }),
    );
    expect(b.functional).toBeCloseTo(0.6, 10);
    expect(b.blended).toBeCloseTo(0.865, 10);
    expect(confidenceTier(b.blended)).toBe("auto");
  });

  it("agree ks .50 / functional .50 -> exactly .80 -> HIGHLIGHT (strict > boundary)", () => {
    // 8 non-rest cells, 4 in scale (3 base + the in-scale G7) -> mass
    // 0.5; unresolved V -> cadence 0.5; functional = 0.7*.5+0.3*.5 = .5.
    const b = blendKeyEvidence(
      blendAnalysis({
        topCorr: 0.5,
        declared: { tonicPc: 0, mode: "major" },
        cells: cGrid(7, 3, { unresolvedV: true }),
      }),
    );
    expect(b.functional).toBeCloseTo(0.5, 10);
    expect(b.blended).toBeCloseTo(0.8, 10);
    expect(confidenceTier(b.blended)).toBe("highlight");
  });

  it("ADVERSARIAL JAZZ GUARD: inferred-only ks .83 / functional .25 -> HIGHLIGHT, never auto", () => {
    // 12 foreign + 1 in-scale + unresolved V (in scale) -> mass 2/14,
    // functional = 0.7*(2/14) + 0.3*0.5 = 0.25.
    const cells = [bcell(0, "min"), ...cGrid(12, 0), bcell(7, "dom7")];
    const b = blendKeyEvidence(blendAnalysis({ topCorr: 0.83, cells }));
    expect(b.agreement).toBe("inferred-only");
    expect(b.functional).toBeCloseTo(0.25, 10);
    expect(b.blended).toBeCloseTo(0.83 * 0.6625, 10); // ~0.5499
    expect(confidenceTier(b.blended)).toBe("highlight");
  });

  it("inferred-only ks .90 / functional .0 -> .495 RADIO", () => {
    const b = blendKeyEvidence(blendAnalysis({ topCorr: 0.9, cells: cGrid(4, 0) }));
    expect(b.functional).toBe(0);
    expect(b.blended).toBeCloseTo(0.495, 10);
    expect(confidenceTier(b.blended)).toBe("radio");
  });

  it("inferred-only auto REQUIRES both legs: ks .85/f .47 is NOT auto, ks .95/f 1.0 is", () => {
    const weak = blendKeyEvidence(
      // 11 cells, 5 in scale (4 base + in-scale G7) -> mass 5/11;
      // unresolved V -> functional ~ 0.47.
      blendAnalysis({ topCorr: 0.85, cells: cGrid(10, 4, { unresolvedV: true }) }),
    );
    expect(weak.blended).toBeLessThanOrEqual(0.8);
    expect(confidenceTier(weak.blended)).not.toBe("auto");
    const strong = blendKeyEvidence(
      // mass 1.0 + ii-V-I cadence -> functional 1.0 -> 0.95 * 1.0 auto.
      blendAnalysis({ topCorr: 0.95, cells: cGrid(10, 10), iiViI: true }),
    );
    expect(confidenceTier(strong.blended)).toBe("auto");
  });
});

describe("blendKeyEvidence H1/H2 as UNIVERSAL properties (make-or-break)", () => {
  const gridBattery: readonly ChordCell[][] = [
    [],
    cGrid(4, 0),
    cGrid(4, 4),
    cGrid(8, 4, { unresolvedV: true }),
    cGrid(16, 16),
    [bcell(7, "dom7"), bcell(0, "maj")],
  ];
  const ksBattery = [-0.5, 0, 0.3, 0.5, 0.7, 0.83, 0.9, 0.95, 1.0];

  it("H1: NO declared-side state (conflict / declared-only / none) EVER lands in auto, for ANY grid x ks", () => {
    for (const cells of gridBattery) {
      for (const ks of ksBattery) {
        const variants = [
          // conflict (all three kinds)
          blendAnalysis({ topCorr: ks, declared: { tonicPc: 5, mode: "major" }, cells }),
          blendAnalysis({ topCorr: ks, topMode: "minor", declared: { tonicPc: 0, mode: "major" }, cells }),
          blendAnalysis({ topCorr: ks, topTonic: 9, topMode: "minor", declared: { tonicPc: 0, mode: "major" }, cells }),
          // declared-only
          blendAnalysis({ topCorr: ks, declared: { tonicPc: 0, mode: "major" }, fallback: true, cells }),
          // none
          blendAnalysis({ topCorr: ks, fallback: true, cells }),
        ];
        for (const a of variants) {
          const b = blendKeyEvidence(a);
          expect(["conflict", "declared-only", "none"]).toContain(b.agreement);
          expect(confidenceTier(b.blended)).not.toBe("auto");
        }
      }
    }
  });

  it("H1: a PURE-KS high r with weak functional reading never auto-accepts (inferred-only)", () => {
    // ks 0.95 (near-perfect correlation!) but the grid is chromatic
    // junk: the blend MUST stay out of auto. This is the 18.3%
    // adversarial-jazz guard stated as a property.
    for (const cells of [cGrid(4, 0), cGrid(8, 2), cGrid(16, 4)]) {
      for (const ks of [0.85, 0.9, 0.95, 0.99, 1.0]) {
        const b = blendKeyEvidence(blendAnalysis({ topCorr: ks, cells }));
        if (b.functional < 0.55) {
          expect(confidenceTier(b.blended)).not.toBe("auto");
        }
      }
    }
    // The structural form: inferred-only auto => functional > 0.55 AND ks > 0.8.
    for (const cells of gridBattery) {
      for (const ks of ksBattery) {
        const b = blendKeyEvidence(blendAnalysis({ topCorr: ks, cells }));
        if (confidenceTier(b.blended) === "auto") {
          expect(b.functional).toBeGreaterThan(0.55);
          expect(ks).toBeGreaterThan(0.8);
        }
      }
    }
  });

  it("H1 structural: auto is only reachable via agree or inferred-only", () => {
    for (const cells of gridBattery) {
      for (const ks of ksBattery) {
        for (const variant of [
          blendAnalysis({ topCorr: ks, cells }),
          blendAnalysis({ topCorr: ks, cells, declared: { tonicPc: 0, mode: "major" }, iiViI: true }),
          blendAnalysis({ topCorr: ks, cells, declared: { tonicPc: 7, mode: "major" } }),
          blendAnalysis({ topCorr: ks, cells, declared: { tonicPc: 0, mode: "major" }, fallback: true }),
          blendAnalysis({ topCorr: ks, cells, fallback: true }),
        ]) {
          const b = blendKeyEvidence(variant);
          if (confidenceTier(b.blended) === "auto") {
            expect(["agree", "inferred-only"]).toContain(b.agreement);
          }
        }
      }
    }
  });

  it("H2: conflict ALWAYS yields the fixed highlight blend, declared default, banner-ready reason", () => {
    const conflicts = [
      { topTonic: 5, topMode: "major" as const, declared: { tonicPc: 0, mode: "major" as const }, kind: "other" },
      { topTonic: 0, topMode: "minor" as const, declared: { tonicPc: 0, mode: "major" as const }, kind: "parallel" },
      { topTonic: 9, topMode: "minor" as const, declared: { tonicPc: 0, mode: "major" as const }, kind: "relative" },
    ];
    for (const cells of gridBattery) {
      for (const ks of ksBattery) {
        for (const c of conflicts) {
          const b = blendKeyEvidence(
            blendAnalysis({ topCorr: ks, topTonic: c.topTonic, topMode: c.topMode, declared: c.declared, cells }),
          );
          expect(b.agreement).toBe("conflict");
          expect(b.conflictKind).toBe(c.kind);
          expect(b.blended).toBe(KEY_BLEND_WEIGHTS.conflict); // fixed, ks-independent
          expect(confidenceTier(b.blended)).toBe("highlight"); // banner tier
          expect(b.selected).toEqual({
            tonicPc: c.declared.tonicPc,
            mode: c.declared.mode,
            correlation: 1,
          }); // default = declared
          expect(b.reason).toContain("declares");
          expect(b.reason).toContain("suggest");
        }
      }
    }
  });

  it("weights keep every fixed blend below the auto boundary (tuning guard)", () => {
    // If someone "re-tunes" declaredOnly/conflict/agreeBase to > 0.80
    // the H1 properties above fail; this pin names the boundary
    // explicitly so the intent is greppable.
    expect(KEY_BLEND_WEIGHTS.declaredOnly).toBeLessThanOrEqual(0.8);
    expect(KEY_BLEND_WEIGHTS.conflict).toBeLessThanOrEqual(0.8);
    expect(KEY_BLEND_WEIGHTS.agreeBase).toBeLessThanOrEqual(0.8);
    expect(KEY_BLEND_WEIGHTS.inferredBase).toBeLessThanOrEqual(0.8);
    expect(KEY_BLEND_WEIGHTS.inferredBase + KEY_BLEND_WEIGHTS.inferredFunctional).toBeLessThanOrEqual(1);
    expect(KEY_BLEND_WEIGHTS.functionalMass + KEY_BLEND_WEIGHTS.functionalCadence).toBeLessThanOrEqual(1);
  });
});

describe("blendKeyEvidence monotonicity + reason hygiene", () => {
  it("blended is non-decreasing in ks (agree + inferred-only)", () => {
    const cells = cGrid(8, 8);
    let prevAgree = -1;
    let prevInferred = -1;
    for (const ks of [0, 0.2, 0.4, 0.6, 0.8, 1.0]) {
      const agree = blendKeyEvidence(
        blendAnalysis({ topCorr: ks, declared: { tonicPc: 0, mode: "major" }, cells }),
      ).blended;
      const inferred = blendKeyEvidence(blendAnalysis({ topCorr: ks, cells })).blended;
      expect(agree).toBeGreaterThanOrEqual(prevAgree);
      expect(inferred).toBeGreaterThanOrEqual(prevInferred);
      prevAgree = agree;
      prevInferred = inferred;
    }
    expect(prevAgree).toBeGreaterThan(0.8); // and actually reaches auto
  });

  it("blended is non-decreasing in functional (mass ladder)", () => {
    let prevFunctional = -1;
    let prevBlended = -1;
    for (let i = 0; i <= 8; i++) {
      const b = blendKeyEvidence(blendAnalysis({ topCorr: 0.9, cells: cGrid(8, i) }));
      expect(b.functional).toBeGreaterThanOrEqual(prevFunctional);
      expect(b.blended).toBeGreaterThanOrEqual(prevBlended);
      prevFunctional = b.functional;
      prevBlended = b.blended;
    }
  });

  it("reason is non-empty ASCII for all five states", () => {
    const samples = [
      blendAnalysis({ declared: { tonicPc: 0, mode: "major" }, cells: cGrid(4, 4) }), // agree
      blendAnalysis({ topMode: "minor", declared: { tonicPc: 0, mode: "major" } }), // conflict
      blendAnalysis({ declared: { tonicPc: 0, mode: "major" }, fallback: true }), // declared-only
      blendAnalysis({ cells: cGrid(4, 4) }), // inferred-only
      blendAnalysis({ fallback: true }), // none
    ];
    for (const a of samples) {
      const b = blendKeyEvidence(a);
      expect(b.reason.length).toBeGreaterThan(0);
      // eslint-disable-next-line no-control-regex
      expect(b.reason).toMatch(/^[\x20-\x7E]*$/);
    }
  });

  it("blend is pure: the analysis is never mutated", () => {
    const a = blendAnalysis({ topCorr: 0.9, cells: cGrid(6, 6), iiViI: true });
    const before = JSON.stringify(a);
    blendKeyEvidence(a);
    expect(JSON.stringify(a)).toBe(before);
  });
});
