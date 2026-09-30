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
 * Resolve a preset loop window anchored at `currentBar` (form bar,
 * 0-based) that spans exactly `bars` bars. The preset is the
 * natural one-click alternative to a shift-click rail selection
 * (PRD-001 Phase 7 S2 follow-on): "loop this bar", "loop this +
 * next", "loop this phrase".
 *
 * Behavior:
 *  - Returns `null` for any degenerate input (out-of-range or
 *    non-positive `currentBar`, non-positive / non-finite `bars`,
 *    non-positive / non-finite form). Caller treats `null` as
 *    "do not change the loop window".
 *  - When the requested span runs past the form tail, the END bar
 *    is clamped to the form tail - the START bar is fixed at
 *    `currentBar` so the loop still anchors where the user clicked.
 *    A request that overshoots (e.g. 4 bars near bar 14 of a 16-bar
 *    form) returns the truncated 2-bar window; `isLoopPresetActive`
 *    catches the truncation and refuses to highlight the chip.
 *  - `bars > formLen` returns the whole form (clamped into range
 *    by the same path).
 *
 * Pure (ADR-003): params in, window out (or null) - no DOM.
 */
export function loopPresetWindow(
  currentBar: number,
  bars: number,
  formLen: number,
): BarWindow | null {
  // Degenerate form: totalFormBars snaps non-positive / non-finite to
  // 1, but a 1-bar form with currentBar outside [0, 1) is still out
  // of range (return null). A 1-bar form with currentBar 0 returns
  // { fromBar: 0, toBar: 0 } regardless of `bars` - that is the
  // shipped single-bar-form case.
  const total = totalFormBars(formLen);
  if (!Number.isFinite(currentBar)) return null;
  if (!Number.isFinite(bars)) return null;
  const cb = Math.floor(currentBar);
  const b = Math.floor(bars);
  if (cb < 0 || cb >= total) return null;
  if (b < 1) return null;
  const from = cb;
  const to = Math.min(cb + b - 1, total - 1);
  return { fromBar: from, toBar: to };
}

/**
 * Is the CURRENT loop window a clean, un-truncated preset of exactly
 * `bars` form bars? Used by the Loop chip's preset buttons to render
 * the active highlight (the button "looks selected" only when the
 * stored window is the same span a fresh click would produce).
 *
 * A user-selected window counts only when:
 *  - the window is set (non-null),
 *  - the stored span equals `bars` form bars inclusive,
 *  - AND the START + `bars` fits within the form (the "from a
 *    click" guarantee - a near-tail truncation isn't a "4-bar loop"
 *    even if it spans fewer bars).
 *
 * Pure (ADR-003). `bars <= 0` or non-finite -> false (no preset
 * can ever be active with zero/negative bar count).
 */
export function isLoopPresetActive(
  window: BarWindow | null,
  bars: number,
  formLen: number,
): boolean {
  if (window === null) return false;
  if (!Number.isFinite(bars)) return false;
  const total = totalFormBars(formLen);
  const b = Math.floor(bars);
  if (b < 1) return false;
  return (
    window.toBar - window.fromBar + 1 === b && window.fromBar + b <= total
  );
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
