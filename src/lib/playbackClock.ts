/**
 * PlaybackClock — a singleton rAF loop that dispatches a
 * `tick` CustomEvent on `window` for every animation frame, plus
 * a `subscribe(cb)` API for typed consumers.
 *
 * Why a window event:
 *   - Decouples the visual layers (rail, score, canvas, piano)
 *     from the clock. Each layer subscribes in its own way and
 *     can be added/removed without touching the clock.
 *   - One rAF source means one CPU budget — the alternative is
 *     each layer running its own rAF (current state) which
 *     doubles or triples the per-frame cost.
 *   - Subscribers can read the `detail.beat` (0..1 within the
 *     current beat) for smooth animation, or `detail.step` (the
 *     integer chord index from the active path) for snapped UI.
 *
 * Tick detail shape:
 *   {
 *     step:      number   // 0-based chord index (snapped to nearest)
 *     beat:      number   // 0-based beat-within-bar (0..timeSignatureNum)
 *     phase:     number   // 0..1 within the current 16th
 *     timeSec:   number   // wall-clock seconds since clock start
 *     isRunning: boolean // whether the clock is currently advancing
 *   }
 *
 * Pattern lifted from `browser-chart-engine-cdn-loading` skill §5.
 */

import { rhythmEngine } from "./rhythm";

export interface TickDetail {
  step: number;
  beat: number;
  phase: number;
  timeSec: number;
  isRunning: boolean;
}

type TickListener = (detail: TickDetail) => void;

class PlaybackClock {
  private rafId: number | null = null;
  private startMs: number = 0;
  private pausedAt: number = 0;
  private bpm: number = 80;
  private timeSignature: [number, number] = [4, 4];
  private isRunning = false;
  private currentStep = 0;
  private listeners = new Set<TickListener>();
  private lastFrameMs = 0;

  /**
   * Configure the clock. Use this when the active path, tempo, or
   * meter changes — the existing rAF loop picks up the new values
   * on the next frame.
   */
  setTempo(bpm: number) {
    this.bpm = bpm;
  }
  setTimeSignature(num: number, den: number) {
    this.timeSignature = [num, den];
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startMs = performance.now();
    this.pausedAt = 0;
    this.lastFrameMs = this.startMs;
    this.currentStep = 0;
    // Bridge to the existing rhythmEngine so the metronome audio
    // stays in sync. We don't replace its setInterval-based clock;
    // we just call playStep on each new measure, matching its
    // internal `currentStep` model.
    rhythmEngine.start();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.pausedAt = performance.now() - this.startMs;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    rhythmEngine.stop();
    // Final tick so subscribers can render a "stopped" frame
    this.dispatch(/*frozen*/);
  }

  /**
   * Move the playhead to a specific chord step (snapped). Useful
   * for the rail's bar-strip click handler.
   */
  seekToStep(step: number) {
    const totalSec = this.pathDurationSec();
    const targetSec = (step / Math.max(1, this.pathStepCount - 1)) * totalSec;
    this.pausedAt = targetSec * 1000;
    if (this.isRunning) {
      this.startMs = performance.now() - this.pausedAt;
    } else {
      this.startMs = -this.pausedAt;
    }
    this.currentStep = step;
    this.dispatch();
  }

  /**
   * The path needs to know how many steps it has. The App owns the
   * active path; it sets this so the clock can compute totalSec for
   * seek and progress rendering.
   */
  setPathStepCount(n: number) {
    this.pathStepCount = Math.max(1, n);
  }
  private pathStepCount = 1;

  /**
   * Subscribe to tick events. Returns an unsubscribe function.
   */
  subscribe(cb: TickListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // ---- internals ----

  private pathDurationSec(): number {
    // 4 beats per bar; we use 4/4 as the universal converter.
    return (this.pathStepCount * 4 * 60) / this.bpm;
  }

  private tick = (nowMs: number) => {
    if (!this.isRunning) return;
    const elapsedMs = nowMs - this.startMs;
    const dtMs = nowMs - this.lastFrameMs;
    this.lastFrameMs = nowMs;
    void dtMs; // (available for subscribers that want velocity)

    const totalSec = this.pathDurationSec();
    const elapsedSec = (elapsedMs / 1000) % totalSec;
    const beatsPerBar = this.timeSignature[0];
    const secPerBeat = 60 / this.bpm;
    const totalBeats = elapsedSec / secPerBeat;
    const beat = totalBeats % beatsPerBar;
    const stepFloat = (elapsedSec / (secPerBeat * beatsPerBar)) * 4; // 4 = 16ths/bar in 4/4
    // The path-step count is pathStepCount 1-steps; each bar of 4 beats =
    // 1 path step. So stepFloat maps to the bar index within the loop.
    // For finer-grained cross-layer sync, listeners can read `beat`.
    const step = Math.floor(stepFloat) % this.pathStepCount;

    if (step !== this.currentStep) {
      this.currentStep = step;
    }
    this.dispatch({ step, beat, phase: stepFloat - Math.floor(stepFloat), timeSec: elapsedSec, isRunning: true });

    this.rafId = requestAnimationFrame(this.tick);
  };

  private dispatch(overrides?: Partial<TickDetail>) {
    const totalSec = this.pathDurationSec();
    const elapsedMs = this.isRunning
      ? performance.now() - this.startMs
      : this.pausedAt;
    const elapsedSec = (elapsedMs / 1000) % totalSec;
    const beatsPerBar = this.timeSignature[0];
    const secPerBeat = 60 / this.bpm;
    const totalBeats = elapsedSec / secPerBeat;
    const detail: TickDetail = {
      step: this.currentStep,
      beat: totalBeats % beatsPerBar,
      phase: 0,
      timeSec: elapsedSec,
      isRunning: this.isRunning,
      ...overrides,
    };
    this.listeners.forEach((cb) => {
      try {
        cb(detail);
      } catch (e) {
        console.error("playbackClock listener failed:", e);
      }
    });
    // Also dispatch a window event so devtools can see it and
    // optional 3rd-party code can subscribe without an import.
    try {
      window.dispatchEvent(
        new CustomEvent("tick", { detail }),
      );
    } catch {
      // Some environments disallow CustomEvent — listener path still works.
    }
  }
}

export const playbackClock = new PlaybackClock();