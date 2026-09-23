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
  ChordCell,
  ComposeAnalysis,
  KeyCandidate,
  KeyResult,
  NormalizedNote,
  NormalizedProject,
  ProjectKeySignature,
} from "./types";
import { spellTonic } from "../core/spelling";

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

/* --------------------------------------------------------------------- *
 * D58 (PRD-001 Phase 4 Slice 2): THE HONESTY BLEND.
 *
 * Krumhansl-Schmuckler correlation is NOT a calibrated probability: the
 * fix-round evidence is KS top-1 accuracy of ~18.3% on adversarial jazz,
 * so confidenceTier(candidates[0].correlation) ALONE would happily
 * auto-accept a 0.85 false-fire. blendKeyEvidence weighs THREE
 * independent evidence sources:
 *
 *   declared   - the file's own SMF key signature (composers' intent),
 *   functional - how well the inferred chord grid actually fits the
 *                candidate key (diatonic mass + cadence),
 *   ks         - the raw correlation above.
 *
 * Two UNIVERSAL properties hold by construction (property-pinned in
 * key.test.ts - tuning KEY_BLEND_WEIGHTS must never loosen them):
 *
 *   H1: KS correlation ALONE NEVER auto-accepts. A tier of "auto" is
 *       reachable only in the "agree" or "inferred-only" states, and in
 *       inferred-only it needs BOTH strong correlation AND real
 *       functional evidence (the adversarial-jazz guard: ks 0.83 with
 *       functional 0.25 blends to ~0.55 = highlight, never auto).
 *   H2: a declared-vs-inferred CONFLICT always yields a fixed
 *       highlight-tier blend + the conflictKind the banner/radio UI
 *       must render (default selection = declared). A silent pick of
 *       either value is a spec violation.
 *
 * The fixed constants (declaredOnly 0.65, conflict 0.60, none 0) sit
 * below the 0.80 auto boundary BY DESIGN - see the property tests.
 * --------------------------------------------------------------------- */

/** Five-way declared-vs-inferred agreement state (D58). */
export type KeyAgreement =
  | "agree"
  | "conflict"
  | "declared-only"
  | "inferred-only"
  | "none";

/** null unless agreement === "conflict". */
export type ConflictKind = "relative" | "parallel" | "other" | null;

export interface KeyBlend {
  readonly agreement: KeyAgreement;
  readonly conflictKind: ConflictKind;
  /** What the card shows as current (composers' intent wins when the
   *  file declares a key - the shipped key.ts header rule). */
  readonly selected: KeyCandidate;
  /** 0..1 - feeds confidenceTier. */
  readonly blended: number;
  /** 0..1 (exposed for the tooltip honesty). */
  readonly functional: number;
  /** ASCII, UI-safe one-liner. */
  readonly reason: string;
}

/** Blend constants (named + test-pinned). Re-tune via RK-S2-2 corpus
 *  data WITHOUT touching the H1/H2 property tests - those pin the
 *  RELATIONS, not the numbers. */
export const KEY_BLEND_WEIGHTS = {
  agreeBase: 0.6,
  agreeKs: 0.25,
  agreeFunctional: 0.15,
  inferredBase: 0.55,
  inferredFunctional: 0.45,
  declaredOnly: 0.65,
  conflict: 0.6,
  functionalMass: 0.7,
  functionalCadence: 0.3,
  minCellsForMass: 4,
} as const;

const BLEND_MAJOR_SCALE: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
const BLEND_MINOR_SCALE: readonly number[] = [0, 2, 3, 5, 7, 8, 10];
const CADENCE_RESOLUTIONS: ReadonlySet<string> = new Set(["maj", "maj7", "m7"]);

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function scalePcsOf(cand: KeyCandidate): ReadonlySet<number> {
  const scale = cand.mode === "major" ? BLEND_MAJOR_SCALE : BLEND_MINOR_SCALE;
  return new Set(scale.map((o) => mod12(cand.tonicPc + o)));
}

function gridCells(a: ComposeAnalysis): readonly ChordCell[] {
  const out: ChordCell[] = [];
  for (const region of a.grid.bars) {
    for (const cell of region.slots) out.push(cell);
  }
  return out;
}

/** Fraction of non-rest cells whose root sits in the selected scale.
 *  0 when fewer than minCellsForMass non-rest cells (too little to
 *  judge - never reward an empty grid). */
function diatonicMassOf(selected: KeyCandidate, cells: readonly ChordCell[]): number {
  const nonRest = cells.filter((c) => !c.isRest);
  if (nonRest.length < KEY_BLEND_WEIGHTS.minCellsForMass) return 0;
  const scale = scalePcsOf(selected);
  let inScale = 0;
  for (const c of nonRest) if (scale.has(mod12(c.rootPc))) inScale++;
  return inScale / nonRest.length;
}

/** 1: an ii-V-I annotation exists OR a direct V->I adjacency (a
 *  dom7/alt cell rooted tonic+7 immediately followed - rests
 *  transparent - by a cell rooted tonic with quality maj/maj7/m7).
 *  0.5: a tonic+7 dominant exists with no resolution. Else 0. */
function cadenceEvidence(a: ComposeAnalysis, selected: KeyCandidate): number {
  if (a.annotations.some((x) => x.conceptId === "ii-v-i")) return 1;
  const domPc = mod12(selected.tonicPc + 7);
  const nonRest = gridCells(a).filter((c) => !c.isRest);
  let sawUnresolved = false;
  for (let i = 0; i < nonRest.length; i++) {
    const c = nonRest[i];
    if (c.rootPc !== domPc) continue;
    if (c.qualitySymbol !== "dom7" && c.qualitySymbol !== "alt") continue;
    const nxt = nonRest[i + 1];
    if (
      nxt !== undefined &&
      nxt.rootPc === selected.tonicPc &&
      CADENCE_RESOLUTIONS.has(nxt.qualitySymbol)
    ) {
      return 1;
    }
    sawUnresolved = true;
  }
  return sawUnresolved ? 0.5 : 0;
}

function conflictKindOf(declared: ProjectKeySignature, top: KeyCandidate): ConflictKind {
  if (declared.tonicPc === top.tonicPc && declared.mode !== top.mode) return "parallel";
  if (declared.mode !== top.mode) {
    const delta = mod12(top.tonicPc - declared.tonicPc);
    if (delta === 9 || delta === 3) return "relative";
  }
  return "other";
}

function keyName(cand: KeyCandidate): string {
  return `${spellTonic(cand.tonicPc, cand.mode, "")} ${cand.mode}`;
}

/** The D58 blend. Pure over the analysis's OWN grid + key result -
 *  never mutates, never reads anything outside `a`. */
export function blendKeyEvidence(a: ComposeAnalysis): KeyBlend {
  const W = KEY_BLEND_WEIGHTS;
  const top: KeyCandidate = a.key.candidates[0] ?? { tonicPc: 0, mode: "major", correlation: 0 };
  const ks = clamp01(top.correlation); // negative r -> 0
  const declared = a.key.declared;
  const fallback = a.key.chromaticFallback;

  let agreement: KeyAgreement;
  if (declared !== null && !fallback) {
    agreement =
      declared.tonicPc === top.tonicPc && declared.mode === top.mode ? "agree" : "conflict";
  } else if (declared !== null) {
    agreement = "declared-only";
  } else if (!fallback) {
    agreement = "inferred-only";
  } else {
    agreement = "none";
  }

  const declaredCandidate: KeyCandidate | null =
    declared === null
      ? null
      : { tonicPc: declared.tonicPc, mode: declared.mode, correlation: 1 };

  // H2 default selection: composers' intent (declared) wins on
  // conflict + declared-only; the inferred top candidate wins on
  // agree/inferred-only; "none" keeps candidates[0] as a placeholder
  // behind the forced manual input.
  const selected: KeyCandidate =
    (agreement === "declared-only" || agreement === "conflict") && declaredCandidate !== null
      ? declaredCandidate
      : top;

  const conflictKind: ConflictKind =
    agreement === "conflict" && declared !== null ? conflictKindOf(declared, top) : null;

  const cells = gridCells(a);
  const mass = diatonicMassOf(selected, cells);
  const cadence = cadenceEvidence(a, selected);
  const functional = clamp01(W.functionalMass * mass + W.functionalCadence * cadence);
  const fitPct = Math.round(functional * 100);

  let blended: number;
  let reason: string;
  switch (agreement) {
    case "agree":
      blended = W.agreeBase + W.agreeKs * ks + W.agreeFunctional * functional;
      reason = `Key signature and notes agree on ${keyName(selected)} (correlation r=${ks.toFixed(
        2,
      )}, functional fit ${fitPct}%).`;
      break;
    case "inferred-only":
      blended = ks * (W.inferredBase + W.inferredFunctional * functional);
      reason = `Detected ${keyName(selected)} from note content (correlation r=${ks.toFixed(
        2,
      )}, functional fit ${fitPct}%).`;
      break;
    case "declared-only":
      blended = W.declaredOnly;
      reason = `Key ${keyName(
        selected,
      )} comes from the file's key signature; the note content gave no tonal evidence.`;
      break;
    case "conflict":
      blended = W.conflict;
      reason = `The file declares ${keyName(selected)}; the notes suggest ${keyName(top)} (${
        conflictKind ?? "other"
      } relation).`;
      break;
    default:
      blended = 0;
      reason = "No clear key detected - enter the key and chords manually.";
      break;
  }

  return {
    agreement,
    conflictKind,
    selected,
    blended: clamp01(blended),
    functional,
    reason,
  };
}
