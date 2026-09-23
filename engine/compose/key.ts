/**
 * engine/compose/key.ts - PRD-001 Phase 4 Slice 1 (REQ-COMP-10/52).
 *
 * Krumhansl-Schmuckler key profiling, hand-rolled (no `tonal` import -
 * engine purity, D46). A duration-weighted 12-bin pitch-class profile is
 * correlated (Pearson r) against the published Krumhansl-Klinger (1982)
 * major/minor profiles rotated to all 12 tonics. The 24 candidates are
 * ranked by r; the top 3 are returned with their correlations.
 *
 * The declared SMF key signature is surfaced SEPARATELY (never blended
 * into r): the card defaults to it when present (composers' intent beats
 * statistics), else the top candidate.
 *
 * Atonal / degenerate edge (REQ-COMP-52): chromaticFallback fires when
 * (a) top r < 0.50 - no correlation evidence (catches flat / chromatic /
 * 12-tone material), or (b) fewer than 5 distinct windowed pitch classes
 * - material too sparse to establish tonality (drone, power chord,
 * quartal shell). The pc-count arm flags SPARSE non-tonal material, NOT
 * diatonic simplicity: a 7-pc scale tune is a FULL tonal answer and must
 * never fall back (the v1 <8 arm over-fired on every diatonic piece).
 * 5+ pcs (pentatonic and up) defer to the correlation arm. The arms are
 * complementary: 1-2-pc material spuriously correlates > 0.50 against
 * KK profiles, so correlation alone cannot cover it either. All counts
 * are WINDOWED (same span as the profile; the v1 project-wide note floor
 * was inconsistent with the windowed profile). Candidates are still
 * returned (the UI forces a manual chart, not a dead end).
 *
 * Purity: relative imports only, no clock, no randomness, no console.
 */

import type {
  AnalysisWindow,
  KeyCandidate,
  KeyResult,
  NormalizedNote,
  NormalizedProject,
} from "./types";

/** Krumhansl-Klinger 1982 major profile (semitones above tonic). */
export const KK_MAJOR: readonly number[] = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
/** Krumhansl-Klinger 1982 minor profile (semitones above tonic). */
export const KK_MINOR: readonly number[] = [
  6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
];

/** REQ-COMP-52 thresholds (see header for the arm-by-arm rationale). */
export const KEY_THRESHOLDS = {
  minCorrelation: 0.5,
  minDistinctPcs: 5, // < 5 pcs cannot establish mode; >= 5 (pentatonic
  // and up, incl. diatonic 7) is judged by correlation alone
  minNotes: 16, // windowed data floor
} as const;

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Pearson correlation, hand-rolled. 0 when either input is constant
 *  (zero variance) so a degenerate profile never yields a spurious 1. */
export function pearson(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i];
    mb += b[i];
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  const denom = Math.sqrt(va * vb);
  return denom === 0 ? 0 : cov / denom;
}

/** Raw duration-weighted 12-bin pitch-class profile within the window. */
function rawWeights(
  notes: readonly NormalizedNote[],
  window: AnalysisWindow,
): number[] {
  const w = new Array<number>(12).fill(0);
  for (const n of notes) {
    if (n.tick >= window.fromTick && n.tick < window.toTick) {
      w[mod12(n.midi)] += Math.max(0, n.durationTicks);
    }
  }
  return w;
}

/** The public profile accessor (test plan 4): duration-weighted and
 *  rest-normalized (mean-subtracted) so correlation is shape, not size. */
export function pcProfile(
  notes: readonly NormalizedNote[],
  window: AnalysisWindow,
): readonly number[] {
  const w = rawWeights(notes, window);
  const mean = w.reduce((s, x) => s + x, 0) / 12;
  return w.map((x) => x - mean);
}

function collectNotes(project: NormalizedProject): NormalizedNote[] {
  const out: NormalizedNote[] = [];
  for (const t of project.tracks) {
    if (t.isPercussion) continue; // drums carry no harmonic pitch class
    for (const n of t.notes) out.push(n);
  }
  return out;
}

function correlateForTonic(weights: readonly number[], tonic: number, kk: readonly number[]): number {
  const expected = new Array<number>(12);
  for (let p = 0; p < 12; p++) {
    expected[p] = kk[mod12(p - tonic)];
  }
  return pearson(weights, expected);
}

export function detectKey(project: NormalizedProject, window: AnalysisWindow): KeyResult {
  // WINDOWED notes: the profile, the distinct-pc count, AND the data
  // floor all key off the same span (v1 counted the floor project-wide
  // while profiling the window - inconsistent).
  const notes = collectNotes(project).filter(
    (n) => n.tick >= window.fromTick && n.tick < window.toTick,
  );
  const weights = rawWeights(notes, window);
  const distinct = weights.filter((x) => x > 0).length;

  const scored: KeyCandidate[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    scored.push({ tonicPc: tonic, mode: "major", correlation: correlateForTonic(weights, tonic, KK_MAJOR) });
    scored.push({ tonicPc: tonic, mode: "minor", correlation: correlateForTonic(weights, tonic, KK_MINOR) });
  }
  // Deterministic rank: correlation desc, then tonic asc, then mode.
  scored.sort(
    (a, b) =>
      b.correlation - a.correlation ||
      a.tonicPc - b.tonicPc ||
      (a.mode === b.mode ? 0 : a.mode === "major" ? -1 : 1),
  );

  const candidates = scored.slice(0, 3);
  const topR = candidates.length > 0 ? candidates[0].correlation : 0;
  const chromaticFallback =
    topR < KEY_THRESHOLDS.minCorrelation ||
    distinct < KEY_THRESHOLDS.minDistinctPcs ||
    notes.length < KEY_THRESHOLDS.minNotes;

  return {
    candidates,
    declared: project.keySignatures.length > 0 ? project.keySignatures[0] : null,
    chromaticFallback,
  };
}
