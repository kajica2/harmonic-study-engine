/**
 * engine/explore/modulate.ts - PRD-001 Phase 5 (REQ-EXP-14, D94).
 *
 * DEFERRED STUB (P2, fast-follow TD-EXP-MOD). No pivot primitive
 * exists (etude passes are intra-key; compose inference is mono-key),
 * and a 2-bar bridge without pivot analysis would be a key-change
 * CLAIM without computation - violating the honesty lineage. The
 * surface shows NO Modulate button (no promise made); this stub is
 * the seam the fast-follow builds on.
 *
 * Purity: relative imports only, no clock, no randomness, no console.
 */

import type { KeyCandidate, Outcome } from "../compose/types";

/** Always the unsupported arm (modulate.test.ts pins the deferral). */
export function planModulation(
  from: KeyCandidate,
  to: KeyCandidate,
): Outcome<readonly string[]> {
  void from;
  void to;
  return {
    ok: false,
    error: {
      code: "unsupported",
      message:
        "modulation bridges land as a fast-follow (TD-EXP-MOD); " +
        "reharmonize toward the new tonic meanwhile",
    },
  };
}
