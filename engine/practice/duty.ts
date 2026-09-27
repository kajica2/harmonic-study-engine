/**
 * engine/practice/duty.ts - PRD-001 Phase 7 S2 (D122/D123): the pure
 * next-measure scheduler for the practice mechanics drills.
 *
 * ORCHESTRATOR RATIFICATION (D123 deviation, approved before task 1):
 * the parent sketch (docs/PHASE-7-PRACTICE.md section 4) said "windows.ts
 * grows a scheduler". That instruction is SUPERSEDED: windows.ts stays
 * BYTE-UNTOUCHED as the GEOMETRY module (its 14 pins are S1's regression
 * floor), and the per-firing DUTY scheduler lives in this new file. The
 * concern split is geometry vs duty; duty.ts imports BarWindow/clamp
 * law from ./windows and widens nothing there. Purity floor 51 -> 53
 * counts this file + ramp.ts (engine/purity.test.ts, D123).
 *
 * The model (one call per onMeasureStart firing, App.tsx handler):
 *   advanceTransport({ prevStep, barCounter, formLen, totalSteps,
 *                      mode, loop, pause, ab })
 *     -> { nextStep, phase, activeWindow, dutyIndex, passCompleted,
 *          spanFromStep, spanToStep }
 *
 * Laws (pinned in duty.test.ts, section 2 of PHASE-7-S2-MECHANICS.md):
 *   1 CONTAINMENT   nextStep always in [spanFromStep, spanToStep).
 *   2 EQUIVALENCE   mode "loop" == the shipped F3 branch (the test
 *                   re-implements the 6 handler lines as the oracle).
 *   3 PAUSE         duty over the span: phase = (k % (N+M)) < N ? play
 *                   : rest. Bar 1 after the count-in is ALWAYS play
 *                   (the caller resets the counter on the isPlayingAuto
 *                   TRUE edge; dutyIndex 0 < N). The transport NEVER
 *                   stops during rest - the drill rests IN TIME.
 *   4 AB            slot = floor(k / swapBars) % 2; flips every
 *                   swapBars firings; on a slot change nextStep jumps
 *                   to the new window's head (bar-aligned, inside the
 *                   handler - never mid-bar). Windows MAY overlap.
 *   5 PASS          passCompleted iff (loop/pause) wrapped from the
 *                   span tail to the head; iff (ab) slot change.
 *   6 SPAN          pause span = loop window ?? [0, formLen) - the
 *                   FORM, never the padded repeat. AB windows are
 *                   clampWindow'd at READ (write-side clamp lives in
 *                   the App/store). Degenerate configs (null cfg for
 *                   an engaged mode) fall back to loop law, never
 *                   crash.
 *   7 PURE          no clock, no rng, no Date; integer-guarded. The
 *                   safeInt pattern is duplicated locally on purpose -
 *                   engine-internal duplication is cheaper than
 *                   widening windows.ts's exports (law 7, D123).
 */

import type { BarWindow } from "./windows";
import { clampWindow, totalFormBars } from "./windows";

export type MechanicsMode = "off" | "loop" | "pause" | "ab";
export type DutyPhase = "play" | "rest";
export type AbSlot = "a" | "b";

/** Pause duty cycle: N play bars then M rest bars, each >= 1. */
export interface PauseConfig {
  playBars: number;
  restBars: number;
}

/** A/B compare: two windows + the swap interval in bars, >= 1. */
export interface AbConfig {
  a: BarWindow;
  b: BarWindow;
  swapBars: number;
}

export interface TransportInput {
  /** activeStepIndexRef.current - the step the bar that just played held. */
  prevStep: number;
  /** Handler firings since play-start (>= 1 at the first call; the
   *  play-start edge itself is counter 0 = the initial play/A state). */
  barCounter: number;
  /** detectFormPeriod(path.steps) - the honest form length. */
  formLen: number;
  /** Padded path length (carried for API completeness; the step law
   *  spans the FORM, not the pad - law 6). */
  totalSteps: number;
  mode: Exclude<MechanicsMode, "off">;
  /** Legacy loop window (loopStartBar/loopEndBar snapshot); null = the
   *  whole-form span. */
  loop: BarWindow | null;
  /** Pause config; null while pause is engaged = loop-law fallback. */
  pause: PauseConfig | null;
  /** AB config; null while ab is engaged = loop-law fallback. */
  ab: AbConfig | null;
}

export interface TransportDecision {
  /** The step the NEXT bar plays. */
  nextStep: number;
  /** "play" for loop/ab; the duty phase for pause. */
  phase: DutyPhase;
  /** ab only: the active slot; null otherwise. */
  activeWindow: AbSlot | null;
  /** pause only: barCounter % (N+M); 0 otherwise. */
  dutyIndex: number;
  /** Wrapped to the span head (loop/pause) or slot change (ab). */
  passCompleted: boolean;
  /** Effective clamped span [from, to) - UI band + S3 seam. */
  spanFromStep: number;
  spanToStep: number;
}

/** Mirror of windows.ts's guard (law 7: local duplication is cheaper
 *  than widening the geometry module's exports). */
function safeInt(n: number): number {
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

/** The shipped loop step law over a resolved [fromStep, toStep) span:
 *  wrap at the tail, snap forward when outside, else advance. This is
 *  the single implementation behind mode loop (equivalence pin #2) and
 *  the fallback for every degenerate config (law 6). */
function loopStep(
  prev: number,
  fromStep: number,
  toStep: number,
): { nextStep: number; wrapped: boolean } {
  if (prev + 1 >= toStep) return { nextStep: fromStep, wrapped: true };
  if (prev < fromStep) return { nextStep: fromStep, wrapped: false };
  return { nextStep: prev + 1, wrapped: false };
}

/** Resolve the loop/pause span: loop window ?? [0, formLen), clamped. */
function spanFor(
  loop: BarWindow | null,
  formLen: number,
): { fromStep: number; toStep: number } {
  const total = totalFormBars(formLen);
  if (loop === null) return { fromStep: 0, toStep: total };
  const c = clampWindow(loop, formLen);
  return { fromStep: c.fromBar, toStep: c.toBar + 1 };
}

/**
 * The pure next-measure decision. Called exactly once per onMeasureStart
 * firing while mechanics are engaged (D123); with mode "off" or the
 * runner active the App handler never calls this (byte-identical legacy
 * branches, D125 guard).
 */
export function advanceTransport(d: TransportInput): TransportDecision {
  const prev = safeInt(d.prevStep);
  const k = Math.max(0, safeInt(d.barCounter));

  // --- mode ab: two windows, alternating every swapBars firings ------
  if (d.mode === "ab" && d.ab !== null) {
    const a = clampWindow(d.ab.a, d.formLen);
    const b = clampWindow(d.ab.b, d.formLen);
    const swap = Math.max(1, safeInt(d.ab.swapBars));
    const slotOf = (n: number): AbSlot =>
      Math.floor(n / swap) % 2 === 0 ? "a" : "b";
    const slot = slotOf(k);
    // A slot change is the ONLY pass source in ab (law 5). k = 0 is the
    // play-start state: no pass, no jump (the cursor is already live).
    const changed = k > 0 && slot !== slotOf(k - 1);
    const w = slot === "a" ? a : b;
    const fromStep = w.fromBar;
    const toStep = w.toBar + 1;
    const nextStep = changed
      ? fromStep // bar-aligned jump to the new window head
      : loopStep(prev, fromStep, toStep).nextStep; // within-segment law
    return {
      nextStep,
      phase: "play",
      activeWindow: slot,
      dutyIndex: 0,
      passCompleted: changed,
      spanFromStep: fromStep,
      spanToStep: toStep,
    };
  }

  // --- modes loop + pause (and every degenerate fallback): the span ---
  const span = spanFor(d.loop, d.formLen);
  const fromStep = span.fromStep;
  const toStep = span.toStep;

  let phase: DutyPhase = "play";
  let dutyIndex = 0;
  if (d.mode === "pause" && d.pause !== null) {
    const n = Math.max(1, safeInt(d.pause.playBars));
    const m = Math.max(1, safeInt(d.pause.restBars));
    dutyIndex = k % (n + m);
    phase = dutyIndex < n ? "play" : "rest";
  }
  // pause with null config (law 6): loop-law fallback, phase play.

  const stepped = loopStep(prev, fromStep, toStep);
  return {
    nextStep: stepped.nextStep,
    phase,
    activeWindow: null,
    dutyIndex,
    passCompleted: stepped.wrapped,
    spanFromStep: fromStep,
    spanToStep: toStep,
  };
}
