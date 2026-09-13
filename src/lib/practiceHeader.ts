/**
 * src/lib/practiceHeader.ts — pure formatters for the PracticeHeader.
 *
 * Extracted from the App.tsx top area so the chord/bar readout is
 * unit-testable without React. Everything here is a pure function
 * of state (path, activeStepIndex, time signature).
 */

import { stepsPerBar } from "./loopWav";
import type { HarmonicPath } from "./paths";
import type { TimeSignature } from "./rhythm";

/**
 * Default time signature — used when the active step has no
 * `timeSignature` field (older HarmonicPath entries that predate
 * the field). 4/4 keeps the existing behavior for legacy paths.
 */
const DEFAULT_TIME_SIG: TimeSignature = "4/4";

/**
 * Render the bar-and-chord readout that appears in the PracticeHeader.
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
