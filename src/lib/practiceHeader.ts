/**
 * src/lib/practiceHeader.ts — pure formatters for the PracticeHeader.
 *
 * Extracted from the App.tsx top area so the chord/bar readout is
 * unit-testable without React. Everything here is a pure function
 * of state (path, activeStepIndex, time signature).
 */

import { stepsPerBar } from "./loopWav";
import { transitionsMissed, type GuideToneTrail } from "./guideToneTrail";
import type { HarmonicPath } from "./paths";
import type { TimeSignature } from "./rhythm";
// F3 (D110): the ONE honest bar<->step law.
import { barOfStep, totalFormBars } from "../../engine/practice/windows";

/**
 * Default time signature — used when the active step has no
 * `timeSignature` field (older HarmonicPath entries that predate
 * the field). 4/4 keeps the existing behavior for legacy paths.
 */
const DEFAULT_TIME_SIG: TimeSignature = "4/4";

/**
 * F3 (D112): the honest, form-relative bar readout. 1 path step =
 * 1 bar of audio truth; bars are form-relative (formLen =
 * detectFormPeriod(path.steps), computed once in App and passed
 * down). Replaces formatChordReadout in PracticeHeader WITHOUT
 * touching it: the legacy helpers below stay exported because the
 * FROZEN tests/practiceHeader.test.ts pins them (D112 -
 * exported-but-dead, removal is TD-050 when the tests/ freeze
 * lifts). The frozen tests never import this function.
 *
 * Example outputs:
 *   "Bar 5/32 — Eb/F (F9sus)"   (32-bar form, step 4)
 *   "Bar 1/16 — Cmaj7"          (step 16 wraps to the form head)
 */
export function formatBarReadout(
  formLen: number,
  activeStepIndex: number,
  chordName: string,
): string {
  const total = totalFormBars(formLen);
  const current = barOfStep(activeStepIndex, total) + 1;
  return `Bar ${current}/${total} — ${chordName || "—"}`;
}

/**
 * Render the bar-and-chord readout that appears in the PracticeHeader.
 *
 * LEGACY (D112, F3): 1-step-per-BEAT bar math. DEAD IN THE APP -
 * PracticeHeader switched to formatBarReadout (the honest form-
 * relative law). Kept exported ONLY because the frozen
 * tests/practiceHeader.test.ts pins this exact behavior; removal is
 * TD-050. Do not adopt for new call sites.
 *
 * Example outputs:
 *   "Bar 2/14 — Eb/F (F9sus)"
 *   "Bar 1/8  — Cmaj7"
 *   "Bar 1/1  — Cmaj7"   (single-bar path)
 *
 * `activeStepIndex` is 0-based. Bars are 1-based for the user.
 * The `—` separator works in any font and reads well at small sizes.
 *
 * If the path has zero steps (shouldn't happen but the type allows
 * it), returns a placeholder so the header never renders an empty
 * label.
 */
export function formatChordReadout(
  path: HarmonicPath | undefined,
  activeStepIndex: number,
  chordName: string,
  timeSignature: TimeSignature = DEFAULT_TIME_SIG,
): string {
  if (!path || path.steps.length === 0) return "—";
  const spb = stepsPerBar(timeSignature);
  const currentBar = Math.floor(activeStepIndex / spb) + 1;
  const totalBars = Math.ceil(path.steps.length / Math.max(1, spb));
  const bar = `${currentBar}/${totalBars}`;
  return `Bar ${bar} — ${chordName || "—"}`;
}

/**
 * Compute the bar number (1-based) for the active step.
 * Exposed so the PracticeHeader can render a thin progress indicator
 * without re-deriving the same math.
 *
 * LEGACY (D112, F3): dead in the app - frozen-pinned by
 * tests/practiceHeader.test.ts, kept exported for the pin; removal
 * is TD-050. New call sites use formatBarReadout.
 */
export function currentBarNumber(
  path: HarmonicPath | undefined,
  activeStepIndex: number,
  timeSignature: TimeSignature = DEFAULT_TIME_SIG,
): { current: number; total: number } | null {
  if (!path || path.steps.length === 0) return null;
  const spb = stepsPerBar(timeSignature);
  const current = Math.floor(activeStepIndex / spb) + 1;
  const total = Math.ceil(path.steps.length / Math.max(1, spb));
  return { current, total };
}

/**
 * Build the eyebrow line that shows above the chord readout.
 * Mirrors the existing "Step N of M" wording so users don't have
 * to relearn the vocabulary.
 */
export function formatStepEyebrow(
  path: HarmonicPath | undefined,
  activeStepIndex: number,
): string {
  if (!path || path.steps.length === 0) return "";
  return `Step ${activeStepIndex + 1} of ${path.steps.length}`;
}

/**
 * Format a tempo value for the compact display in the header.
 * 120 -> "120 bpm", 120.5 -> "121 bpm" (rounded).
 */
export function formatTempo(tempo: number): string {
  return `${Math.round(tempo)} bpm`;
}

/**
 * Build the live "✓ N · ✗ M" guide-tone tally chip that sits next to
 * GuideToneFeedback in the PracticeHeader. Returns null when no notes
 * have landed yet — the chip stays hidden during silence so it
 * doesn't distract from the latest-match chip.
 *
 * Example: totalNotes=4, guideHits=3 -> "✓ 3 · ✗ 1"
 *
 * The ✓ / ✗ glyphs reflect the live cumulative tally (FUTURE_PLANNING
 * item #1 / ADR-001). Reuses
 * `transitionsMissed` from guideToneTrail so the meaning stays
 * consistent with the take record written by the mastery log.
 */
export function formatGuideToneTally(
  trail: GuideToneTrail,
): string | null {
  if (trail.totalNotes === 0) return null;
  return `✓ ${trail.guideHits} · ✗ ${transitionsMissed(trail)}`;
}
