/**
 * EffectiveKeyBadge - PRD-001 Phase 2 (D12): announces the SOUNDING
 * key of the active path (source key + soundingShift), or a
 * conservative pitch-only fallback when no key can be claimed.
 *
 * Content forms:
 *  - "Sounding: Gb major"            (keyed path, spelled via D11)
 *  - "Sounding: Eb minor -> Db major" (drift path, endpoints shifted)
 *  - "Sounding: +3 st"               (pitch-only - no false claims)
 *
 * role="status" + aria-live="polite" so keyboard transpose nudges
 * (D14 brackets) are announced to assistive tech (PRD 9.8).
 *
 * ASCII-only by design (D12): no flat/sharp glyphs here; the existing
 * +/-7 chips keep theirs.
 */

import { effectiveKeyLabel } from "../../engine/core/spelling";

interface EffectiveKeyBadgeProps {
  /** The path's authored key string (paths.ts / conceptPaths.ts),
   *  or undefined for studies paths (no key field). */
  sourceKey?: string;
  /** The full sounding shift (global + exercise, D15). */
  shift: number;
  /** First/last step chord names - the key-less heuristic inputs. */
  fallbackFirstChord?: string;
  fallbackLastChord?: string;
}

export const EffectiveKeyBadge = ({
  sourceKey,
  shift,
  fallbackFirstChord,
  fallbackLastChord,
}: EffectiveKeyBadgeProps) => {
  const label = effectiveKeyLabel(
    sourceKey,
    shift,
    fallbackFirstChord,
    fallbackLastChord,
  );
  const text = label
    ? `Sounding: ${label}`
    : `Sounding: ${shift > 0 ? "+" : ""}${shift} st`;
  return (
    <span
      role="status"
      aria-live="polite"
      className="t-mono text-[10px] text-[color:var(--color-text-2)] uppercase tracking-wider border border-[color:var(--color-border)] rounded-[var(--radius-sm)] px-2 py-0.5"
    >
      {text}
    </span>
  );
};
