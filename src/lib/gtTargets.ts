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
import { type HarmonicPath, type HarmonicStep } from "./paths";
import {
  intervalToRole,
  roleToGuideToneTarget,
} from "./guideTones";

export type GuideToneTargetKind = "3rd" | "7th";

export interface GuideToneTarget {
  /** 0-based bar index == step index (F3, D110: 1 step = 1 bar). */
  bar: number;
  /** True when the bar's chord voicing contains at least one 3rd or 7th. */
  hasGuideTone: boolean;
  /** Which guide-tone roles the bar's voicing exposes (subset of ["3rd", "7th"]). */
  targets: GuideToneTargetKind[];
}

/**
 * Build the per-bar guide-tone coverage map for a HarmonicPath.
 *
 * F3 (D110, blast-table #8): ONE target per STEP over the full step
 * list - 1 step = 1 bar of audio truth. Consumers that render the
 * FORM slice to formLen (the rail does: targets.slice(0, formLen),
 * first pass = form). The legacy STEPS_PER_BAR grouping encoded the
 * retired 1-step-per-BEAT labeling fiction.
 *
 * Each step's chord voicing is its own unique pitch-class set (the
 * old "first step represents the bar" convention it cited from
 * formatChordReadout is itself frozen-pinned dead, D112).
 *
 * Steps with empty notes (rests / degenerate data) get
 * `hasGuideTone: false` and an empty `targets` array.
 */
export function gtTargetsForPath(path: HarmonicPath): GuideToneTarget[] {
  const out: GuideToneTarget[] = [];
  for (let step = 0; step < path.steps.length; step++) {
    const s: HarmonicStep | undefined = path.steps[step];
    out.push(s ? classifyBarTargets(step, s) : emptyTarget(step));
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
  for (let i = 0; i < sorted.length; i++) {
    const pc = ((sorted[i] % 12) + 12) % 12;
    const interval = ((pc - bassPc) + 12) % 12;
    const role = intervalToRole(interval, i === 0);
    const target = roleToGuideToneTarget(role);
    if (target) targets.add(target);
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
