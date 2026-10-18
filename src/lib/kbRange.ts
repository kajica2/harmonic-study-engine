/**
 * src/lib/kbRange.ts
 * -----------------
 * Pure helpers for the keyboard-range control. The control surfaces as
 * two slider thumbs (From / To) in App.tsx; this module owns the
 * invariants those thumbs must respect so a slide cannot leave the
 * keyboard in a degenerate state.
 *
 * Rules (all enforced by `clampKbRange`):
 *   - both endpoints stay inside [KB_RANGE_MIN, KB_RANGE_MAX]
 *     (A0..C8 - the full MIDI keyboard)
 *   - the span is at least KB_RANGE_MIN_SPAN semitones (one octave),
 *     so a slide never collapses the keyboard to one key or inverts
 *   - integer cents only (slider step=1)
 *   - the side the user moved last is the side that gets snapped, so
 *     dragging the From thumb upward cannot silently drag the To thumb
 *     with it
 *
 * Pin list lives in `src/lib/kbRange.test.ts`.
 */

export const KB_RANGE_DEFAULT = { from: 36, to: 72 } as const; // C2..C5
export const KB_RANGE_MIN = 21; // A0 (lowest piano key)
export const KB_RANGE_MAX = 108; // C8 (highest piano key)
export const KB_RANGE_MIN_SPAN = 12; // one octave

export interface KbRange {
  from: number;
  to: number;
}

export type KbRangeSide = "from" | "to";

/**
 * Compute a safe kbRange from the user's latest slider input.
 *
 * @param next    the new candidate value (one or both sides may be
 *                outside the bounds or below the min-span)
 * @param prev    the value before the user touched it (used to decide
 *                which side to snap when the new span is too narrow)
 * @param moved   which side the user actually moved in this gesture
 *                - optional; falls back to detecting from `prev`
 *
 * Returns a new object whose `from < to`, both inside the legal range,
 * and span at least KB_RANGE_MIN_SPAN. The function is pure and
 * deterministic - same inputs always produce the same output.
 */
export function clampKbRange(
  next: KbRange,
  prev?: KbRange,
  moved?: KbRangeSide,
): KbRange {
  // Defensive: a `<input type="range">` value is always a finite number,
  // but tests and hand-edited localStorage may hand us NaN. Fall back
  // to the prev value (or the legal default) on either side.
  const prevFrom = prev?.from ?? KB_RANGE_DEFAULT.from;
  const prevTo = prev?.to ?? KB_RANGE_DEFAULT.to;
  const safeFrom = Number.isFinite(next.from) ? Math.round(Number(next.from)) : prevFrom;
  const safeTo = Number.isFinite(next.to) ? Math.round(Number(next.to)) : prevTo;
  let from = Math.max(KB_RANGE_MIN, Math.min(KB_RANGE_MAX, safeFrom));
  let to = Math.max(KB_RANGE_MIN, Math.min(KB_RANGE_MAX, safeTo));

  // Decide which thumb the user moved. If both moved we snap by
  // from-side (arbitrary but deterministic - the test pins it).
  const side: KbRangeSide =
    moved ??
    (prev
      ? next.from !== prev.from && next.to === prev.to
        ? "from"
        : next.to !== prev.to && next.from === prev.from
          ? "to"
          : "from"
      : "from");

  // Enforce min-span by snapping the OTHER side.
  if (to - from < KB_RANGE_MIN_SPAN) {
    if (side === "from") {
      to = Math.min(KB_RANGE_MAX, from + KB_RANGE_MIN_SPAN);
      // re-check: if from is at the top, snap from instead
      if (to - from < KB_RANGE_MIN_SPAN) {
        from = to - KB_RANGE_MIN_SPAN;
      }
    } else {
      from = Math.max(KB_RANGE_MIN, to - KB_RANGE_MIN_SPAN);
      if (to - from < KB_RANGE_MIN_SPAN) {
        to = from + KB_RANGE_MIN_SPAN;
      }
    }
  }

  // Re-clamp the snapped side so the min-span step never lands outside
  // the global bounds.
  if (from < KB_RANGE_MIN) {
    from = KB_RANGE_MIN;
    to = Math.max(KB_RANGE_MIN + KB_RANGE_MIN_SPAN, to);
  }
  if (to > KB_RANGE_MAX) {
    to = KB_RANGE_MAX;
    from = Math.min(KB_RANGE_MAX - KB_RANGE_MIN_SPAN, from);
  }

  return { from, to };
}