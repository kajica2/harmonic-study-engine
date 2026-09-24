/**
 * engine/explore/expand.ts - PRD-001 Phase 5 (D99).
 *
 * Chord widening over the 17-quality table (core/chords): a target is
 * an extension ONLY when its pitch classes strictly superset the
 * original's mod12 with the SAME root (isExtension gate below); the
 * single dom7 -> alt widening is an alteration (same root, flat-13
 * color, not a superset in kind). conceptId is ALWAYS null (no
 * registry concept covers extensions - "where possible" allows it;
 * the rationale says so plainly).
 *
 * Map (D99): maj -> [maj7, maj9, maj6, majadd9]; min -> [m7, min9,
 * min6, minadd9]; m7 -> [min9]; maj7 -> [maj9]; dom7 -> [dom9, alt].
 * Everything else (halfdim/dim7/sus4/the 6- and 9-families) -> []
 * (honest: nothing wider in-table). Each emitted target is verified
 * through isExtension/isAlteration on the SAME data before emission
 * (review gate).
 *
 * Purity: relative imports only, no clock, no randomness, no console.
 */

import { buildCellFromSymbol } from "../compose/chordsym";
import { QUALITY_INTERVALS } from "../core/chords";
import type { ChordCell, KeyCandidate } from "../compose/types";
import type { SubstituteCandidate } from "./types";

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

function pcSet(qualitySymbol: string, rootPc: number): Set<number> | null {
  const intervals = QUALITY_INTERVALS[qualitySymbol];
  if (intervals === undefined) return null;
  return new Set(intervals.map((iv) => mod12(rootPc + iv)));
}

/**
 * D99 extension gate: same root AND the candidate's mod12 pitch set
 * STRICTLY supersets the original's (identity is not an extension -
 * strictness is mutation-pinned in truthfulness.test.ts N5).
 */
export function isExtension(orig: ChordCell, cand: ChordCell): boolean {
  if (orig.isRest || cand.isRest) return false;
  if (mod12(orig.rootPc) !== mod12(cand.rootPc)) return false;
  const origPcs = pcSet(orig.qualitySymbol, orig.rootPc);
  const candPcs = pcSet(cand.qualitySymbol, cand.rootPc);
  if (origPcs === null || candPcs === null) return false;
  if (candPcs.size <= origPcs.size) return false;
  for (const pc of origPcs) {
    if (!candPcs.has(pc)) return false;
  }
  return true;
}

/** dom7 -> alt with the same root (the only alteration in-table). */
export function isAlteration(orig: ChordCell, cand: ChordCell): boolean {
  if (orig.isRest || cand.isRest) return false;
  if (mod12(orig.rootPc) !== mod12(cand.rootPc)) return false;
  return orig.qualitySymbol === "dom7" && cand.qualitySymbol === "alt";
}

const EXPAND_MAP: Readonly<Record<string, readonly string[]>> = {
  maj: ["maj7", "maj9", "maj6", "majadd9"],
  min: ["m7", "min9", "min6", "minadd9"],
  m7: ["min9"],
  maj7: ["maj9"],
  dom7: ["dom9", "alt"],
};

const ADDED_NAMES: Readonly<Record<number, string>> = {
  2: "9th",
  8: "flat 13th",
  9: "6th",
  10: "minor 7th",
  11: "major 7th",
};

function addedDescription(orig: ChordCell, cand: ChordCell): string {
  const origPcs = pcSet(orig.qualitySymbol, orig.rootPc);
  const candPcs = pcSet(cand.qualitySymbol, cand.rootPc);
  if (origPcs === null || candPcs === null) return "upper color";
  const added: string[] = [];
  for (const pc of candPcs) {
    if (!origPcs.has(pc)) {
      const above = mod12(pc - orig.rootPc);
      added.push(ADDED_NAMES[above] ?? `${above} semitones above the root`);
    }
  }
  return added.length > 0 ? added.join(" and ") : "upper color";
}

export function expandChord(
  cell: ChordCell,
  key: KeyCandidate,
): readonly SubstituteCandidate[] {
  if (cell.isRest) return [];
  if (QUALITY_INTERVALS[cell.qualitySymbol] === undefined) return [];
  const targets = EXPAND_MAP[cell.qualitySymbol] ?? [];
  const out: SubstituteCandidate[] = [];
  for (const target of targets) {
    const cand = buildCellFromSymbol(
      { rootPc: cell.rootPc, qualitySymbol: target, bassPc: null },
      key,
    );
    if (isAlteration(cell, cand)) {
      out.push({
        cell: cand,
        technique: "alteration",
        rationale:
          `${cand.name} alters ${cell.name} (flat-13 color on the ` +
          `same root, no concept link).`,
        conceptId: null,
      });
    } else if (isExtension(cell, cand)) {
      out.push({
        cell: cand,
        technique: "extension",
        rationale:
          `${cand.name} widens ${cell.name} with an added ` +
          `${addedDescription(cell, cand)} (no concept link).`,
        conceptId: null,
      });
    }
  }
  return out;
}
