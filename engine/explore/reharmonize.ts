/**
 * engine/explore/reharmonize.ts - PRD-001 Phase 5 (REQ-EXP-10).
 *
 * N alternative harmonizations of one progression: per bar (ascending,
 * D100) pick one substituteChord candidate via rng.pick; bars with no
 * candidates carry the original ({technique: "original"}). Alternatives
 * differing in zero bars are re-drawn (bounded 8 tries each); only
 * fingerprint-distinct alternatives ship (the distinct prefix - never
 * duplicates). The original progression's fingerprint seeds the seen
 * set, so an all-carried re-draw is rejected by construction.
 *
 * Purity: relative imports only, Rng injected, no clock, no console.
 */

import type { Rng } from "../core/rng";
import type { ChordCell, KeyCandidate } from "../compose/types";
import { substituteChord } from "./substitute";
import type { SubstituteCandidate } from "./types";

/** Flat-progression fingerprint (mirrors the accompany gridFingerprint
 *  tuple shape: rootPc.qualitySymbol[/bassPc], rest cells as "rest"). */
export function progressionFingerprint(
  cells: readonly ChordCell[],
): string {
  return cells
    .map((c) =>
      c.isRest
        ? "rest"
        : `${c.rootPc}.${c.qualitySymbol}${c.bassPc === null ? "" : "/" + c.bassPc}`,
    )
    .join("|");
}

const KEPT_RATIONALE = "Kept from the seed progression.";

/**
 * N alternatives (count clamped 1..6), each one SubstituteCandidate
 * per input bar in order.
 */
export function reharmonizeProgression(
  cells: readonly ChordCell[],
  key: KeyCandidate,
  rng: Rng,
  count: number,
): readonly (readonly SubstituteCandidate[])[] {
  const finite = Number.isFinite(count) ? Math.floor(count) : 3;
  const want = Math.max(1, Math.min(6, finite));
  const seen = new Set<string>([progressionFingerprint(cells)]);
  const out: (readonly SubstituteCandidate[])[] = [];

  for (let a = 0; a < want; a++) {
    let placed = false;
    for (let attempt = 0; attempt < 8 && !placed; attempt++) {
      const alt: SubstituteCandidate[] = cells.map((cell, i) => {
        const cands = substituteChord(cell, {
          next: cells[i + 1] ?? null,
          key,
        });
        if (cands.length === 0) {
          return {
            cell,
            technique: "original" as const,
            rationale: KEPT_RATIONALE,
            conceptId: null,
          };
        }
        return rng.pick(cands);
      });
      const fp = progressionFingerprint(alt.map((c) => c.cell));
      if (!seen.has(fp)) {
        seen.add(fp);
        out.push(alt);
        placed = true;
      }
    }
    if (!placed) break;
  }
  return out;
}
