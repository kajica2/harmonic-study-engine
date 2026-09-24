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
