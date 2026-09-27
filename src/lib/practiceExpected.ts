/**
 * src/lib/practiceExpected.ts - PRD-001 Phase 7 S3 (D130): the
 * expected-grid builder for played-correctly detection.
 *
 * Lives in src/ NOT engine/ because it consumes HarmonicPath-shaped
 * data (the paths module lives in src - the engine cannot import it,
 * purity allowlist). The engine (engine/practice/detect.ts) consumes
 * the grid as PLAIN data (ExpectedBar is structural).
 *
 * The guide-tone LAWS are RE-DERIVED here (guideTonePcs mirrors
 * intervalToRole: 3/4 -> third, 10/11 -> seventh, bass-relative).
 * The duplication is the purity cost (precedent: duty.ts safeInt,
 * S2 law 7 - "cheaper than widening exports"); it is SAFE because
 * practiceExpected.test.ts pins it against the SHIPPED oracle
 * (gtTargetsForPath + classifyGuideTone) over EVERY curated path -
 * the anti-drift cross-check (docs section 3.4).
 *
 * Kinds (D130): "target" = the bar's sounding chord HAS guide tones
 * (expected pcs = the gt set); "free" = chord present but NO guide
 * tones (sus/power voicings - unscored, excluded from the
 * denominator); "rest" = EMPTY notes or a pause-phase rest bar
 * (any note is a discipline extra). Bars outside the active span are
 * NOT in the grid at all.
 */

import type { ExpectedBar } from "../../engine/practice/detect";

export type { ExpectedBar } from "../../engine/practice/detect";

function pcOf(n: number): number {
  return ((n % 12) + 12) % 12;
}

/**
 * The guide-tone pc law, intervalToRole-equivalent (3/4 -> third,
 * 10/11 -> seventh), re-derived for engine purity. Sorted-unique
 * ascending, bass = lowest - the SAME walk gtTargetsForPath's
 * classifyBarTargets performs. Returns sorted, de-duped pcs.
 */
export function guideTonePcs(notes: readonly number[]): number[] {
  const sorted = [...new Set(notes.filter((n) => Number.isInteger(n) && Number.isFinite(n)))].sort(
    (a, b) => a - b,
  );
  if (sorted.length === 0) return [];
  const bassPc = pcOf(sorted[0]);
  const out = new Set<number>();
  for (let i = 0; i < sorted.length; i++) {
    const pc = pcOf(sorted[i]);
    // intervalToRole mirror: bass -> root (never a guide tone).
    if (i === 0) continue;
    const interval = ((pc - bassPc) + 12) % 12;
    if (interval === 3 || interval === 4 || interval === 10 || interval === 11) {
      out.add(pc);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Build the expected grid for one play run.
 *
 * @param formLen detectFormPeriod - bars of the FORM (1 step = 1 bar).
 * @param soundingNotes[b] the SOUNDING notes of form bar b (the
 *        App's per-step transform already baked in - transpose,
 *        voicing, drift). Indexed 0..formLen-1 (first pass = form).
 * @param span active loop/AB window (inclusive bars) or null = the
 *        whole form. Bars outside are NOT in the grid (unscored).
 * @param restBars pause-phase rest bars WITHIN the span (static
 *        rests; the DUTY-CYCLE rest is dynamic and applied by the
 *        hook - see usePlayedCorrectly).
 */
export function buildExpectedGrid(
  formLen: number,
  soundingNotes: readonly (readonly number[])[],
  span: { fromBar: number; toBar: number } | null,
  restBars: ReadonlySet<number>,
): ExpectedBar[] {
  const out: ExpectedBar[] = [];
  const total = Math.max(0, Math.floor(Number.isFinite(formLen) ? formLen : 0));
  for (let b = 0; b < total; b++) {
    if (span !== null && (b < span.fromBar || b > span.toBar)) continue;
    const notes = soundingNotes[b] ?? [];
    if (notes.length === 0 || restBars.has(b)) {
      out.push({ bar: b, kind: "rest", pcs: [] });
      continue;
    }
    const pcs = guideTonePcs(notes);
    out.push(
      pcs.length > 0
        ? { bar: b, kind: "target", pcs }
        : { bar: b, kind: "free", pcs: [] },
    );
  }
  return out;
}
