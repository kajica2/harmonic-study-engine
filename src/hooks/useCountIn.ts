/**
 * src/hooks/useCountIn.ts - PRD-001 Phase 3 Slice 3 (D35).
 *
 * Imperative pre-roll timer for the count-in. Gesture-driven
 * (start()/cancel() are called from the requestPlayState gate in
 * App) - NOT a boot effect, so the PHASE-3-03 StrictMode one-shot
 * rule does not apply; the interval effect is fully cleaned up on
 * cancel/unmount and re-derives its period when tempo (or
 * beatsPerBar) change MID-COUNT, preserving beatsLeft (held in a
 * ref, so an interval restart never skips or repeats a beat).
 *
 * The FIRST beat fires synchronously inside start() (user-gesture
 * context -> the AudioContext is unlocked by the same mousedown that
 * opened the gate); the remaining beats ride the interval. On the
 * final tick the hook self-cancels and calls onComplete() - the
 * gate releases into real playback.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { countInBeats, countInMsPerBeat } from "../lib/countIn";
import { beatsPerMeasureFor } from "../lib/metronomePatterns";
import type { TimeSignature } from "../lib/rhythm";

export interface UseCountInOptions {
  bars: number;
  /** The ACTIVE meter. BOTH the beats-per-bar count and the
   *  ms-per-beat pace are DERIVED here from the meter helpers
   *  (beatsPerMeasureFor / stepsPerBeatFor) - the same beat-unit
   *  source rhythm.ts uses for the grid. FIX ROUND (REVIEWER L3):
   *  the old flat quarter pulse paced compound meters 2x slow vs
   *  the incoming grid while announcing 6/8 eighth-beats. */
  timeSignature: TimeSignature;
  tempo: number;
  /** Fired once per pre-roll beat with the beats remaining
   *  (INCLUDING this one) and whether the beat is a downbeat. */
  onBeat: (beatsLeft: number, isDownbeat: boolean) => void;
  /** Fired exactly once when the pre-roll finishes. */
  onComplete: () => void;
}

export interface UseCountInResult {
  active: boolean;
  beatsLeft: number;
  start: () => void;
  cancel: () => void;
}

export function useCountIn(opts: UseCountInOptions): UseCountInResult {
  const { bars, timeSignature, tempo, onBeat, onComplete } = opts;
  const beatsPerBar = beatsPerMeasureFor(timeSignature);
  const [active, setActive] = useState(false);
  const [beatsLeft, setBeatsLeft] = useState(0);

  const beatsLeftRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Latest-callback / latest-meter refs: the interval never closes
  // over stale props, and tempo/beatsPerBar changes mid-count only
  // re-derive the interval (see the effect below).
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const beatsPerBarRef = useRef(beatsPerBar);
  beatsPerBarRef.current = beatsPerBar;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clearTimer();
    beatsLeftRef.current = 0;
    setBeatsLeft(0);
    setActive(false);
  }, [clearTimer]);

  const start = useCallback(() => {
    clearTimer();
    const sequence = countInBeats(bars, beatsPerBar);
    if (sequence.length === 0) return; // defensive: 0 bars never starts
    beatsLeftRef.current = sequence[0];
    setBeatsLeft(sequence[0]);
    setActive(true);
    // First tick fires NOW (gesture context); the interval effect
    // (active -> true) carries the remaining sequence.
    onBeatRef.current(sequence[0], sequence[0] % beatsPerBar === 0);
  }, [bars, beatsPerBar, clearTimer]);

  useEffect(() => {
    if (!active) return;
    // Meter-correct pacing (fix round, REVIEWER L3): the SAME beat
    // unit the engine runs the grid at (countInMsPerBeat ->
    // stepsPerBeatFor) - quarter beats in simple meters, eighth
    // beats in 6/8 + 7/8. The pre-roll establishes the TEMPO the
    // grid will actually run at (D35); subdivision is still
    // deliberately NOT applied to the pre-roll.
    const msPerBeat = Math.max(
      20,
      countInMsPerBeat(tempo > 0 ? tempo : 60, timeSignature),
    );
    const tick = () => {
      const next = beatsLeftRef.current - 1;
      if (next <= 0) {
        clearTimer();
        beatsLeftRef.current = 0;
        setBeatsLeft(0);
        setActive(false);
        onCompleteRef.current();
        return;
      }
      beatsLeftRef.current = next;
      setBeatsLeft(next);
      const bpb = beatsPerBarRef.current;
      onBeatRef.current(next, bpb > 0 && next % bpb === 0);
    };
    timerRef.current = setInterval(tick, msPerBeat);
    return clearTimer;
  }, [active, tempo, timeSignature, clearTimer]);

  return { active, beatsLeft, start, cancel };
}
