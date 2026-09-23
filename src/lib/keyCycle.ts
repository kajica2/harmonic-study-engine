/**
 * src/lib/keyCycle.ts - PRD-001 Phase 2 (D13): the pure cycle-all-12
 * advance decision.
 *
 * Kept dependency-free ON PURPOSE: the form length is passed in as a
 * parameter (the caller computes detectFormPeriod(path.steps) once
 * and memoizes it), so this module imports nothing and the decision
 * can be unit-tested without touching path data or React.
 *
 * The App.tsx onMeasureStart handler computes this decision OUTSIDE
 * the setActiveStepIndex updater (StrictMode double-invoke safety)
 * and dispatches the store mutation via a queued call.
 */

export interface CycleAdvanceDecision {
  /** The step index playback lands on for the next measure. */
  readonly nextStepIndex: number;
  /** detectFormPeriod(path.steps) - the repeating form length. */
  readonly formLen: number;
  /** path.steps.length (padded view). */
  readonly totalSteps: number;
  /** Store flag: cycle-all-12 engaged. */
  readonly cycleActive: boolean;
  /** True while the sub-range loop (loopStartBar) is active - the
   *  cycle is suppressed there because the loop window can wrap the
   *  form boundary at arbitrary offsets. */
  readonly subLoopActive: boolean;
}

/**
 * Advance iff the next step index completes a form pass:
 * nextStepIndex % formLen === 0 (the wrap 95 -> 0 counts, since
 * 0 % formLen === 0). Never fires while inactive, while a sub-range
 * loop is active, or for degenerate form lengths.
 */
export function shouldAdvanceKeyCycle(d: CycleAdvanceDecision): boolean {
  if (!d.cycleActive) return false;
  if (d.subLoopActive) return false;
  if (!Number.isFinite(d.formLen) || d.formLen <= 0) return false;
  if (!Number.isFinite(d.totalSteps) || d.totalSteps <= 0) return false;
  if (!Number.isInteger(d.nextStepIndex) || d.nextStepIndex < 0) return false;
  return d.nextStepIndex % d.formLen === 0;
}
