/**
 * src/lib/gtTargets.ts — precompute per-bar guide-tone targets for
 * a HarmonicPath.
 *
 * FUTURE_PLANNING near-term #3: "Path-level guide-tone coverage map.
 * Precompute which bars of each HarmonicPath contain a 3rd/7th in
 * their voicing; render a tiny 'GT targets' row under the bar strip
 * so players know where the guide tones actually are before they
 * play."
 *
 * Pure function. Each bar's "target" is the set of role labels
 * (3rd, 7th, or both) that appear in the bar's chord voicing. The
 * UI uses this to render a per-bar chip ("✓" when the bar has at
 * least one guide tone, "—" when the bar has none — e.g. a sus or
 * pure-power-chord bar).
 *
 * Reuses the same bass-relative classification as `classifyGuideTone`
 * (slot → role by interval) so the coverage map and the live chip
 * agree on what counts as a guide tone.
 */
import { STEPS_PER_BAR, type HarmonicPath, type HarmonicStep } from "./paths";

export type GuideToneTargetKind = "3rd" | "7th";

export interface GuideToneTarget {
  /** 0-based bar index (path-wide, after padPath). */
  bar: number;
  /** True when the bar's chord voicing contains at least one 3rd or 7th. */
  hasGuideTone: boolean;
  /** Which guide-tone roles the bar's voicing exposes (subset of ["3rd", "7th"]). */
  targets: GuideToneTargetKind[];
}

/**
 * Build the per-bar guide-tone coverage map for a HarmonicPath.
 *
 * Each bar = STEPS_PER_BAR consecutive steps. The bar's chord
 * voicing is the unique pitch-class set of its first step's notes
 * (matches the convention in formatChordReadout / currentBarNumber
 * — the first step represents the bar).
 *
 * Returns one entry per bar. Bars whose first step is empty (the
 * padPath "loop the form" filler can produce empty leading bars in
 * theory) get `hasGuideTone: false` and an empty `targets` array.
 */
export function gtTargetsForPath(path: HarmonicPath): GuideToneTarget[] {
  const totalBars = Math.ceil(path.steps.length / STEPS_PER_BAR);
  const out: GuideToneTarget[] = [];
  for (let bar = 0; bar < totalBars; bar++) {
    const firstStepIdx = bar * STEPS_PER_BAR;
    const step: HarmonicStep | undefined = path.steps[firstStepIdx];
    out.push(step ? classifyBarTargets(bar, step) : emptyTarget(bar));
  }
  return out;
}

function emptyTarget(bar: number): GuideToneTarget {
  return { bar, hasGuideTone: false, targets: [] };
}

/**
 * Classify one step's chord voicing. Mirrors the slot → role logic
 * in `classifyGuideTone` but folds across all chord notes at once
 * (we don't need the per-played-note match — just "does this chord
 * contain a 3rd or 7th").
 *
 * Interval from the bass:
 *   0 → root, 2/9 → 9th (not a guide tone)
 *   3/4 → 3rd (guide tone)
 *   5/7 → 5th (not a guide tone; 7 is the tritone-sub 5th)
 *   10/11 → 7th (guide tone)
 *   anything else → color (not a guide tone)
 *
 * Multiple pcs can map to the same role (e.g. a chord with both a
 * major 3rd and a sus 4th has two thirds); we de-dupe via Set.
 */
function classifyBarTargets(
  bar: number,
  step: HarmonicStep,
): GuideToneTarget {
  const sorted = [...new Set(step.notes)].sort((a, b) => a - b);
  if (sorted.length === 0) return emptyTarget(bar);

  const bassPc = ((sorted[0] % 12) + 12) % 12;
  const targets = new Set<GuideToneTargetKind>();
  for (const note of sorted) {
    const pc = ((note % 12) + 12) % 12;
    const interval = ((pc - bassPc) + 12) % 12;
    if (interval === 3 || interval === 4) targets.add("3rd");
    else if (interval === 10 || interval === 11) targets.add("7th");
  }
  const arr = [...targets].sort();
  return {
    bar,
    hasGuideTone: arr.length > 0,
    targets: arr,
  };
}

/**
 * Convenience: index a target list by bar for fast lookup in render
 * code. Returns `null` for out-of-range bars so callers don't have
 * to bounds-check.
 */
export function getGtTarget(
  targets: GuideToneTarget[],
  bar: number,
): GuideToneTarget | null {
  if (bar < 0 || bar >= targets.length) return null;
  return targets[bar];
}

/**
 * Count bars that contain at least one guide tone. Useful for the
 * catalog summary ("12/24 bars have guide tones").
 */
export function gtCoverageCount(targets: GuideToneTarget[]): {
  covered: number;
  total: number;
} {
  const covered = targets.reduce(
    (n, t) => n + (t.hasGuideTone ? 1 : 0),
    0,
  );
  return { covered, total: targets.length };
}
