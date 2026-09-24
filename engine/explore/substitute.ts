/**
 * engine/explore/substitute.ts - PRD-001 Phase 5 (D99, the honesty core).
 *
 * Clean-room substitution over ChordCells. The TECHNIQUE LIST is the
 * only harvest from src/lib/coCompose.ts (F10: its picker weights,
 * canned explanations and analyzeChord root path fail the honesty
 * bar - never imported, ported or wrapped). Every label rule below is
 * PORTED from engine/pedagogy/annotate.ts to ChordCell with the SAME
 * arithmetic (D47 pattern - substitute.test.ts pins identical
 * claim/no-claim on the translated goldens):
 *
 * - tritone-sub: candidate root == mod12(orig+6), candidate dominant,
 *   next.root == mod12(cand.root-1), next tonic-family. PLUS one
 *   tightening the D99 letter omits but the rationale REQUIRES: the
 *   ORIG must be dominant (the "shared 3rd/7th tritone" copy names
 *   guide tones a triad lacks; subbing a non-dominant with a dom7 is
 *   not guide-tone substitution). Hence N2's triadic V-I admits no
 *   tritone candidate, while a dominant V7 -> I does (true positive,
 *   pinned in substitute.test.ts).
 * - secondary-dominant: candidate dominant, mod12(cand.root+5) ==
 *   next.root, candidate root != the key's own dominant root (the
 *   "degree != V" port: a V7 -> I is functional, not secondary).
 * - modal-interchange: residual - candidate root non-diatonic AND not
 *   claimed by the tritone/secdom rules above. CONSEQUENCE (loud):
 *   the etude pass-4b prose pool's iv7 (major) / III7 (minor) members
 *   have DIATONIC roots, so the ported annotate rule-4 arithmetic
 *   forbids the modal label on them. The pools ship as major
 *   [bVI, bVII7] + minor [bII7], each verified non-diatonic
 *   MECHANICALLY before emission (defense in depth, not trust).
 * - passing-diminished: quality dim/dim7, root a chromatic step
 *   strictly between orig and next roots (whole-step root motion).
 *
 * Construction == predicate: every candidate is built, then passed
 * through its own predicate on the SAME data before emission (review
 * gate: no technique token without its predicate call). The ORIGINAL
 * cell is never emitted (callers add the "keep" card themselves);
 * rests / unknown qualities yield [] (honest: nothing to substitute).
 *
 * Purity: relative imports only, no clock, no randomness (no Rng even
 * taken - substitution is enumerative, draws belong to reharmonize),
 * no console.
 */

import { buildCellFromSymbol } from "../compose/chordsym";
import { parseNumeral } from "../etude/harmony";
import { QUALITY_INTERVALS, spellChordName } from "../core/chords";
import type { ChordCell, KeyCandidate } from "../compose/types";
import type { SubstituteCandidate, SubstituteContext } from "./types";

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** Ported from annotate.ts (same sets). */
const DOMINANT_QUALITIES: readonly string[] = ["dom7", "dom9", "alt"];
const MAJOR_FAMILY: readonly string[] = [
  "maj",
  "maj7",
  "maj9",
  "maj6",
  "majadd9",
];
const MINOR_FAMILY: readonly string[] = [
  "min",
  "m7",
  "min9",
  "min6",
  "minadd9",
];

/** D21 diatonic pitch classes for a key (MODE_OFFSETS equivalent). */
const MAJOR_OFFSETS: readonly number[] = [0, 2, 4, 5, 7, 9, 11];
const MINOR_OFFSETS: readonly number[] = [0, 2, 3, 5, 7, 8, 10];

function diatonicPcs(key: KeyCandidate): readonly number[] {
  const offsets = key.mode === "major" ? MAJOR_OFFSETS : MINOR_OFFSETS;
  return offsets.map((o) => mod12(key.tonicPc + o));
}

function isDominantQuality(qualitySymbol: string): boolean {
  return DOMINANT_QUALITIES.includes(qualitySymbol);
}

function isTonicFamily(cell: ChordCell, key: KeyCandidate): boolean {
  if (cell.isRest) return false;
  if (cell.rootPc !== mod12(key.tonicPc)) return false;
  const family = key.mode === "major" ? MAJOR_FAMILY : MINOR_FAMILY;
  return family.includes(cell.qualitySymbol);
}

function identical(a: ChordCell, b: ChordCell): boolean {
  return (
    !a.isRest &&
    !b.isRest &&
    a.rootPc === b.rootPc &&
    a.qualitySymbol === b.qualitySymbol &&
    a.bassPc === b.bassPc
  );
}

function buildCandidate(
  rootPc: number,
  qualitySymbol: string,
  key: KeyCandidate,
): ChordCell {
  return buildCellFromSymbol({ rootPc, qualitySymbol, bassPc: null }, key);
}

/** Display name for a single pitch class (guide-tone copy). */
function pcName(pc: number, key: KeyCandidate): string {
  return spellChordName(mod12(pc), "", key.tonicPc, key.mode);
}

// ---------------------------------------------------------------------------
// Exported predicate gates (the review-gate surface: labels only fire
// through these, on the same data the candidate was built from).
// ---------------------------------------------------------------------------

export function isTritoneSub(
  orig: ChordCell,
  cand: ChordCell,
  next: ChordCell | null,
  key: KeyCandidate,
): boolean {
  if (orig.isRest || cand.isRest) return false;
  if (next === null || next.isRest) return false;
  if (!isDominantQuality(orig.qualitySymbol)) return false;
  if (!isDominantQuality(cand.qualitySymbol)) return false;
  if (mod12(cand.rootPc) !== mod12(orig.rootPc + 6)) return false;
  if (next.rootPc !== mod12(cand.rootPc - 1)) return false;
  return isTonicFamily(next, key);
}

export function isSecondaryDominant(
  cand: ChordCell,
  next: ChordCell | null,
  key: KeyCandidate,
): boolean {
  if (cand.isRest) return false;
  if (next === null || next.isRest) return false;
  if (!isDominantQuality(cand.qualitySymbol)) return false;
  if (mod12(cand.rootPc + 5) !== next.rootPc) return false;
  // "candidate degree != V" port: the key's own dominant resolving to
  // the tonic is functional V-I, never secondary.
  if (cand.rootPc === mod12(key.tonicPc + 7)) return false;
  return true;
}

export function isModalInterchange(
  cand: ChordCell,
  claimedByAbove: boolean,
  key: KeyCandidate,
): boolean {
  if (cand.isRest) return false;
  if (claimedByAbove) return false;
  return !diatonicPcs(key).includes(mod12(cand.rootPc));
}

export function isPassingDiminished(
  orig: ChordCell,
  cand: ChordCell,
  next: ChordCell | null,
): boolean {
  if (orig.isRest || cand.isRest) return false;
  if (next === null || next.isRest) return false;
  if (cand.qualitySymbol !== "dim" && cand.qualitySymbol !== "dim7") {
    return false;
  }
  const ascending =
    mod12(cand.rootPc) === mod12(orig.rootPc + 1) &&
    mod12(next.rootPc) === mod12(orig.rootPc + 2);
  const descending =
    mod12(cand.rootPc) === mod12(orig.rootPc - 1) &&
    mod12(next.rootPc) === mod12(orig.rootPc - 2);
  return ascending || descending;
}

// ---------------------------------------------------------------------------
// substituteChord (order: tritone -> secdom -> passing-dim -> modal ->
// neighbor; D99 precedence).
// ---------------------------------------------------------------------------

/** Modal pools (D99 residual shape - see header on iv7/III7). */
const MODAL_POOLS: Readonly<Record<"major" | "minor", readonly string[]>> = {
  major: ["bVI", "bVII7"],
  minor: ["bII7"],
};

export function substituteChord(
  cell: ChordCell,
  ctx: SubstituteContext,
): readonly SubstituteCandidate[] {
  const { next, key } = ctx;
  if (cell.isRest) return [];
  if (QUALITY_INTERVALS[cell.qualitySymbol] === undefined) return [];

  const out: SubstituteCandidate[] = [];
  const claimed = (cand: ChordCell): boolean =>
    out.some(
      (e) =>
        e.cell.rootPc === cand.rootPc &&
        e.cell.qualitySymbol === cand.qualitySymbol,
    );

  // 1. Tritone substitution (replaces a dominant a tritone away).
  {
    const quality = isDominantQuality(cell.qualitySymbol)
      ? cell.qualitySymbol
      : "dom7";
    const cand = buildCandidate(mod12(cell.rootPc + 6), quality, key);
    if (!identical(cell, cand) && isTritoneSub(cell, cand, next, key)) {
      const third = pcName(cell.rootPc + 4, key);
      const seventh = pcName(cell.rootPc + 10, key);
      const nextName = next === null ? "" : next.name;
      out.push({
        cell: cand,
        technique: "tritone-sub",
        rationale:
          `${cand.name} shares ${cell.name}'s 3rd/7th tritone ` +
          `(${third}-${seventh}) and steps down a semitone to ${nextName}.`,
        conceptId: "tritone-sub",
      });
    }
  }

  // 2. Secondary dominant (V7 of the next chord).
  if (next !== null && !next.isRest) {
    const cand = buildCandidate(mod12(next.rootPc + 7), "dom7", key);
    if (!identical(cell, cand) && isSecondaryDominant(cand, next, key)) {
      out.push({
        cell: cand,
        technique: "secondary-dominant",
        rationale:
          `${cand.name} is the V7 of ${next.name} (its root sits a ` +
          `fifth above the target) and tonicizes it without leaving the key.`,
        conceptId: "secondary-dominant",
      });
    }
  }

  // 3. Passing diminished (chromatic step between whole-step roots).
  if (next !== null && !next.isRest) {
    let passingRoot: number | null = null;
    if (mod12(next.rootPc) === mod12(cell.rootPc + 2)) {
      passingRoot = mod12(cell.rootPc + 1);
    } else if (mod12(next.rootPc) === mod12(cell.rootPc - 2)) {
      passingRoot = mod12(cell.rootPc - 1);
    }
    if (passingRoot !== null) {
      const cand = buildCandidate(passingRoot, "dim7", key);
      if (
        !identical(cell, cand) &&
        isPassingDiminished(cell, cand, next)
      ) {
        out.push({
          cell: cand,
          technique: "passing-diminished",
          rationale:
            `${cand.name} walks chromatically from ${cell.name} to ` +
            `${next.name} (a diminished passing chord, no concept link).`,
          conceptId: null,
        });
      }
    }
  }

  // 4. Modal interchange (residual: non-diatonic, unclaimed above).
  for (const token of MODAL_POOLS[key.mode]) {
    const real = parseNumeral(token, key.mode);
    if (real === null) continue;
    const cand = buildCandidate(
      mod12(key.tonicPc + real.rootOffsetSemitones),
      real.qualitySymbol,
      key,
    );
    if (identical(cell, cand)) continue;
    if (!isModalInterchange(cand, claimed(cand), key)) continue;
    out.push({
      cell: cand,
      technique: "modal-interchange",
      rationale:
        `${cand.name} borrows its root from outside the ${key.mode} ` +
        `pitch set (parallel-mode color, not a functional dominant).`,
      conceptId: "modal-interchange",
    });
  }

  // 5. Diatonic neighbor (a third away, same quality, conceptId null).
  {
    const diatonic = diatonicPcs(key);
    const idx = diatonic.indexOf(mod12(cell.rootPc));
    if (idx >= 0) {
      const dirs: readonly { delta: number; word: string }[] = [
        { delta: 2, word: "above" },
        { delta: -2, word: "below" },
      ];
      for (const dir of dirs) {
        const root = diatonic[(idx + dir.delta + diatonic.length) % diatonic.length] as number;
        const cand = buildCandidate(root, cell.qualitySymbol, key);
        if (identical(cell, cand)) continue;
        out.push({
          cell: cand,
          technique: "diatonic-neighbor",
          rationale:
            `${cand.name} sits a diatonic third ${dir.word} ` +
            `${cell.name} with the same ${cell.qualitySymbol} quality.`,
          conceptId: null,
        });
      }
    }
  }

  return out;
}
