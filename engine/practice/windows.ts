/**
 * engine/practice/windows.ts - PRD-001 Phase 7 S1 (D110): the pure
 * bar<->step law for form-relative 1:1 windows.
 *
 * Audio truth (docs/PHASE-7-PRACTICE.md 1.1, formPeriod.ts header):
 * the transport fires onMeasureStart once per BAR and advances one
 * path step per firing, so 1 HarmonicStep = 1 BAR of rendered audio
 * for every path and every meter. The legacy "* 4" window math was a
 * labeling fiction (1 step = 1 BEAT) and is retired by F3.
 *
 * The model (D110):
 *   formLen = detectFormPeriod(path.steps)   // computed once in App
 *   bar b (0-based, 0 <= b < formLen)  <-->  step b   // identity, first pass
 *   window [a..c] inclusive bars       <-->  steps [a .. c+1)
 *   display bar of step s              = (s % formLen) + 1
 *   display total                      = formLen
 *
 * Form-relative, not absolute steps: a 32-bar standard padded to 96
 * steps shows 32 strip cells (form x3), and "loop bars 5-8" means the
 * TUNE's bars 5-8. Non-repeating paths degenerate to plain 1:1
 * (formLen === steps.length) - no special case.
 *
 * Pure (ADR-003): params in, numbers out - no clock, no DOM, no rng.
 * S2/S3 extend THIS module (pause/AB window selection); S1 ships the
 * foundation so the file grows instead of being forked.
 */

export interface BarWindow {
  /** Inclusive start form bar, 0-based (0 <= fromBar < formLen). */
  fromBar: number;
  /** Inclusive end form bar, 0-based (fromBar <= toBar < formLen). */
  toBar: number;
}

function safeInt(n: number): number {
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

/** The display total: at least one bar, even for degenerate forms. */
export function totalFormBars(formLen: number): number {
  return Math.max(1, safeInt(formLen));
}

/**
 * The one honest bar<->step law: form-relative bar (0-based) of a
 * step index. Wraps across padded repeats; NaN/negative guarded.
 */
export function barOfStep(step: number, formLen: number): number {
  const total = totalFormBars(formLen);
  const s = safeInt(step);
  return ((s % total) + total) % total;
}

/** Clamp + normalize a user window to the form (inclusive bars). */
export function clampWindow(w: BarWindow, formLen: number): BarWindow {
  const total = totalFormBars(formLen);
  let from = Math.min(Math.max(0, safeInt(w.fromBar)), total - 1);
  let to = Math.min(Math.max(0, safeInt(w.toBar)), total - 1);
  if (from > to) {
    // Normalize a reversed selection to ascending (rail shift-click
    // already orders, but persisted values can arrive swapped).
    const swap = from;
    from = to;
    to = swap;
  }
  return { fromBar: from, toBar: to };
}

/**
 * Window -> half-open step range [fromStep, toStep). Identity map
 * within the first pass (1 step = 1 bar); the caller's wrap lines
 * stay byte-identical to the legacy handler.
 */
export function windowStepRange(
  w: BarWindow,
  formLen: number,
): { fromStep: number; toStep: number } {
  const c = clampWindow(w, formLen);
  return { fromStep: c.fromBar, toStep: c.toBar + 1 };
}

/**
 * The DEFAULT transport law (2026-09, "always repeat indefinitely the
 * whole form"): the step after the last FORM bar is form bar 1 (index
 * 0), forever - practice never stops on its own.
 *
 * 1 step = 1 bar (the law above), so this is the whole-form repeat
 * every path runs out of the box. It replaces two older behaviours:
 * the HALT at the padded-path tail (playback stopped after one pass)
 * and the padded-path wrap (next = 0 at steps.length), which played a
 * TRUNCATED form whenever the pad was not a whole number of passes
 * (24 padded bars of a 16-bar tune = 1.5 passes).
 *
 * Same law as duty.loopStep over the span [0, totalFormBars): advance
 * inside the form, wrap at its tail; an out-of-range prev (stale
 * persist) snaps back to form bar 1. A user-selected window is
 * unaffected - it still wraps inside itself via windowStepRange.
 */
export function wholeFormNextStep(prevStep: number, formLen: number): number {
  const total = totalFormBars(formLen);
  const prev = safeInt(prevStep);
  if (prev + 1 >= total) return 0;
  if (prev < 0) return 0;
  return prev + 1;
}

/**
 * Auto-advance decision (2026-09, "loop OFF -> play once then advance
 * to the next path"): the transport law for the Loop chip OFF state.
 *
 * Loop ON keeps the historical whole-form repeat (wrap forever). With
 * loop OFF the form still cycles mid-pass, but the wrap at the form
 * tail (wholeFormNextStep returning 0) is the pass-completion signal:
 * advance to the next path (and keep playing) when one exists,
 * otherwise stop at the last path.
 *
 * Pure (ADR-003): params in, decision out - no clock, no DOM, no rng.
 */
export type AutoAdvanceDecision = "wrap" | "advance" | "stop";

export interface AutoAdvanceParams {
  /** Loop chip state: ON repeats the current path forever. */
  loopOn: boolean;
  /** The step index wholeFormNextStep computed for this measure. */
  nextStep: number;
  /** Index of the active path within the practice set. */
  activePathIndex: number;
  /** Total number of paths in the practice set. */
  pathCount: number;
}

export function decideAutoAdvance({
  loopOn,
  nextStep,
  activePathIndex,
  pathCount,
}: AutoAdvanceParams): AutoAdvanceDecision {
  if (loopOn) return "wrap";
  // A wrap to form bar 1 (nextStep 0) is the pass-completion signal;
  // mid-form steps keep the whole-form cycle. Strict equality (not
  // safeInt) so a NaN / fractional nextStep is never mistaken for a
  // wrap. The wrap signal is fully encoded in nextStep === 0: a 1-bar
  // form completes a pass every measure (wholeFormNextStep returns 0
  // from its only bar), so the decision needs no form length.
  if (nextStep !== 0) return "wrap";
  const idx = safeInt(activePathIndex);
  const count = safeInt(pathCount);
  if (idx < count - 1) return "advance";
  return "stop";
}
